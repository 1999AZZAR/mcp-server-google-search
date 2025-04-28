import dotenv from 'dotenv';
dotenv.config();
import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { collectDefaultMetrics, Counter, Histogram, register } from 'prom-client';
import { LRUCache } from 'lru-cache';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import CircuitBreaker from 'opossum';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
collectDefaultMetrics();
// Prometheus metrics: errors and circuit-breaker events
const redisFailureCounter = new Counter({ name: 'redis_failures_total', help: 'Total Redis failures' });
const googleErrorCounter = new Counter({ name: 'google_errors_total', help: 'Total Google search errors' });
const breakerOpenCounter = new Counter({ name: 'breaker_open_total', help: 'Circuit breaker opens' });
const breakerHalfOpenCounter = new Counter({ name: 'breaker_halfopen_total', help: 'Circuit breaker half-opens' });
const breakerCloseCounter = new Counter({ name: 'breaker_close_total', help: 'Circuit breaker closes' });

// Global error handlers
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Rejection', reason);
});
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', error);
});
const searchCounter = new Counter({ name: 'search_requests_total', help: 'Total search requests' });
const cacheHitCounter = new Counter({ name: 'cache_hits_total', help: 'Cache hits' });
const cacheMissCounter = new Counter({ name: 'cache_misses_total', help: 'Cache misses' });
const requestDuration = new Histogram({ name: 'search_request_duration_seconds', help: 'Search request latency in seconds', buckets: [0.1,0.5,1,2,5] });
const lruCache = new LRUCache({ max: parseInt(process.env.LRU_CACHE_SIZE || '500', 10) });

// Ensure required env vars
if (!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_CSE_ID) {
  logger.error('Missing GOOGLE_API_KEY or GOOGLE_CSE_ID in .env');
  process.exit(1);
}
const API_KEY = process.env.GOOGLE_API_KEY!;
const CSE_ID = process.env.GOOGLE_CSE_ID!;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '3600', 10);

// Create Redis client with no auto-reconnect to prevent error spam
const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: () => new Error('Redis unavailable')
  }
});
redisClient.on('error', (err: Error) => { logger.error('Redis Client Error', err); redisFailureCounter.inc(); });

// Toggle caching based on Redis connectivity
let cacheEnabled = true;

// Configure axios with retry/backoff
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: axiosRetry.isNetworkOrIdempotentRequestError,
});

// Circuit breaker for Google Search API
const breakerOptions = {
  timeout: parseInt(process.env.CB_TIMEOUT_MS || '5000', 10),
  errorThresholdPercentage: parseInt(process.env.CB_ERROR_THRESHOLD || '50', 10),
  resetTimeout: parseInt(process.env.CB_RESET_TIMEOUT_MS || '30000', 10),
};
const searchBreaker = new CircuitBreaker((params: Record<string, string>) =>
  axios.get('https://www.googleapis.com/customsearch/v1', { params }),
  breakerOptions
);
searchBreaker.fallback(() => Promise.reject(new Error('Google Search unavailable')));
searchBreaker.on('open', () => { logger.warn('Circuit breaker open: Google Search'); breakerOpenCounter.inc(); });
searchBreaker.on('halfOpen', () => { logger.info('Circuit breaker half-open: Google Search'); breakerHalfOpenCounter.inc(); });
searchBreaker.on('close', () => { logger.info('Circuit breaker closed: Google Search'); breakerCloseCounter.inc(); });

