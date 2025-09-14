# Google Search MCP Server

A Model Context Protocol (MCP) server that provides Google Custom Search functionality and web content extraction capabilities.

## Features

- **Google Search**: Perform web searches using Google Custom Search API with various filtering options
- **Content Extraction**: Extract main content and analyze sentiment from web pages
- **MCP Compatible**: Works with any MCP-compatible AI client

## Prerequisites

- Node.js 18+ 
- Google Custom Search API key
- Google Custom Search Engine ID

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd mcp-server-google-search
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration

Create a `.env` file in the project root with the following variables:

```env
GOOGLE_API_KEY=your_google_api_key_here
GOOGLE_CSE_ID=your_custom_search_engine_id_here
```

### Getting Google API Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the "Custom Search API"
4. Create credentials (API key)
5. Go to [Google Custom Search Engine](https://cse.google.com/cse/)
6. Create a new search engine
7. Get your Search Engine ID

## Usage

### As an MCP Server

Add this server to your AI tools configuration:

```json
{
  "google-mcp": {
    "command": "node",
    "args": ["/path/to/mcp-server-google-search/dist/index.js"],
    "env": {
      "GOOGLE_API_KEY": "your_api_key",
      "GOOGLE_CSE_ID": "your_cse_id"
    }
  }
}
```

### Available Tools

#### 1. Google Search (`google_search`)

Perform web searches with various filtering options.

**Parameters:**
- `q` (required): Search query string
- `searchType` (optional): Type of search - "image", "news", "video", "web"
- `fileType` (optional): File type filter - "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "rtf"
- `siteSearch` (optional): Search within a specific site (e.g., "example.com")
- `dateRestrict` (optional): Date restriction - "d1", "w1", "m1", "y1", "d7", "w2", "m2", "y2", "m6", "y"
- `safe` (optional): Safe search level - "active", "off"
- `exactTerms` (optional): Terms that must appear exactly as specified
- `excludeTerms` (optional): Terms to exclude from search results
- `sort` (optional): Sort order - "date"
- `gl` (optional): Country code for geolocation (e.g., "us", "uk")
- `hl` (optional): Language code for interface (e.g., "en", "es")
- `num` (optional): Number of results to return (1-10)
- `start` (optional): Starting index for results (1-based)

**Example:**
```json
{
  "name": "google_search",
  "arguments": {
    "q": "artificial intelligence",
    "num": 5,
    "fileType": "pdf",
    "dateRestrict": "m1"
  }
}
```

#### 2. Extract Content (`extract_content`)

Extract main content and analyze sentiment from a web page.

**Parameters:**
- `url` (required): URL of the web page to extract content from

**Example:**
```json
{
  "name": "extract_content",
  "arguments": {
    "url": "https://example.com/article"
  }
}
```

#### 3. Search Analytics (`search_analytics`)

Analyze search trends and get insights from multiple search queries.

**Parameters:**
- `queries` (required): Array of search queries to analyze (1-5 queries)
- `timeRange` (optional): Time range for trend analysis - "week", "month", "year"
- `maxResults` (optional): Maximum results per query (1-5)

**Example:**
```json
{
  "name": "search_analytics",
  "arguments": {
    "queries": ["artificial intelligence", "machine learning", "deep learning"],
    "timeRange": "month",
    "maxResults": 3
  }
}
```

#### 4. Multi-Site Search (`multi_site_search`)

Search across multiple specific websites simultaneously.

**Parameters:**
- `query` (required): Search query
- `sites` (required): Array of websites to search (1-5 sites)
- `maxResults` (optional): Max results per site (1-5)
- `fileType` (optional): File type to search for

**Example:**
```json
{
  "name": "multi_site_search",
  "arguments": {
    "query": "react tutorial",
    "sites": ["github.com", "stackoverflow.com", "medium.com"],
    "maxResults": 3
  }
}
```

#### 5. News Monitor (`news_monitor`)

Monitor news and get alerts for specific topics.

**Parameters:**
- `topic` (required): Topic to monitor
- `sources` (optional): Array of news sources to monitor
- `language` (optional): Language code (e.g., "en", "es")
- `country` (optional): Country code (e.g., "us", "uk")
- `maxResults` (optional): Maximum results to return (1-10)
- `dateRestrict` (optional): Date restriction for news

**Example:**
```json
{
  "name": "news_monitor",
  "arguments": {
    "topic": "artificial intelligence",
    "sources": ["bbc.com", "cnn.com", "reuters.com"],
    "dateRestrict": "d7",
    "maxResults": 5
  }
}
```

#### 6. Academic Search (`academic_search`)

Search academic papers and research documents.

**Parameters:**
- `query` (required): Research query
- `fileType` (optional): File type (PDF only)
- `dateRange` (optional): Publication date range
- `sites` (optional): Academic sites to search
- `maxResults` (optional): Maximum results to return (1-10)

**Example:**
```json
{
  "name": "academic_search",
  "arguments": {
    "query": "machine learning algorithms",
    "fileType": "pdf",
    "dateRange": "y1",
    "sites": ["arxiv.org", "scholar.google.com"],
    "maxResults": 5
  }
}
```

## Development

### Running in Development Mode

```bash
npm run dev
```

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
```

## Project Structure

```
├── dist/                 # Compiled JavaScript output
├── __tests__/           # Test files
├── config.ts            # Configuration and environment variables
├── index.ts             # Main entry point
├── mcp-server.ts        # MCP server implementation
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## Error Handling

The server includes comprehensive error handling for:
- Invalid API credentials
- Network timeouts
- Rate limiting
- Invalid search parameters
- Content extraction failures

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions, please open an issue on the GitHub repository.