import express, { Request, Response, NextFunction, Application } from 'express';
import cors from 'cors';
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
import config from './config';
import { ApolloServer } from 'apollo-server-express';
import { GraphQLSchema, GraphQLObjectType, GraphQLString, GraphQLList, GraphQLNonNull } from 'graphql';
import GraphQLJSON from 'graphql-type-json';
import { ApolloServerPluginLandingPageLocalDefault } from 'apollo-server-core';

declare global {
  namespace Express {
    interface Request { id: string; }
  }
}

// Logger & metrics
export const logger = pino({ level: config.LOG_LEVEL });
collectDefaultMetrics();
export const redisFailureCounter = new Counter({ name: 'redis_failures_total', help: 'Total Redis failures' });
const googleErrorCounter = new Counter({ name: 'google_errors_total', help: 'Total Google search errors' });
const breakerOpenCounter = new Counter({ name: 'breaker_open_total', help: 'Circuit breaker opens' });
const breakerHalfOpenCounter = new Counter({ name: 'breaker_halfopen_total', help: 'Circuit breaker half-opens' });
const breakerCloseCounter = new Counter({ name: 'breaker_close_total', help: 'Circuit breaker closes' });
const searchCounter = new Counter({ name: 'search_requests_total', help: 'Total search requests' });
const cacheHitCounter = new Counter({ name: 'cache_hits_total', help: 'Cache hits' });
const cacheMissCounter = new Counter({ name: 'cache_misses_total', help: 'Cache misses' });
const requestDuration = new Histogram({ name: 'search_request_duration_seconds', help: 'Search request latency in seconds', buckets: [0.1, 0.5, 1, 2, 5] });

// Caching
let cacheEnabled = true;
const lruCache = new LRUCache({ max: config.LRU_CACHE_SIZE });

// Redis client
export const redisClient = createClient({
  url: config.REDIS_URL,
  socket: { reconnectStrategy: () => new Error('Redis unavailable') }
});
redisClient.on('error', (err: Error) => { logger.error('Redis Client Error', err); redisFailureCounter.inc(); });

// HTTP retry and circuit breaker
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay, retryCondition: axiosRetry.isNetworkOrIdempotentRequestError });
const breakerOptions = { timeout: config.CB_TIMEOUT_MS, errorThresholdPercentage: config.CB_ERROR_THRESHOLD, resetTimeout: config.CB_RESET_TIMEOUT_MS };
const searchBreaker = new CircuitBreaker((params: Record<string, string>) => axios.get('https://www.googleapis.com/customsearch/v1', { params }), breakerOptions);
searchBreaker.fallback(() => Promise.reject(new Error('Google Search unavailable')));
searchBreaker.on('open', () => { logger.warn('Circuit breaker open'); breakerOpenCounter.inc(); });
searchBreaker.on('halfOpen', () => { logger.info('Circuit breaker half-open'); breakerHalfOpenCounter.inc(); });
searchBreaker.on('close', () => { logger.info('Circuit breaker closed'); breakerCloseCounter.inc(); });

// Express app
const app: Application = express();
app.use(cors());
app.use((req: Request, _res: Response, next: NextFunction) => { req.id = uuidv4(); next(); });
app.use(pinoHttp({ logger, genReqId: (req: Request) => req.id }));
app.use(bodyParser.json());
app.use(rateLimit({ windowMs: config.RATE_LIMIT_WINDOW_MS, max: config.RATE_LIMIT_MAX, standardHeaders: true, legacyHeaders: false }));

// Async wrapper & error handler
function wrapAsync(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  logger.error({ err }, 'Unhandled error in request');
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({ code: statusCode, message: err.message || 'Internal Server Error', details: err.details || null });
}

