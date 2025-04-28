import dotenv from 'dotenv';
dotenv.config();
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { collectDefaultMetrics, Counter, Histogram, register } from 'prom-client';
import { LRUCache } from 'lru-cache';
import swaggerUi from 'swagger-ui-express';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
collectDefaultMetrics();
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
redisClient.on('error', err => logger.error('Redis Client Error', err));

// Toggle caching based on Redis connectivity
let cacheEnabled = true;

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
  app.use(pinoHttp({ logger }));

  // Health check for MCP initialization
  app.get('/health', (_req: Request, res: Response) => res.sendStatus(200));
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
      '/': { get: { summary: 'Root', responses: { '200': { description: 'OK' } } } },
      '/search': { get: { summary: 'Search endpoint', parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/filters': { get: { summary: 'Filters list', responses: { '200': { description: 'OK' } } } },
      '/tools': { get: { summary: 'Tools list', responses: { '200': { description: 'OK' } } } },
      '/metrics': { get: { summary: 'Prometheus metrics', responses: { '200': { description: 'Metrics', content: { 'text/plain': { schema: { type: 'string' } } } } } } }
    }
  };
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Metrics endpoint
  app.get('/metrics', async (_req, res) => {
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

  // Search endpoint with caching
  app.get('/search', async (req: Request, res: Response) => {
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
                const resp = await axios.get('https://www.googleapis.com/customsearch/v1', { params });
                await redisClient.set(cacheKey, JSON.stringify(resp.data), { EX: CACHE_TTL });
              } catch (e) { logger.warn('Background refresh failed', e); }
            })();
            return;
          }
        } catch (e) { logger.warn('Redis GET failed', e); }
      }
      // fallback LRU cache
      const cachedLRU = lruCache.get(cacheKey);
      if (cachedLRU) {
        cacheHitCounter.inc();
        res.json(cachedLRU);
        end();
        void (async () => {
          try {
            const resp = await axios.get('https://www.googleapis.com/customsearch/v1', { params });
            lruCache.set(cacheKey, resp.data);
          } catch (e) { logger.warn('Background refresh failed', e); }
        })();
        return;
      }
      cacheMissCounter.inc();
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', { params });
      if (cacheEnabled) await redisClient.set(cacheKey, JSON.stringify(response.data), { EX: CACHE_TTL });
      else lruCache.set(cacheKey, response.data);
      res.json(response.data);
      end();
    } catch (err) {
      logger.error('Search error', err);
      return res.status(500).json({ error: (err as Error).toString() });
      end();
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

  const port = parseInt(process.env.PORT || '3000', 10);
  app.listen(port, () => logger.info(`Server listening on http://localhost:${port}`));
}

main().catch(err => {
  logger.error('Failed to start', err);
  process.exit(1);
});