async function main() {
  try {
    await redisClient.connect();
    logger.info('Connected to Redis');
  } catch (err) {
    logger.warn('Redis connection failed, caching disabled', err);
    cacheEnabled = false;
    // Disconnect to stop any retry attempts
    redisClient.disconnect().catch(() => {});
  }

  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => { req.id = uuidv4(); next(); });
  app.use(pinoHttp({ logger, genReqId: (req: Request) => req.id }));

  // Health check for MCP initialization
  app.get('/health', (_req: Request, res: Response) => res.sendStatus(200));
  // Readiness check (verifies Redis & Google API)
  app.get('/ready', async (_req: Request, res: Response) => {
    const checks: Record<string, string> = {};
    let allOk = true;
    if (cacheEnabled) {
      try { await redisClient.ping(); checks.redis = 'ok'; } catch (e: unknown) { checks.redis = 'failed'; allOk = false; redisFailureCounter.inc(); }
    } else { checks.redis = 'disabled'; }
    try {
      await axios.get('https://www.googleapis.com/customsearch/v1', { params: { key: API_KEY, cx: CSE_ID, q: 'healthcheck' }, timeout: 2000 });
      checks.google = 'ok';
    } catch (e: unknown) { checks.google = 'failed'; allOk = false; googleErrorCounter.inc(); }
    res.status(allOk ? 200 : 503).json({ checks });
  });
  // Root endpoint
  app.get('/', (_req: Request, res: Response) => res.json({status: 'ok'}));
  app.use(bodyParser.json());

  // Swagger UI documentation
  const swaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Google Search MCP', version: '1.0.0' },
    servers: [{ url: `http://localhost:${process.env.PORT||3000}` }],
    paths: {
      '/health': { get: { summary: 'Health Check', responses: { '200': { description: 'OK' } } } },
      '/ready': { get: { summary: 'Readiness Check', responses: { '200': { description: 'Ready' }, '503': { description: 'Service Unavailable' } } } },
      '/': { get: { summary: 'Root', responses: { '200': { description: 'OK' } } } },
      '/search': { get: { summary: 'Search endpoint', parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/filters': { get: { summary: 'Filters list', responses: { '200': { description: 'OK' } } } },
      '/tools': { get: { summary: 'Tools list', responses: { '200': { description: 'OK' } } } },
      '/metrics': { get: { summary: 'Prometheus metrics', responses: { '200': { description: 'Metrics', content: { 'text/plain': { schema: { type: 'string' } } } } } } },
    },
  };
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Metrics endpoint
  app.get('/metrics', async (_req: Request, res: Response) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // Rate limiting
  const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  const MAX_REQ = parseInt(process.env.RATE_LIMIT_MAX || '30', 10);
  app.use(
    rateLimit({ windowMs: WINDOW_MS, max: MAX_REQ, standardHeaders: true, legacyHeaders: false })
  );

  // Filters
  const VALID_FILTERS = ['searchType','fileType','siteSearch','dateRestrict','safe','exactTerms','excludeTerms','sort','gl','hl','num','start'] as const;
  type FilterName = typeof VALID_FILTERS[number];
  const FILTER_DESCRIPTIONS: Record<FilterName, string> = {
    searchType: 'Restrict results to a type (e.g. "image")',
    fileType: 'Restrict results to a specific file type (e.g. "pdf")',
    siteSearch: 'Restrict results to a specific site',
    dateRestrict: 'Restrict by date (e.g. "d[number]","w[number]","m[number]","y[number]")',
    safe: 'Safe search level (off, medium, high)',
    exactTerms: 'Terms that must appear',
    excludeTerms: 'Terms to exclude',
    sort: 'Sort by (e.g. "date")',
    gl: 'Geolocation country code (e.g. "us")',
    hl: 'Interface language (e.g. "en")',
    num: 'Number of results to return',
    start: 'Index of first result'
  };

  // Zod schema for /search query validation
  const searchQuerySchema = z.object({
    q: z.string().nonempty(),
    searchType: z.string().optional(),
    fileType: z.string().optional(),
    siteSearch: z.string().optional(),
    dateRestrict: z.string().optional(),
    safe: z.string().optional(),
    exactTerms: z.string().optional(),
    excludeTerms: z.string().optional(),
    sort: z.string().optional(),
    gl: z.string().optional(),
    hl: z.string().optional(),
    num: z.string().optional(),
    start: z.string().optional(),
  });
  function validateSearchQuery(req: Request, res: Response, next: NextFunction) {
    const result = searchQuerySchema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }));
      return res.status(400).json({ error: 'Invalid query', details });
    }
    // assign parsed data back
    // @ts-ignore
    req.query = result.data;
    next();
  }

  // Search endpoint with validation and caching
  app.get('/search', validateSearchQuery, async (req: Request, res: Response) => {
    searchCounter.inc();
    const end = requestDuration.startTimer();
    const q = req.query.q as string | undefined;
    if (!q) return res.status(400).json({ error: 'Query param q is required' });
    const params: Record<string, string> = { key: API_KEY, cx: CSE_ID, q };
    VALID_FILTERS.forEach(filter => {
      const val = req.query[filter];
      if (typeof val === 'string') params[filter] = val;
    });
    const cacheKey = `search:${JSON.stringify(params)}`;
    try {
      if (cacheEnabled) {
        try {
          const cached = await redisClient.get(cacheKey);
          if (cached) {
            cacheHitCounter.inc();
            res.json(JSON.parse(cached));
            end();
            // background refresh
            void (async () => {
              try {
                const resp = await searchBreaker.fire(params);
                await redisClient.set(cacheKey, JSON.stringify(resp.data), { EX: CACHE_TTL });
              } catch (e: unknown) { logger.warn('Background refresh failed', e); }
            })();
            return;
          }
        } catch (e: unknown) { logger.warn('Redis GET failed', e); }
      }
      // fallback LRU cache
      const cachedLRU = lruCache.get(cacheKey);
      if (cachedLRU) {
        cacheHitCounter.inc();
        res.json(cachedLRU);
        end();
        void (async () => {
          try {
            const resp = await searchBreaker.fire(params);
            lruCache.set(cacheKey, resp.data);
          } catch (e: unknown) { logger.warn('Background refresh failed', e); }
        })();
        return;
      }
      cacheMissCounter.inc();
      const response = await searchBreaker.fire(params);
      if (cacheEnabled) await redisClient.set(cacheKey, JSON.stringify(response.data), { EX: CACHE_TTL });
      else lruCache.set(cacheKey, response.data);
      res.json(response.data);
      end();
    } catch (err: unknown) {
      logger.error('Search error', err);
      googleErrorCounter.inc();
      end();
      return res.status(500).json({ error: (err as Error).toString() });
    }
  });

  // Filters list
  app.get('/filters', (req: Request, res: Response) => {
    const filters = VALID_FILTERS.map(name => ({ name, description: FILTER_DESCRIPTIONS[name] }));
    res.json({ filters });
  });

  // Tools list
  app.get('/tools', (req: Request, res: Response) => {
    const parameters: Record<string, string> = { q: 'string' };
    VALID_FILTERS.forEach(name => (parameters[name] = 'string'));
    res.json({
      tools: [{
        name: 'search',
        method: 'GET',
        path: '/search',
        description: 'Perform a Google Custom Search with optional filters',
        parameters
      }]
    });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // Error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error in request', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  const server = app.listen(port, () => logger.info(`Server listening on http://localhost:${port}`));

  // Graceful shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  function shutdown() {
    logger.info('Shutting down gracefully...');
    server.close(() => {
      logger.info('HTTP server closed');
      redisClient.disconnect()
        .then(() => { logger.info('Redis client disconnected'); process.exit(0); })
        .catch((err: Error) => { logger.error('Error during Redis disconnect', err); process.exit(1); });
    });
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  }
}

main().catch((err: unknown) => {
  logger.error('Failed to start', err);
  process.exit(1);
});
