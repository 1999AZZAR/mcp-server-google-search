# Google Search MCP Server

A comprehensive Model Context Protocol (MCP) server that provides advanced Google Custom Search functionality, web content extraction, search analytics, and specialized research tools. This server transforms Google's search capabilities into powerful AI tools that can be integrated with any MCP-compatible AI client.

## Features

- **Advanced Google Search**: Perform web searches with extensive filtering options, file type restrictions, and geographic targeting
- **Content Extraction**: Extract main content from web pages with automatic sentiment analysis
- **Search Analytics**: Analyze search trends across multiple queries with comprehensive insights and keyword extraction
- **Multi-Site Search**: Search across multiple websites simultaneously with detailed statistics
- **News Monitoring**: Monitor news sources with topic filtering and date restrictions
- **Academic Research**: Specialized tools for finding academic papers and research documents
- **Content Summarization**: Intelligent summarization of multiple URLs with sentiment analysis and insights
- **MCP Compatible**: Seamlessly integrates with any MCP-compatible AI client (Claude, Cursor, etc.)
- **Robust Error Handling**: Comprehensive error handling for API failures, rate limiting, and invalid parameters
- **TypeScript**: Fully typed with Zod schema validation for all parameters

## Prerequisites

- Node.js 18+ 
- Google Custom Search API key
- Google Custom Search Engine ID

## Installation

1. **Clone this repository:**
```bash
git clone https://github.com/1999AZZAR/mcp-server-google-search.git
cd mcp-server-google-search
```

2. **Install dependencies:**
```bash
npm install
```

3. **Build the project:**
```bash
npm run build
```

4. **Verify installation:**
```bash
# Test that the server starts correctly
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | GOOGLE_API_KEY=test GOOGLE_CSE_ID=test node dist/index.js
```

## Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
GOOGLE_API_KEY=your_google_api_key_here
GOOGLE_CSE_ID=your_custom_search_engine_id_here
```

### Getting Google API Credentials

#### Step 1: Google Cloud Console Setup
1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the "Custom Search API" in the API Library
4. Go to "Credentials" → "Create Credentials" → "API Key"
5. Copy your API key

#### Step 2: Custom Search Engine Setup
1. Go to [Google Custom Search Engine](https://cse.google.com/cse/)
2. Click "Add" to create a new search engine
3. Enter the sites you want to search (or leave blank for entire web)
4. Give your search engine a name
5. Click "Create"
6. Go to "Setup" → "Basics" and copy your "Search engine ID"

#### Step 3: Configure Search Engine (Optional)
- **Search the entire web**: Leave "Sites to search" empty
- **Search specific sites**: Add domains like `github.com`, `stackoverflow.com`
- **Advanced settings**: Configure language, region, and other preferences

### Security Best Practices
- Never commit your `.env` file to version control
- Use environment variables in production
- Consider using Google Cloud Secret Manager for production deployments
- Restrict your API key to specific IP addresses if possible

## Usage

### As an MCP Server

#### For Cursor IDE
Add this server to your Cursor MCP configuration (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "google-search-mcp": {
      "command": "node",
      "args": ["/path/to/mcp-server-google-search/dist/index.js"],
      "env": {
        "GOOGLE_API_KEY": "your_api_key",
        "GOOGLE_CSE_ID": "your_cse_id"
      }
    }
  }
}
```

#### For Claude Desktop
Add this server to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "google-search-mcp": {
      "command": "node",
      "args": ["/path/to/mcp-server-google-search/dist/index.js"],
      "env": {
        "GOOGLE_API_KEY": "your_api_key",
        "GOOGLE_CSE_ID": "your_cse_id"
      }
    }
  }
}
```

#### For Other MCP Clients
The server follows the standard MCP protocol and should work with any MCP-compatible client. Refer to your client's documentation for configuration details.

### Testing the Server

You can test the server directly using JSON-RPC commands:

```bash
# List all available tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | GOOGLE_API_KEY=your_key GOOGLE_CSE_ID=your_id node dist/index.js

