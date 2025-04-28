import dotenv from 'dotenv';
dotenv.config();
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';

// Ensure required env vars
if (!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_CSE_ID) {
  console.error('Missing GOOGLE_API_KEY or GOOGLE_CSE_ID in .env');
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
redisClient.on('error', err => console.error('Redis Client Error', err));

// Toggle caching based on Redis connectivity
let cacheEnabled = true;

async function main() {
  try {
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (err) {
    console.warn('Redis connection failed, caching disabled', err);
    cacheEnabled = false;
    // Disconnect to stop any retry attempts
    redisClient.disconnect().catch(() => {});
  }

  const app = express();
  app.use(bodyParser.json());

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
          if (cached) return res.json(JSON.parse(cached));
        } catch (err) {
          console.warn('Redis GET failed, skipping cache', err);
        }
      }
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', { params });
      if (cacheEnabled) {
        try {
          await redisClient.set(cacheKey, JSON.stringify(response.data), { EX: CACHE_TTL });
        } catch (err) {
          console.warn('Redis SET failed, skipping cache write', err);
        }
      }
      return res.json(response.data);
    } catch (err) {
      console.error(err);
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

  const port = parseInt(process.env.PORT || '3000', 10);
  app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
}

main().catch(err => {
  console.error('Failed to start', err);
  process.exit(1);
});
