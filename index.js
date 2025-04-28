require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const API_KEY = process.env.GOOGLE_API_KEY;
const CSE_ID = process.env.GOOGLE_CSE_ID;

if (!API_KEY || !CSE_ID) {
  console.error('Missing GOOGLE_API_KEY or GOOGLE_CSE_ID in .env');
  process.exit(1);
}

const app = express();
app.use(bodyParser.json());

// Define supported filters and descriptions
const VALID_FILTERS = ['searchType','fileType','siteSearch','dateRestrict','safe','exactTerms','excludeTerms','sort','gl','hl','num','start'];
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

// Updated search endpoint with filters
app.get('/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Query param q is required' });
  const params = { key: API_KEY, cx: CSE_ID, q };
  VALID_FILTERS.forEach(filter => {
    if (req.query[filter]) params[filter] = req.query[filter];
  });
  try {
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', { params });
    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.toString() });
  }
});

// Endpoint to list available filters
app.get('/filters', (req, res) => {
  const filters = VALID_FILTERS.map(name => ({ name, description: FILTER_DESCRIPTIONS[name] || '' }));
  res.json({ filters });
});

// Endpoint to list available tools
app.get('/tools', (req, res) => {
  const parameters = VALID_FILTERS.reduce((acc, name) => { acc[name] = 'string'; return acc; }, { q: 'string' });
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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
