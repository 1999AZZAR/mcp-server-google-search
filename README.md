# MCP Server: Google Programmable Search Engine

A simple MCP-compatible server that proxies requests to Google Custom Search (Programmable Search Engine) and returns search results as JSON.

## Features
- Exposes multiple HTTP endpoints for search, filters, and tools.
- Fetches data from the Google Custom Search API.
- Returns the raw JSON response from Google.
- Supports caching with Redis.

## Prerequisites
- Node.js (v14+)
- npm
- A Google API key with access to Custom Search API.
- A Custom Search Engine ID (CSE ID).
- Redis (optional, for caching)

## Setup
1. Clone or download this project.
2. Copy `.env.example` to `.env` and fill in your credentials:
   ```ini
   GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY
   GOOGLE_CSE_ID=YOUR_CUSTOM_SEARCH_ENGINE_ID
   PORT=3000            # optional, defaults to 3000
   REDIS_URL=redis://localhost:6379  # optional, for caching
   ```

## Installation
```bash
cd google-search
npm install
npm run build
```

## Running the Server
```bash
# Production
npm start
# Development (with hot reload)
npm run dev
```
By default the server listens on `http://localhost:<PORT>`. Override via `PORT`. To enable caching, run Redis and set `REDIS_URL`.

## API Usage
### Endpoints
- GET `/search?q=...` : perform a search with optional filters.
- GET `/filters`     : list available filters and descriptions.
- GET `/tools`       : list tool schemas and parameters.

#### Search Endpoint
```
GET /search?q=your+search+terms
```
- **Query Parameters**:
  - `q` (required): The search terms.

#### Example with curl
```bash
curl "http://localhost:3000/search?q=weather+today"
```

#### Response
Returns the JSON object from Google Custom Search API, containing:
- `items`: Array of search result items.
- Other metadata fields (searchInformation, queries, etc.).

#### Error Handling
- 400 if `q` is missing.
- 500 if there is an internal or Google API error.

## Integrating with Claude Desktop

1. Build & start:
   ```bash
   npm install && npm run build && npm start
   ```
2. In `~/.claude-desktop/mcp_config.json`, add:
   ```json
   {
     "mcpServers": {
       "google-search": {
         "command": "node",
         "args": [
           "--directory",
           "/path/to/google-search",
           "dist/index.js"
         ],
         "env": {
           "GOOGLE_API_KEY": "YOUR_GOOGLE_API_KEY",
           "GOOGLE_CSE_ID": "YOUR_CUSTOM_SEARCH_ENGINE_ID",
           "PORT": "4000",
           "REDIS_URL": "redis://localhost:6379"
         }
       }
     }
   }
   ```
3. Restart Claude Desktop and enable the "google-search" MCP provider in settings.
4. Use `!search q=your+terms` in chat or let the client auto-inject search context.

## License
MIT
