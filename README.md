# MCP Server: Google Programmable Search Engine

A simple MCP-compatible server that proxies requests to Google Custom Search (Programmable Search Engine) and returns search results as JSON.

## Features
- Exposes a single HTTP endpoint `/search` that accepts a query parameter `q`.
- Fetches data from the Google Custom Search API.
- Returns the raw JSON response from Google.

## Prerequisites
- Node.js (v14+)
- npm
- A Google API key with access to Custom Search API.
- A Custom Search Engine ID (CSE ID).

## Setup
1. Clone or download this project.
2. In the project root, create a file named `.env` with the following content:
   ```ini
   GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY
   GOOGLE_CSE_ID=YOUR_CUSTOM_SEARCH_ENGINE_ID
   PORT=3000     # optional, defaults to 3000
   ```

## Installation
```bash
cd google-search
npm install
```

## Running the Server
```bash
npm start
```
By default, the server listens on `http://localhost:3000`. You can override the port via the `PORT` env variable.

## API Usage
### Search Endpoint
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

1. Ensure the server is running:
   ```bash
   npm start
   ```
2. In Claude Desktop, open the MCP configuration file (e.g., `~/.claude-desktop/mcp_config.json`) and add:
   ```json
   {
     "mcpServers": {
       "google-search": {
         "command": "node",
         "args": ["<path/to/google-search/index.js>"],
         "env": {
           "GOOGLE_API_KEY": "YOUR_GOOGLE_API_KEY",
           "GOOGLE_CSE_ID": "YOUR_CUSTOM_SEARCH_ENGINE_ID",
           "PORT": "3000"
         }
       }
     }
   }
   ```
3. Restart Claude Desktop and enable the "google-search" MCP provider in settings.
4. Use `!search q=your+terms` in chat or let the client auto-inject search context.

## License
MIT
