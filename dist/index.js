"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const axios_1 = __importDefault(require("axios"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const redis_1 = require("redis");
// Ensure required env vars
if (!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_CSE_ID) {
    console.error('Missing GOOGLE_API_KEY or GOOGLE_CSE_ID in .env');
    process.exit(1);
}
const API_KEY = process.env.GOOGLE_API_KEY;
const CSE_ID = process.env.GOOGLE_CSE_ID;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '3600', 10);
const redisClient = (0, redis_1.createClient)({ url: REDIS_URL });
redisClient.on('error', err => console.error('Redis Client Error', err));
async function main() {
    await redisClient.connect();
    const app = (0, express_1.default)();
    app.use(body_parser_1.default.json());
    // Rate limiting
    const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
    const MAX_REQ = parseInt(process.env.RATE_LIMIT_MAX || '30', 10);
    app.use((0, express_rate_limit_1.default)({ windowMs: WINDOW_MS, max: MAX_REQ, standardHeaders: true, legacyHeaders: false }));
    // Filters
    const VALID_FILTERS = ['searchType', 'fileType', 'siteSearch', 'dateRestrict', 'safe', 'exactTerms', 'excludeTerms', 'sort', 'gl', 'hl', 'num', 'start'];
    const FILTER_DESCRIPTIONS = {
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
    app.get('/search', async (req, res) => {
        const q = req.query.q;
        if (!q)
            return res.status(400).json({ error: 'Query param q is required' });
        const params = { key: API_KEY, cx: CSE_ID, q };
        VALID_FILTERS.forEach(filter => {
            const val = req.query[filter];
            if (typeof val === 'string')
                params[filter] = val;
        });
        const cacheKey = `search:${JSON.stringify(params)}`;
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                return res.json(JSON.parse(cached));
            }
            const response = await axios_1.default.get('https://www.googleapis.com/customsearch/v1', { params });
            await redisClient.set(cacheKey, JSON.stringify(response.data), { EX: CACHE_TTL });
            return res.json(response.data);
        }
        catch (err) {
            console.error(err);
            return res.status(500).json({ error: err.toString() });
        }
    });
    // Filters list
    app.get('/filters', (req, res) => {
        const filters = VALID_FILTERS.map(name => ({ name, description: FILTER_DESCRIPTIONS[name] }));
        res.json({ filters });
    });
    // Tools list
    app.get('/tools', (req, res) => {
        const parameters = { q: 'string' };
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