// Swagger setup
const swaggerSpec = {
  openapi: '3.0.0',
  info: { title: 'Google Search MCP', version: '1.0.0' },
  servers: [{ url: `http://localhost:${config.PORT}` }],
  paths: {
    '/health': {
      get: {
        summary: 'Health Check',
        responses: {
          '200': { description: 'OK - alive', content: { 'text/plain': { schema: { type: 'string', example: 'OK' } } } }
        }
      }
    },
    '/ready': {
      get: {
        summary: 'Readiness Check',
        responses: {
          '200': { description: 'All systems ready', content: { 'application/json': { schema: { type: 'object', properties: { checks: { type: 'object' } } } } } },
          '503': { description: 'Service Unavailable', content: { 'application/json': { schema: { type: 'object', properties: { checks: { type: 'object' } } } } } }
        }
      }
    },
    '/': {
      get: {
        summary: 'Root status',
        responses: {
          '200': { description: 'Service status', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } } } } }
        }
      }
    },
    '/search': {
      get: {
        summary: 'Search endpoint',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'searchType', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'fileType', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'siteSearch', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'dateRestrict', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'safe', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'exactTerms', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'excludeTerms', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'sort', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'gl', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'hl', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'num', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'start', in: 'query', required: false, schema: { type: 'string' } }
        ],
        responses: {
          '200': { description: 'Search results', content: { 'application/json': { schema: { type: 'object' } } } },
          '400': { description: 'Invalid query', content: { 'application/json': { schema: { type: 'object' } } } },
          '500': { description: 'Internal server error', content: { 'application/json': { schema: { type: 'object' } } } }
        }
      }
    },
    '/filters': {
      get: {
        summary: 'Filters list',
        responses: {
          '200': {
            description: 'List of filters',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    filters: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { name: { type: 'string' } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/tools': {
      get: {
        summary: 'Tools list',
        responses: {
          '200': {
            description: 'List of tools',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tools: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          method: { type: 'string' },
                          path: { type: 'string' },
                          description: { type: 'string' },
                          parameters: { type: 'object' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/metrics': {
      get: {
        summary: 'Prometheus metrics',
        responses: {
          '200': { description: 'Metrics text', content: { 'text/plain': { schema: { type: 'string' } } } }
        }
      }
    },
    '/graphql': {
      post: {
        summary: 'GraphQL endpoint',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { query: { type: 'string' }, variables: { type: 'object' } }, required: ['query'] }
            }
          }
        },
        responses: {
          '200': { description: 'GraphQL response', content: { 'application/json': { schema: { type: 'object' } } } }
        }
      },
      get: {
        summary: 'GraphiQL UI',
        responses: {
          '200': { description: 'GraphiQL interactive UI' }
        }
      }
    }
  }
};

// GraphQL schema & endpoint
const gqlQuery = new GraphQLObjectType({
  name: 'Query',
  fields: {
    search: {
      type: GraphQLJSON,
      args: {
        q: { type: new GraphQLNonNull(GraphQLString) },
        searchType: { type: GraphQLString },
        fileType: { type: GraphQLString },
        siteSearch: { type: GraphQLString },
        dateRestrict: { type: GraphQLString },
        safe: { type: GraphQLString },
        exactTerms: { type: GraphQLString },
        excludeTerms: { type: GraphQLString },
        sort: { type: GraphQLString },
        gl: { type: GraphQLString },
        hl: { type: GraphQLString },
        num: { type: GraphQLString },
        start: { type: GraphQLString }
      },
      resolve: async (_src: unknown, args: Record<string, unknown>): Promise<any> => {
        const params: Record<string, string> = { key: config.GOOGLE_API_KEY, cx: config.GOOGLE_CSE_ID, q: args.q as string };
        Object.entries(args).forEach(([k, v]) => { if (k !== 'q' && typeof v === 'string') params[k] = v; });
        const { data } = await searchBreaker.fire(params);
        return data;
      }
    },
    filters: { type: new GraphQLList(GraphQLString), resolve: () => VALID_FILTERS },
    tools: {
      type: GraphQLJSON,
      resolve: () => ({ tools: TOOLS_INFO })
    }
  }
});
const gqlSchema = new GraphQLSchema({ query: gqlQuery });
const apolloServer = new ApolloServer({
  schema: gqlSchema,
  introspection: true,
  plugins: [ApolloServerPluginLandingPageLocalDefault()],
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Tool definitions
const TOOLS_INFO = [
  {
    name: 'search', method: 'GET', path: '/search',
    description: 'Perform a Google Custom Search with optional filters',
    parameters: { q: 'string', searchType: 'string', fileType: 'string', siteSearch: 'string', dateRestrict: 'string', safe: 'string', exactTerms: 'string', excludeTerms: 'string', sort: 'string', gl: 'string', hl: 'string', num: 'string', start: 'string' }
  },
  {
    name: 'searchFileType', method: 'GET', path: '/search',
    description: 'Search only specific file types', parameters: { q: 'string', fileType: 'string' }
  },
  {
    name: 'searchAndExtract', method: 'GET', path: '/search-and-extract',
    description: 'Perform a search then extract main content from results', parameters: { q: 'string', extract: 'boolean' }
  }
] as const;

// Validation schema
const VALID_FILTERS = ['searchType', 'fileType', 'siteSearch', 'dateRestrict', 'safe', 'exactTerms', 'excludeTerms', 'sort', 'gl', 'hl', 'num', 'start'] as const;
type FilterName = typeof VALID_FILTERS[number];
const searchQuerySchema = z.object({
  q: z.string().nonempty(), searchType: z.string().optional(), fileType: z.string().optional(), siteSearch: z.string().optional(),
  dateRestrict: z.string().optional(), safe: z.string().optional(), exactTerms: z.string().optional(), excludeTerms: z.string().optional(),
  sort: z.string().optional(), gl: z.string().optional(), hl: z.string().optional(), num: z.string().optional(), start: z.string().optional(),
});
function validateSearchQuery(req: Request, res: Response, next: NextFunction) {
  const result = searchQuerySchema.safeParse(req.query);
  if (!result.success) {
    const details = result.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }));
    return res.status(400).json({ code: 400, message: 'Invalid query', details });
  }
  req.query = result.data;
  next();
}

// Routes
app.get('/health', (_req, res) => res.sendStatus(200));
app.get('/ready', wrapAsync(async (_req, res) => {
  const checks: Record<string, string> = {};
  let allOk = true;
  if (cacheEnabled) {
    try { await redisClient.ping(); checks.redis = 'ok'; } catch (e) { checks.redis = 'failed'; allOk = false; redisFailureCounter.inc(); }
  } else { checks.redis = 'disabled'; }
  try { await axios.get('https://www.googleapis.com/customsearch/v1', { params: { key: config.GOOGLE_API_KEY, cx: config.GOOGLE_CSE_ID, q: 'healthcheck' }, timeout: 2000 }); checks.google = 'ok'; }
  catch { checks.google = 'failed'; allOk = false; googleErrorCounter.inc(); }
  res.status(allOk ? 200 : 503).json({ checks });
}));
app.get('/', (_req, res) => res.json({ status: 'ok' }));
app.get('/search', validateSearchQuery, wrapAsync(async (req, res) => {
  searchCounter.inc(); const end = requestDuration.startTimer();
  const { q } = req.query as Record<string, string>;
  const params: Record<string, string> = { key: config.GOOGLE_API_KEY, cx: config.GOOGLE_CSE_ID, q };
  VALID_FILTERS.forEach(f => { const v = req.query[f]; if (typeof v === 'string') params[f] = v; });
  const cacheKey = `search:${JSON.stringify(params)}`;
  if (cacheEnabled) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) { cacheHitCounter.inc(); res.json(JSON.parse(cached)); end();
        void (async () => { try { const r = await searchBreaker.fire(params); await redisClient.set(cacheKey, JSON.stringify(r.data), { EX: config.CACHE_TTL }); } catch { } })();
        return;
      }
    } catch { }
  }
  const lru = lruCache.get(cacheKey);
  if (lru) { cacheHitCounter.inc(); res.json(lru); end(); void (async () => { try { const r = await searchBreaker.fire(params); lruCache.set(cacheKey, r.data); } catch { } })(); return; }
  cacheMissCounter.inc(); const resp = await searchBreaker.fire(params);
  if (cacheEnabled) await redisClient.set(cacheKey, JSON.stringify(resp.data), { EX: config.CACHE_TTL }); else lruCache.set(cacheKey, resp.data);
  res.json(resp.data); end();
}));
app.get('/filters', (_req, res) => res.json({ filters: VALID_FILTERS.map(f => ({ name: f })) }));
app.get('/tools', (_req, res) => res.json({ tools: TOOLS_INFO }));
app.get('/metrics', async (_req, res) => { res.set('Content-Type', register.contentType); res.end(await register.metrics()); });

// App initializer
export async function createApp() {
  try { await redisClient.connect(); logger.info('Connected to Redis'); }
  catch (e) { logger.warn('Redis connect failed, disabling cache', e); cacheEnabled = false; await redisClient.disconnect(); }
  // Mount Apollo GraphQL middleware
  await apolloServer.start();
  apolloServer.applyMiddleware({ app: app as any, path: '/graphql' });
  // 404 & error handlers after all routes
  app.use((_, res) => res.status(404).json({ code: 404, message: 'Not Found' }));
  app.use(errorHandler);
  return app;
}