# Test a search
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"google_search","arguments":{"q":"test search","num":2}}}' | GOOGLE_API_KEY=your_key GOOGLE_CSE_ID=your_id node dist/index.js
```

## Available Tools

This MCP server provides **9 powerful tools** for comprehensive search, research, fact verification, and advanced research assistance:

### 1. Google Search (`google_search`)

Perform advanced web searches with extensive filtering options and geographic targeting.

**Parameters:**
- `q` (required): Search query string
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

**Use Cases:**
- General web searches with advanced filtering
- Finding specific file types (PDFs, documents)
- Searching within specific websites
- Time-restricted searches for recent content

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

**Response Format:**
```json
{
  "searchInfo": {
    "totalResults": "8420000",
    "searchTime": 0.626612,
    "formattedSearchTime": "0.63"
  },
  "items": [
    {
      "title": "Article Title",
      "link": "https://example.com/article",
      "snippet": "Article preview...",
      "displayLink": "example.com",
      "formattedUrl": "https://example.com/article"
    }
  ]
}
```

### 2. Extract Content (`extract_content`)

Extract main content from web pages and perform automatic sentiment analysis using advanced text processing.

**Parameters:**
- `url` (required): URL of the web page to extract content from

**Use Cases:**
- Summarizing articles and blog posts
- Analyzing sentiment of news articles or reviews
- Extracting clean text from web pages
- Content analysis for research purposes

**Example:**
```json
{
  "name": "extract_content",
  "arguments": {
    "url": "https://example.com/article"
  }
}
```

**Response Format:**
```json
{
  "url": "https://example.com/article",
  "title": "Article Title",
  "content": "Extracted main content...",
  "wordCount": 1250,
  "sentiment": {
    "score": 0.8,
    "comparative": 0.15,
    "positive": 0.75,
    "negative": 0.25,
    "neutral": 0.0
  },
  "summary": "Brief summary of the content..."
}
```

### 3. Search Analytics (`search_analytics`)

Analyze search trends across multiple queries with comprehensive insights, keyword extraction, and performance metrics.

**Parameters:**
- `queries` (required): Array of search queries to analyze (1-5 queries)
- `timeRange` (optional): Time range for trend analysis - "week", "month", "year"
- `maxResults` (optional): Maximum results per query (1-5)

**Use Cases:**
- Market research and trend analysis
- Keyword research for SEO
- Competitive analysis
- Content strategy planning
- Brand monitoring

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

**Response Format:**
```json
{
  "queries": ["artificial intelligence", "machine learning", "deep learning"],
  "timeRange": "month",
  "results": [
    {
      "query": "artificial intelligence",
      "resultCount": 1600000000,
      "items": [...]
    }
  ],
  "summary": {
    "totalResults": 7060000000,
    "averageResults": 2353333333.33,
    "topPerformingQuery": "deep learning",
    "commonKeywords": ["learning", "artificial", "intelligence", "machine", "deep"]
  }
}
```

### 4. Multi-Site Search (`multi_site_search`)

Search across multiple specific websites simultaneously with detailed statistics and comprehensive results aggregation.

**Parameters:**
- `query` (required): Search query
- `sites` (required): Array of websites to search (1-5 sites)
- `maxResults` (optional): Max results per site (1-5)
- `fileType` (optional): File type to search for

**Use Cases:**
- Cross-platform research (GitHub, Stack Overflow, Medium)
- Competitive analysis across multiple sites
- Finding resources on specific platforms
- Aggregating information from trusted sources

**Example:**
```json
{
  "name": "multi_site_search",
  "arguments": {
    "query": "react tutorial",
    "sites": ["github.com", "stackoverflow.com", "dev.to"],
    "maxResults": 3
  }
}
```

**Response Format:**
```json
{
  "query": "react tutorial",
  "sites": ["github.com", "stackoverflow.com", "dev.to"],
  "results": [
    {
      "site": "github.com",
      "resultCount": 2,
      "totalAvailable": 19800,
      "items": [...]
    }
  ],
  "summary": {
    "totalResults": 6,
    "sitesSearched": 3,
    "successfulSearches": 3
  }
}
```

### 5. News Monitor (`news_monitor`)

Monitor news sources for specific topics with advanced filtering, source targeting, and date restrictions for real-time news intelligence.

**Parameters:**
- `topic` (required): Topic to monitor
- `sources` (optional): Array of news sources to monitor (e.g., ["bbc.com", "cnn.com", "reuters.com"])
- `language` (optional): Language code (e.g., "en", "es")
- `country` (optional): Country code (e.g., "us", "uk")
- `maxResults` (optional): Maximum results to return (1-10)
- `dateRestrict` (optional): Date restriction for news - "d1", "d7", "m1", "m6", "y1"

**Use Cases:**
- Real-time news monitoring
- Brand and reputation management
- Crisis communication monitoring
- Industry trend tracking
- Competitive intelligence

**Example:**
```json
{
  "name": "news_monitor",
  "arguments": {
    "topic": "artificial intelligence breakthrough",
    "sources": ["bbc.com", "cnn.com", "reuters.com"],
    "dateRestrict": "d7",
    "maxResults": 5
  }
}
```

**Response Format:**
```json
{
  "topic": "artificial intelligence breakthrough",
  "sources": ["bbc.com", "cnn.com", "reuters.com"],
  "language": "en",
  "country": "us",
  "dateRestrict": "d7",
  "results": [
    {
      "source": "bbc.com",
      "articles": [...]
    }
  ],
  "summary": {
    "totalArticles": 15,
    "sourcesFound": 3,
    "dateRange": "d7"
  }
}
```

### 6. Academic Search (`academic_search`)

Search academic papers and research documents from specialized academic sources with PDF filtering and publication date restrictions.

**Parameters:**
- `query` (required): Research query
- `fileType` (optional): File type (PDF only) - "pdf"
- `dateRange` (optional): Publication date range - "d1", "d7", "m1", "m6", "y1", "y2"
- `sites` (optional): Academic sites to search (default: ["arxiv.org", "scholar.google.com", "researchgate.net"])
- `maxResults` (optional): Maximum results to return (1-10)

**Use Cases:**
- Academic research and literature reviews
- Finding recent research papers
- PhD and thesis research
- Scientific literature analysis
- Research trend monitoring

**Example:**
```json
{
  "name": "academic_search",
  "arguments": {
    "query": "machine learning algorithms neural networks",
    "fileType": "pdf",
    "dateRange": "y1",
    "sites": ["arxiv.org", "scholar.google.com"],
    "maxResults": 5
  }
}
```

**Response Format:**
```json
{
  "query": "machine learning algorithms neural networks",
  "fileType": "pdf",
  "dateRange": "y1",
  "sites": ["arxiv.org", "scholar.google.com"],
  "results": [
    {
      "site": "arxiv.org",
      "paperCount": 3,
      "totalAvailable": 18800,
      "papers": [
        {
          "title": "A Digital Machine Learning Algorithm Simulating Spiking Neural Networks",
          "link": "https://arxiv.org/pdf/2503.17111",
          "snippet": "During last several years, our research team worked on development of a spiking neural network...",
          "mime": "application/pdf",
          "fileFormat": "PDF/Adobe Acrobat"
        }
      ]
    }
  ],
  "summary": {
    "totalPapers": 3,
    "sitesSearched": 2,
    "successfulSearches": 2,
    "dateRange": "y1"
  }
}
```

### 7. Content Summarizer (`content_summarizer`)

Extract and summarize content from multiple URLs with intelligent summarization, sentiment analysis, and comprehensive insights.

**Parameters:**
- `urls` (required): Array of URLs to summarize (1-10 URLs)
- `maxLength` (optional): Maximum length of summary per URL in words (50-500, default: 200)
- `includeSentiment` (optional): Include sentiment analysis for each URL (default: true)
- `focusAreas` (optional): Specific areas to focus on in summaries (e.g., ["key points", "conclusions", "data"])
- `generateOverallSummary` (optional): Generate an overall summary combining all URLs (default: true)

**Use Cases:**
- Research summarization across multiple sources
- Content analysis and comparison
- News aggregation and analysis
- Academic paper summarization
- Competitive intelligence gathering
- Content curation and insights

**Example:**
```json
{
  "name": "content_summarizer",
  "arguments": {
    "urls": [
      "https://example.com/article1",
      "https://example.com/article2",
      "https://example.com/article3"
    ],
    "maxLength": 150,
    "includeSentiment": true,
    "focusAreas": ["key insights", "conclusions", "data"],
    "generateOverallSummary": true
  }
}
```

**Response Format:**
```json
{
  "urls": ["https://example.com/article1", "https://example.com/article2"],
  "maxLength": 150,
  "includeSentiment": true,
  "focusAreas": ["key insights", "conclusions"],
  "generateOverallSummary": true,
  "summaries": [
    {
      "url": "https://example.com/article1",
      "title": "Article Title",
      "summary": "Key insights from the article...",
      "wordCount": 1250,
      "sentiment": {
        "score": 0.8,
        "comparative": 0.15,
        "positive": ["excellent", "innovative"],
        "negative": ["challenging"]
      },
      "extractionTime": "2024-01-15T10:30:00.000Z"
    }
  ],
  "overallSummary": "Combined insights from all articles...",
  "statistics": {
    "totalUrls": 2,
    "successfulExtractions": 2,
    "failedExtractions": 0,
    "averageWordCount": 1250,
    "sentimentDistribution": {
      "positive": 1,
      "negative": 0,
      "neutral": 1
    }
  }
}
```

### 8. Fact Checker (`fact_checker`)

Verify claims by searching multiple authoritative sources with credibility analysis and evidence extraction.

**Parameters:**
- `claim` (required): The claim or statement to verify (minimum 10 characters)
- `sources` (optional): Specific authoritative sources to check (e.g., ["wikipedia.org", "bbc.com", "reuters.com"])
- `confidenceThreshold` (optional): Minimum confidence level for verification (0.0-1.0, default: 0.7)
- `timeframe` (optional): Time range for search results - "d1", "d7", "m1", "m6", "y1", "y2" (default: "y1")
- `maxResults` (optional): Maximum results per source (1-5, default: 3)
- `includeEvidence` (optional): Include extracted evidence snippets (default: true)

**Default Sources:**
- wikipedia.org, bbc.com, reuters.com, ap.org
- factcheck.org, snopes.com, politifact.com
- scholar.google.com, pubmed.ncbi.nlm.nih.gov, nature.com

**Use Cases:**
- Fact verification and debunking misinformation
- Research validation across multiple sources
- News verification and credibility assessment
- Academic claim verification
- Public statement fact-checking
- Scientific claim validation

**Example:**
```json
{
  "name": "fact_checker",
  "arguments": {
    "claim": "The Earth is approximately 4.5 billion years old",
    "sources": ["wikipedia.org", "science.org", "nature.com"],
    "confidenceThreshold": 0.8,
    "timeframe": "y1",
    "maxResults": 2,
    "includeEvidence": true
  }
}
```

**Response Format:**
```json
{
  "claim": "The Earth is approximately 4.5 billion years old",
  "sourcesToCheck": ["wikipedia.org", "science.org", "nature.com"],
  "confidenceThreshold": 0.8,
  "timeframe": "y1",
  "maxResults": 2,
  "includeEvidence": true,
  "verification": {
    "status": "verified",
    "confidence": 0.85,
    "evidenceCount": 4,
    "supportingSources": ["wikipedia.org", "science.org"],
    "disputingSources": [],
    "neutralSources": ["nature.com"]
  },
  "sources": [
    {
      "source": "wikipedia.org",
      "resultCount": 2,
      "totalAvailable": "3700",
      "results": [
        {
          "title": "Age of Earth - Wikipedia",
          "link": "https://en.wikipedia.org/wiki/Age_of_Earth",
          "snippet": "The age of Earth is estimated to be 4.54 ± 0.05 billion years...",
          "displayLink": "en.wikipedia.org",
          "relevanceScore": 0.8
        }
      ],
      "credibilityScore": 0.8
    }
  ],
  "evidence": [
    {
      "source": "wikipedia.org",
      "url": "https://en.wikipedia.org/wiki/Age_of_Earth",
      "title": "Age of Earth - Wikipedia",
      "evidence": "The age of Earth is estimated to be 4.54 ± 0.05 billion years. This age represents the final stages of Earth's accretion and planetary differentiation.",
      "relevanceScore": 0.8,
      "sentiment": {
        "score": 0,
        "comparative": 0
      }
    }
  ],
  "statistics": {
    "totalSourcesChecked": 3,
    "successfulSearches": 3,
    "failedSearches": 0,
    "totalResults": 6,
    "averageRelevanceScore": 0.75
  }
}
```

**Verification Statuses:**
- `verified`: Claim is supported by credible sources with high confidence
- `disputed`: Claim is contradicted by credible sources
- `unverified`: Insufficient evidence or conflicting information
- `unknown`: No relevant information found

### 9. Research Assistant (`research_assistant`)

Comprehensive research assistant with multi-step workflows, source synthesis, and structured report generation.

**Parameters:**
- `researchTopic` (required): The main research topic or question to investigate (minimum 10 characters)
- `researchType` (optional): Type of research to conduct - "academic", "news", "factual", "comprehensive" (default: "comprehensive")
- `depth` (optional): Research depth level - "quick", "standard", "deep" (default: "standard")
- `sources` (optional): Specific sources to include in research (max 15 sources)
- `excludeSources` (optional): Sources to exclude from research (max 10 sources)
- `timeframe` (optional): Time range for research results - "d1", "d7", "m1", "m6", "y1", "y2" (default: "y1")
- `maxSourcesPerType` (optional): Maximum sources per source type (2-8, default: 5)
- `includeCitations` (optional): Include detailed citations and source tracking (default: true)
- `generateReport` (optional): Generate structured research report (default: true)
- `focusAreas` (optional): Specific areas to focus research on (e.g., ["methodology", "findings", "implications"])

**Research Types & Source Categories:**
- **Academic**: Academic journals, educational institutions, research repositories
- **News**: News sources, fact checkers, international media
- **Factual**: Government sources, scientific institutions, reference materials
- **Comprehensive**: All source types for thorough research

**Use Cases:**
- Academic research and literature reviews
- Market research and competitive analysis
- Policy research and government analysis
- Scientific research and evidence synthesis
- Business intelligence and strategic planning
- News analysis and media monitoring
- Fact-checking and verification workflows

**Example:**
```json
{
  "name": "research_assistant",
  "arguments": {
    "researchTopic": "artificial intelligence impact on healthcare",
    "researchType": "comprehensive",
    "depth": "standard",
    "maxSourcesPerType": 3,
    "focusAreas": ["methodology", "findings", "implications"],
    "includeCitations": true,
    "generateReport": true,
    "timeframe": "y1"
  }
}
```

**Response Format:**
```json
{
  "researchTopic": "artificial intelligence impact on healthcare",
  "researchType": "comprehensive",
  "depth": "standard",
  "timeframe": "y1",
  "maxSourcesPerType": 3,
  "includeCitations": true,
  "generateReport": true,
  "focusAreas": ["methodology", "findings", "implications"],
  "researchWorkflow": {
    "phase": "completed",
    "stepsCompleted": 5,
    "totalSteps": 5,
    "currentStep": "Research completed"
  },
  "sourceCategories": ["Academic", "News", "Government", "Reference", "Specialized"],
  "findings": [
    {
      "source": "nature.com",
      "category": "Academic",
      "url": "https://example.com/article",
      "title": "AI in Healthcare Research",
      "content": "Full extracted content...",
      "wordCount": 1250,
      "sentiment": {
        "score": 0.8,
        "comparative": 0.15
      },
      "relevanceScore": 0.9,
      "keyInsights": ["AI shows promise in diagnostic accuracy", "Implementation challenges remain"],
      "focusAnalysis": {
        "methodology": ["Randomized controlled trials", "Machine learning algorithms"],
        "findings": ["Improved diagnostic accuracy by 15%", "Reduced false positives"],
        "implications": ["Potential for widespread adoption", "Need for regulatory framework"]
      },
      "contentQualityScore": 0.85,
      "extractionTime": "2024-01-15T10:30:00.000Z"
    }
  ],
  "sources": [
    {
      "source": "nature.com",
      "category": "Academic",
      "resultCount": 3,
      "totalAvailable": "150",
      "results": [
        {
          "title": "AI in Healthcare Research",
          "link": "https://example.com/article",
          "snippet": "Artificial intelligence is transforming healthcare...",
          "displayLink": "nature.com",
          "relevanceScore": 0.9
        }
      ],
      "credibilityScore": 0.9
    }
  ],
  "citations": [
    {
      "title": "AI in Healthcare Research",
      "url": "https://example.com/article",
      "source": "nature.com",
      "category": "Academic",
      "credibilityScore": 0.9,
      "relevanceScore": 0.9,
      "accessedDate": "2024-01-15T10:30:00.000Z"
    }
  ],
  "synthesis": {
    "keyFindings": [
      "AI demonstrates significant potential in healthcare diagnostics",
      "Implementation faces regulatory and technical challenges",
      "Patient outcomes show measurable improvement with AI assistance"
    ],
    "conflictingInformation": [],
    "consensusPoints": [
      "AI technology shows promise in healthcare applications",
      "Regulatory frameworks need development for safe implementation"
    ],
    "gapsInKnowledge": [
      "Long-term impact studies are limited",
      "Cost-benefit analysis needs more research"
    ],
    "confidenceLevel": 0.85
  },
  "report": {
    "title": "Research Report: artificial intelligence impact on healthcare",
    "executiveSummary": "This research analyzed 15 sources across 5 categories...",
    "methodology": "Research methodology involved systematic search...",
    "findings": "Key findings from the research:\n1. AI shows promise...",
    "synthesis": "Synthesis of findings reveals 2 consensus points...",
    "recommendations": "High confidence in findings. Recommendations can be made...",
    "limitations": "Research limitations include: limited to publicly available sources...",
    "citations": [...],
    "metadata": {
      "generatedAt": "2024-01-15T10:30:00.000Z",
      "researchType": "comprehensive",
      "depth": "standard",
      "totalSources": 15,
      "confidenceLevel": 0.85,
      "qualityScore": 0.82
    }
  },
  "statistics": {
    "totalSourcesSearched": 15,
    "successfulSearches": 14,
    "failedSearches": 1,
    "totalResults": 45,
    "averageCredibilityScore": 0.87,
    "researchQualityScore": 0.82
  }
}
```

**Research Workflow Phases:**
1. **Multi-source Research**: Systematic search across categorized sources
2. **Content Analysis**: Extraction, sentiment analysis, and focus area analysis
3. **Synthesis**: Cross-reference analysis and consensus identification
4. **Citation Management**: Automated citation generation and tracking
5. **Report Generation**: Structured research report with executive summary

**Quality Metrics:**
- **Research Quality Score**: Composite score based on source diversity, credibility, and findings quality
- **Confidence Level**: Overall confidence in research findings based on source agreement
- **Source Diversity**: Number of different source categories included
- **Content Quality**: Assessment of extracted content relevance and depth

## Development

### Development Commands

```bash
# Install dependencies
npm install

