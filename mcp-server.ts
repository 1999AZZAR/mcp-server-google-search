import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import Sentiment from 'sentiment';
import config from './config.js';

// Configure axios retry
axiosRetry(axios, { 
  retries: 3, 
  retryDelay: axiosRetry.exponentialDelay, 
  retryCondition: axiosRetry.isNetworkOrIdempotentRequestError 
});

// Sentiment analyzer for content extraction
const sentiment = new Sentiment();

// Tool definitions
const tools: Tool[] = [
  {
    name: 'google_search',
    description: 'Search the web using Google Custom Search API with various filtering options',
    inputSchema: {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          description: 'Search query string',
        },
        searchType: {
          type: 'string',
          description: 'Type of search (image, news, etc.)',
          enum: ['image', 'news', 'video', 'web'],
        },
        fileType: {
          type: 'string',
          description: 'File type to search for',
          enum: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'rtf'],
        },
        siteSearch: {
          type: 'string',
          description: 'Search within a specific site (e.g., "example.com")',
        },
        dateRestrict: {
          type: 'string',
          description: 'Date restriction for search results',
          enum: ['d1', 'w1', 'm1', 'y1', 'd7', 'w2', 'm2', 'y2', 'm6', 'y'],
        },
        safe: {
          type: 'string',
          description: 'Safe search level',
          enum: ['active', 'off'],
        },
        exactTerms: {
          type: 'string',
          description: 'Terms that must appear exactly as specified',
        },
        excludeTerms: {
          type: 'string',
          description: 'Terms to exclude from search results',
        },
        sort: {
          type: 'string',
          description: 'Sort order for results',
          enum: ['date'],
        },
        gl: {
          type: 'string',
          description: 'Country code for geolocation (e.g., "us", "uk")',
        },
        hl: {
          type: 'string',
          description: 'Language code for interface (e.g., "en", "es")',
        },
        num: {
          type: 'number',
          description: 'Number of results to return (1-10)',
          minimum: 1,
          maximum: 10,
        },
        start: {
          type: 'number',
          description: 'Starting index for results (1-based)',
          minimum: 1,
        },
      },
      required: ['q'],
    },
  },
  {
    name: 'extract_content',
    description: 'Extract main content and analyze sentiment from a web page',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL of the web page to extract content from',
        },
      },
      required: ['url'],
    },
  },
];

// Validation schemas
const searchQuerySchema = z.object({
  q: z.string().min(1),
  searchType: z.string().optional(),
  fileType: z.string().optional(),
  siteSearch: z.string().optional(),
  dateRestrict: z.string().optional(),
  safe: z.string().optional(),
  exactTerms: z.string().optional(),
  excludeTerms: z.string().optional(),
  sort: z.string().optional(),
  gl: z.string().optional(),
  hl: z.string().optional(),
  num: z.number().min(1).max(10).optional(),
  start: z.number().min(1).optional(),
});

const extractSchema = z.object({
  url: z.string().url(),
});

class GoogleSearchMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'google-search-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools,
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'google_search':
            return await this.handleGoogleSearch(args);
          case 'extract_content':
            return await this.handleExtractContent(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleGoogleSearch(args: unknown) {
    const validatedArgs = searchQuerySchema.parse(args);
    
    const params: Record<string, string> = {
      key: config.GOOGLE_API_KEY,
      cx: config.GOOGLE_CSE_ID,
      q: validatedArgs.q,
    };

    // Add optional parameters
    Object.entries(validatedArgs).forEach(([key, value]) => {
      if (key !== 'q' && value !== undefined) {
        params[key] = String(value);
      }
    });

    try {
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params,
        timeout: 10000,
      });

      const results = response.data;
      
      // Format the results for better readability
      const formattedResults = {
        searchInfo: {
          totalResults: results.searchInformation?.totalResults || '0',
          searchTime: results.searchInformation?.searchTime || '0',
          formattedSearchTime: results.searchInformation?.formattedSearchTime || '0',
        },
        items: results.items?.map((item: any) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          displayLink: item.displayLink,
          formattedUrl: item.formattedUrl,
          pagemap: item.pagemap,
        })) || [],
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formattedResults, null, 2),
          },
        ],
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error?.message || error.message;
        throw new Error(`Google Search API error: ${errorMessage}`);
      }
      throw error;
    }
  }

  private async handleExtractContent(args: unknown) {
    const validatedArgs = extractSchema.parse(args);
    
    try {
      const response = await axios.get(validatedArgs.url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GoogleSearchMCP/1.0)',
        },
      });

      const $ = cheerio.load(response.data);
      
      // Extract main content
      const mainContent = $('main').text() || $('article').text() || $('body').text();
      const title = $('title').text() || $('h1').first().text();
      
      // Clean up the content
      const cleanedContent = mainContent
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 5000); // Limit content length
      
      // Analyze sentiment
      const sentimentResult = sentiment.analyze(cleanedContent);
      
      const extractedData = {
        url: validatedArgs.url,
        title: title.trim(),
        content: cleanedContent,
        sentiment: {
          score: sentimentResult.score,
          comparative: sentimentResult.comparative,
          positive: sentimentResult.positive,
          negative: sentimentResult.negative,
        },
        wordCount: cleanedContent.split(' ').length,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(extractedData, null, 2),
          },
        ],
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.status === 404 
          ? 'Page not found' 
          : `HTTP ${error.response?.status}: ${error.message}`;
        throw new Error(`Content extraction failed: ${errorMessage}`);
      }
      throw error;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Google Search MCP server running on stdio');
  }
}

export default GoogleSearchMCPServer;
