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
  {
    name: 'search_analytics',
    description: 'Analyze search trends and get insights from multiple search queries',
    inputSchema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of search queries to analyze',
          minItems: 1,
          maxItems: 5,
        },
        timeRange: {
          type: 'string',
          enum: ['week', 'month', 'year'],
          description: 'Time range for trend analysis',
          default: 'month',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum results per query',
          minimum: 1,
          maximum: 5,
          default: 3,
        },
      },
      required: ['queries'],
    },
  },
  {
    name: 'multi_site_search',
    description: 'Search across multiple specific websites simultaneously',
    inputSchema: {
      type: 'object',
      properties: {
        query: { 
          type: 'string', 
          description: 'Search query' 
        },
        sites: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of websites to search (e.g., ["github.com", "stackoverflow.com"])',
          minItems: 1,
          maxItems: 5,
        },
        maxResults: { 
          type: 'number', 
          description: 'Max results per site',
          minimum: 1,
          maximum: 5,
          default: 3,
        },
        fileType: {
          type: 'string',
          description: 'File type to search for',
          enum: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'rtf'],
        },
      },
      required: ['query', 'sites'],
    },
  },
  {
    name: 'news_monitor',
    description: 'Monitor news and get alerts for specific topics',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { 
          type: 'string', 
          description: 'Topic to monitor' 
        },
        sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'News sources to monitor (e.g., ["bbc.com", "cnn.com", "reuters.com"])',
          default: [],
        },
        language: { 
          type: 'string', 
          description: 'Language code (e.g., "en", "es")',
          default: 'en',
        },
        country: { 
          type: 'string', 
          description: 'Country code (e.g., "us", "uk")',
          default: 'us',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum results to return',
          minimum: 1,
          maximum: 10,
          default: 5,
        },
        dateRestrict: {
          type: 'string',
          description: 'Date restriction for news',
          enum: ['d1', 'd7', 'm1', 'm6', 'y1'],
          default: 'd7',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'academic_search',
    description: 'Search academic papers and research documents',
    inputSchema: {
      type: 'object',
      properties: {
        query: { 
          type: 'string', 
          description: 'Research query' 
        },
        fileType: { 
          type: 'string', 
          enum: ['pdf'], 
          description: 'File type (PDF only)',
          default: 'pdf',
        },
        dateRange: { 
          type: 'string', 
          description: 'Publication date range',
          enum: ['d1', 'd7', 'm1', 'm6', 'y1', 'y2'],
          default: 'y1',
        },
        sites: {
          type: 'array',
          items: { type: 'string' },
          description: 'Academic sites to search',
          default: ['arxiv.org', 'scholar.google.com', 'researchgate.net'],
        },
        maxResults: {
          type: 'number',
          description: 'Maximum results to return',
          minimum: 1,
          maximum: 10,
          default: 5,
        },
      },
      required: ['query'],
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

const searchAnalyticsSchema = z.object({
  queries: z.array(z.string().min(1)).min(1).max(5),
  timeRange: z.enum(['week', 'month', 'year']).optional(),
  maxResults: z.number().min(1).max(5).optional(),
});

const multiSiteSearchSchema = z.object({
  query: z.string().min(1),
  sites: z.array(z.string().min(1)).min(1).max(5),
  maxResults: z.number().min(1).max(5).optional(),
  fileType: z.string().optional(),
});

const newsMonitorSchema = z.object({
  topic: z.string().min(1),
  sources: z.array(z.string()).optional(),
  language: z.string().optional(),
  country: z.string().optional(),
  maxResults: z.number().min(1).max(10).optional(),
  dateRestrict: z.enum(['d1', 'd7', 'm1', 'm6', 'y1']).optional(),
});

const academicSearchSchema = z.object({
  query: z.string().min(1),
  fileType: z.enum(['pdf']).optional(),
  dateRange: z.enum(['d1', 'd7', 'm1', 'm6', 'y1', 'y2']).optional(),
  sites: z.array(z.string()).optional(),
  maxResults: z.number().min(1).max(10).optional(),
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
          case 'search_analytics':
            return await this.handleSearchAnalytics(args);
          case 'multi_site_search':
            return await this.handleMultiSiteSearch(args);
          case 'news_monitor':
            return await this.handleNewsMonitor(args);
          case 'academic_search':
            return await this.handleAcademicSearch(args);
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

  private async handleSearchAnalytics(args: unknown) {
    const validatedArgs = searchAnalyticsSchema.parse(args);
    
    const analyticsResults = {
      queries: validatedArgs.queries,
      timeRange: validatedArgs.timeRange || 'month',
      results: [] as any[],
      summary: {
        totalResults: 0,
        averageResults: 0,
        topPerformingQuery: '',
        commonKeywords: [] as string[],
      },
    };

    // Execute searches for each query
    for (const query of validatedArgs.queries) {
      try {
        const params: Record<string, string> = {
          key: config.GOOGLE_API_KEY,
          cx: config.GOOGLE_CSE_ID,
          q: query,
          num: String(validatedArgs.maxResults || 3),
        };

        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params,
          timeout: 10000,
        });

        const resultCount = parseInt(response.data.searchInformation?.totalResults || '0');
        analyticsResults.results.push({
          query,
          resultCount,
          items: response.data.items?.slice(0, validatedArgs.maxResults || 3) || [],
        });

        analyticsResults.summary.totalResults += resultCount;
      } catch (error) {
        analyticsResults.results.push({
          query,
          error: error instanceof Error ? error.message : 'Search failed',
        });
      }
    }

    // Calculate analytics
    const successfulResults = analyticsResults.results.filter(r => !r.error);
    analyticsResults.summary.averageResults = successfulResults.length > 0 
      ? analyticsResults.summary.totalResults / successfulResults.length 
      : 0;

    // Find top performing query
    const topResult = successfulResults.reduce((max, current) => 
      current.resultCount > max.resultCount ? current : max, 
      { resultCount: 0, query: '' }
    );
    analyticsResults.summary.topPerformingQuery = topResult.query;

    // Extract common keywords
    const allQueries = validatedArgs.queries.join(' ').toLowerCase();
    const words = allQueries.split(/\s+/).filter(word => word.length > 3);
    const wordCount = words.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    analyticsResults.summary.commonKeywords = Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(analyticsResults, null, 2),
        },
      ],
    };
  }

  private async handleMultiSiteSearch(args: unknown) {
    const validatedArgs = multiSiteSearchSchema.parse(args);
    
    const multiSiteResults = {
      query: validatedArgs.query,
      sites: validatedArgs.sites,
      results: [] as any[],
      summary: {
        totalResults: 0,
        sitesSearched: 0,
        successfulSearches: 0,
      },
    };

    // Search each site
    for (const site of validatedArgs.sites) {
      try {
        const params: Record<string, string> = {
          key: config.GOOGLE_API_KEY,
          cx: config.GOOGLE_CSE_ID,
          q: validatedArgs.query,
          siteSearch: site,
          num: String(validatedArgs.maxResults || 3),
        };

        if (validatedArgs.fileType) {
          params.fileType = validatedArgs.fileType;
        }

        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params,
          timeout: 10000,
        });

        const siteResults = response.data.items || [];
        multiSiteResults.results.push({
          site,
          resultCount: siteResults.length,
          totalAvailable: parseInt(response.data.searchInformation?.totalResults || '0'),
          items: siteResults,
        });

        multiSiteResults.summary.totalResults += siteResults.length;
        multiSiteResults.summary.successfulSearches++;
      } catch (error) {
        multiSiteResults.results.push({
          site,
          error: error instanceof Error ? error.message : 'Search failed',
        });
      }
      multiSiteResults.summary.sitesSearched++;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(multiSiteResults, null, 2),
        },
      ],
    };
  }

  private async handleNewsMonitor(args: unknown) {
    const validatedArgs = newsMonitorSchema.parse(args);
    
    const newsResults = {
      topic: validatedArgs.topic,
      sources: validatedArgs.sources || [],
      language: validatedArgs.language || 'en',
      country: validatedArgs.country || 'us',
      dateRestrict: validatedArgs.dateRestrict || 'd7',
      results: [] as any[],
      summary: {
        totalArticles: 0,
        sourcesFound: 0,
        dateRange: validatedArgs.dateRestrict || 'd7',
      },
    };

    // If specific sources provided, search each one
    if (validatedArgs.sources && validatedArgs.sources.length > 0) {
      for (const source of validatedArgs.sources) {
        try {
          const params: Record<string, string> = {
            key: config.GOOGLE_API_KEY,
            cx: config.GOOGLE_CSE_ID,
            q: validatedArgs.topic,
            siteSearch: source,
            searchType: 'news',
            num: String(validatedArgs.maxResults || 5),
            dateRestrict: validatedArgs.dateRestrict || 'd7',
            hl: validatedArgs.language || 'en',
            gl: validatedArgs.country || 'us',
          };

          const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params,
            timeout: 10000,
          });

          const articles = response.data.items || [];
          newsResults.results.push({
            source,
            articleCount: articles.length,
            articles,
          });

          newsResults.summary.totalArticles += articles.length;
          newsResults.summary.sourcesFound++;
        } catch (error) {
          newsResults.results.push({
            source,
            error: error instanceof Error ? error.message : 'Search failed',
          });
        }
      }
    } else {
      // General news search
      try {
        const params: Record<string, string> = {
          key: config.GOOGLE_API_KEY,
          cx: config.GOOGLE_CSE_ID,
          q: validatedArgs.topic,
          searchType: 'news',
          num: String(validatedArgs.maxResults || 5),
          dateRestrict: validatedArgs.dateRestrict || 'd7',
          hl: validatedArgs.language || 'en',
          gl: validatedArgs.country || 'us',
        };

        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params,
          timeout: 10000,
        });

        const articles = response.data.items || [];
        newsResults.results.push({
          source: 'general_news',
          articleCount: articles.length,
          articles,
        });

        newsResults.summary.totalArticles = articles.length;
        newsResults.summary.sourcesFound = 1;
      } catch (error) {
        newsResults.results.push({
          source: 'general_news',
          error: error instanceof Error ? error.message : 'Search failed',
        });
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(newsResults, null, 2),
        },
      ],
    };
  }

  private async handleAcademicSearch(args: unknown) {
    const validatedArgs = academicSearchSchema.parse(args);
    
    const academicResults = {
      query: validatedArgs.query,
      fileType: validatedArgs.fileType || 'pdf',
      dateRange: validatedArgs.dateRange || 'y1',
      sites: validatedArgs.sites || ['arxiv.org', 'scholar.google.com', 'researchgate.net'],
      results: [] as any[],
      summary: {
        totalPapers: 0,
        sitesSearched: 0,
        successfulSearches: 0,
        dateRange: validatedArgs.dateRange || 'y1',
      },
    };

    // Search each academic site
    for (const site of validatedArgs.sites || ['arxiv.org', 'scholar.google.com', 'researchgate.net']) {
      try {
        const params: Record<string, string> = {
          key: config.GOOGLE_API_KEY,
          cx: config.GOOGLE_CSE_ID,
          q: validatedArgs.query,
          siteSearch: site,
          fileType: validatedArgs.fileType || 'pdf',
          num: String(validatedArgs.maxResults || 5),
          dateRestrict: validatedArgs.dateRange || 'y1',
        };

        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params,
          timeout: 10000,
        });

        const papers = response.data.items || [];
        academicResults.results.push({
          site,
          paperCount: papers.length,
          totalAvailable: parseInt(response.data.searchInformation?.totalResults || '0'),
          papers,
        });

        academicResults.summary.totalPapers += papers.length;
        academicResults.summary.successfulSearches++;
      } catch (error) {
        academicResults.results.push({
          site,
          error: error instanceof Error ? error.message : 'Search failed',
        });
      }
      academicResults.summary.sitesSearched++;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(academicResults, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Google Search MCP server running on stdio');
  }
}

export default GoogleSearchMCPServer;