# Run in development mode with hot reload
npm run dev

# Build the project
npm run build

# Run tests
npm test

# Run linting
npm run lint

# Start production server
npm start
```

### Project Structure

```
mcp-server-google-search/
├── dist/                    # Compiled JavaScript output
├── __tests__/              # Test files
│   └── mcp-server.test.ts  # MCP server tests
├── config.ts               # Configuration and environment variables
├── index.ts                # Main entry point
├── mcp-server.ts           # MCP server implementation with all 6 tools
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── jest.config.js          # Jest testing configuration
├── global.d.ts             # TypeScript declarations
├── .env.example            # Environment variables template
├── example-config.json     # MCP configuration example
├── README.md               # This comprehensive documentation
└── LICENSE                 # MIT License
```

### Technical Details

- **Language**: TypeScript with ES modules
- **Runtime**: Node.js 18+
- **Protocol**: Model Context Protocol (MCP)
- **Validation**: Zod schemas for all parameters
- **HTTP Client**: Axios for API requests
- **HTML Parsing**: Cheerio for content extraction
- **Sentiment Analysis**: Sentiment library
- **Testing**: Jest with TypeScript support

### Error Handling

The server includes comprehensive error handling for:

- **API Authentication**: Invalid Google API credentials
- **Network Issues**: Timeouts, connection failures, rate limiting
- **Parameter Validation**: Invalid search parameters and malformed requests
- **Content Extraction**: Failed web page parsing and extraction
- **Rate Limiting**: Google API quota exceeded
- **Malformed URLs**: Invalid URLs for content extraction

### Performance Features

- **Concurrent Requests**: Parallel processing for multi-site searches
- **Error Recovery**: Graceful degradation when individual sources fail
- **Response Caching**: Efficient result aggregation and statistics
- **Memory Management**: Optimized for long-running MCP server processes



## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

We welcome contributions! Here's how you can help:

1. **Fork the repository** on [GitHub](https://github.com/1999AZZAR/mcp-server-google-search)
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and add tests if applicable
4. **Run the test suite**: `npm test`
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request** on GitHub

### Areas for Contribution

- **New Tools**: Add specialized search tools for specific domains
- **Enhanced Analytics**: Improve search analytics and trend analysis
- **Performance**: Optimize API calls and response times
- **Documentation**: Improve examples and use cases
- **Testing**: Add more comprehensive test coverage
- **Error Handling**: Enhance error messages and recovery

## Support

### Getting Help

- **GitHub Issues**: [Open an issue](https://github.com/1999AZZAR/mcp-server-google-search/issues) for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions and community support
- **Documentation**: Check this README for comprehensive usage examples

### Common Issues

1. **API Key Issues**: Ensure your Google API key is valid and has Custom Search API enabled
2. **CSE ID Problems**: Verify your Custom Search Engine ID is correct
3. **Rate Limiting**: Google API has daily quotas - check your usage in Google Cloud Console
4. **MCP Client Issues**: Restart your MCP client after configuration changes

### Useful Links

- [Google Custom Search API Documentation](https://developers.google.com/custom-search/v1/introduction)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Cursor MCP Documentation](https://docs.cursor.com/mcp)
- [Claude Desktop MCP Guide](https://claude.ai/docs/mcp)

---

## About

This MCP server transforms Google's powerful search capabilities into intelligent AI tools, enabling seamless integration with modern AI assistants. Built with TypeScript and following MCP standards, it provides a robust foundation for search-powered AI applications.

**Repository**: [https://github.com/1999AZZAR/mcp-server-google-search](https://github.com/1999AZZAR/mcp-server-google-search)

**Created by**: [1999AZZAR](https://github.com/1999AZZAR)

**License**: MIT

---

*Made with dedication for the AI community*