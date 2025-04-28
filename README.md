# MCP Server: Google Programmable Search Engine

[![npm version](https://img.shields.io/npm/v/google-search-mcp?color=blue)](https://www.npmjs.com/package/google-search-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A simple, MCP-compatible server that proxies requests to Google's Programmable Search Engine (Custom Search API) and returns structured JSON results.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Server](#running-the-server)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Logging & Monitoring](#logging--monitoring)
- [Caching](#caching)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [Deployment](#deployment)
- [Integrating with Claude Desktop](#integrating-with-claude-desktop)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

The MCP Server for Google Programmable Search Engine serves as a microservice plugin (MCP) for Claude Desktop or any client supporting MCP. It accepts HTTP requests, forwards them to Google’s Custom Search API, applies caching, logging, rate limiting, and metrics, then returns the raw JSON response in a developer-friendly format.

## Features

- ✅ **HTTP Endpoints**: `/health`, `/`, `/search`, `/filters`, `/tools`, `/metrics`, and `/docs` (Swagger UI).
- 🔒 **Redis Caching**: TTL-based cache with LRU in-memory fallback and stale-while-revalidate.
- 📊 **Prometheus Metrics**: Exposed at `/metrics` for monitoring.
- ⚡️ **Rate Limiting**: Default 60 requests/minute (configurable).
- 🛠️ **Structured Logging**: JSON logging with [Pino](https://github.com/pinojs/pino).
- 🚀 **Hot Reload**: Development mode with live code reload.
- ⚙️ **Easy Integration**: Preconfigured for Claude Desktop via `mcp_config.json`.

## Prerequisites

- **Node.js** v14 or higher
- **npm** v6 or higher
- **Google API Key** with Custom Search API enabled
- **Google Custom Search Engine ID (CSE ID)**
- **Redis** instance (optional, recommended for caching)

## Installation

```bash
git clone https://github.com/1999AZZAR/mcp-server-google-search.git
cd mcp-server-google-search
npm install
npm run build
```

## Configuration

Create a `.env` file in the project root:

```ini
GOOGLE_API_KEY=your_api_key_here
GOOGLE_CSE_ID=your_cse_id_here
PORT=3000                           # defaults to 3000
REDIS_URL=redis://localhost:6379    # optional
RATE_LIMIT_WINDOW_MS=60000          # optional, default 60000ms
RATE_LIMIT_MAX_REQUESTS=60          # optional, default 60
CACHE_TTL_SECONDS=300               # optional, default 300s
```

| Variable                 | Description                                     | Required | Default        |
|--------------------------|-------------------------------------------------|----------|----------------|
| `GOOGLE_API_KEY`         | Google API key for Custom Search                | Yes      | –              |
| `GOOGLE_CSE_ID`          | Custom Search Engine ID                         | Yes      | –              |
| `PORT`                   | HTTP port                                       | No       | `3000`         |
| `REDIS_URL`              | Redis connection URL                            | No       | –              |
| `RATE_LIMIT_WINDOW_MS`   | Rate-limit window in ms                         | No       | `60000`        |
| `RATE_LIMIT_MAX_REQUESTS`| Max requests per window                         | No       | `60`           |
| `CACHE_TTL_SECONDS`      | Cache TTL in seconds                            | No       | `300`          |

## Running the Server

- **Production**: `npm start`
- **Development**: `npm run dev`  (hot reload)

Default base URL: `http://localhost:${PORT}`

## API Reference

### GET /health

Returns `200 OK` if the server is healthy.

**Response**:
```json
{ "status": "ok" }
```

### GET /

Root endpoint for initialization checks.

**Response**:
```json
{ "status": "ok" }
```

### GET /search

Perform a Google Custom Search.

**Query Parameters**:
| Name | Type   | Required | Description          |
|------|--------|----------|----------------------|
| `q`  | string | yes      | URL-encoded query    |

**Example**:
```bash
curl "http://localhost:3000/search?q=weather+today"
```

**Response**: raw JSON from Google API (`items`, `searchInformation`, etc.).

### GET /filters

Lists available filter options and descriptions.

### GET /tools

Lists tool schemas and parameters.

### GET /metrics

Prometheus metrics in text format.

### GET /docs

Interactive Swagger UI documentation.

## Usage Examples

**Node.js (axios)**
```js
import axios from 'axios';

const { data } = await axios.get('http://localhost:3000/search', {
  params: { q: 'openai chatgpt' }
});
console.log(data.items);
```

## Logging & Monitoring

- **Pino** for high-performance JSON logging
- **Prometheus** counters & histograms for request timings, cache hits/misses, and errors

## Caching

- **Redis** as primary cache (configured via `REDIS_URL`)
- **LRU in-memory** fallback cache
- **Stale-while-revalidate** strategy controlled by `CACHE_TTL_SECONDS`

## Rate Limiting

- Controlled via `RATE_LIMIT_WINDOW_MS` & `RATE_LIMIT_MAX_REQUESTS`
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Error Handling

- **400 Bad Request**: missing `q` parameter
- **500 Internal Server Error**: Google API errors or unexpected failures
- Error format: `{ "error": "description" }`

## Deployment

### Docker
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY . .
RUN npm install --production
CMD ["npm", "start"]
```

```bash
docker build -t mcp-google-search .
docker run -e GOOGLE_API_KEY=$GOOGLE_API_KEY \
           -e GOOGLE_CSE_ID=$GOOGLE_CSE_ID \
           -p 3000:3000 mcp-google-search
```

## Integrating with Claude Desktop

Add to `~/.claude-desktop/mcp_config.json`:
```json
{
  "mcpServers": {
    "google-search": {
      "command": "node",
      "args": ["--directory","/path/to/google-search","dist/index.js"],
      "env": {
        "GOOGLE_API_KEY": "YOUR_API_KEY",
        "GOOGLE_CSE_ID": "YOUR_CSE_ID",
        "PORT": "4000",
        "REDIS_URL": "redis://localhost:6379"
      }
    }
  }
}
```

Restart Claude Desktop and enable the `google-search` MCP provider.

## Troubleshooting

- **Missing API Key**: verify `GOOGLE_API_KEY` in `.env`
- **Redis Errors**: ensure Redis is running and `REDIS_URL` is correct
- **Rate Limit**: adjust `RATE_LIMIT_MAX_REQUESTS` & `RATE_LIMIT_WINDOW_MS`
- **SSL Issues**: check network and certificate configurations

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m "feat: description of change"`
4. Push & open a Pull Request

Please follow the [Conventional Commits](https://www.conventionalcommits.org/) spec.

## License

MIT 
