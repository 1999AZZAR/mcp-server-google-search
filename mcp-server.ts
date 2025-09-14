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
  {
    name: 'content_summarizer',
    description: 'Extract and summarize content from multiple URLs with sentiment analysis and intelligent insights',
    inputSchema: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: {
            type: 'string',
            format: 'uri',
          },
          description: 'Array of URLs to summarize (1-10 URLs)',
          minItems: 1,
          maxItems: 10,
        },
        maxLength: {
          type: 'number',
          description: 'Maximum length of summary per URL in words',
          minimum: 50,
          maximum: 500,
          default: 200,
        },
        includeSentiment: {
          type: 'boolean',
          description: 'Include sentiment analysis for each URL',
          default: true,
        },
        focusAreas: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Specific areas to focus on in summaries (e.g., ["key points", "conclusions", "data"])',
          maxItems: 5,
        },
        generateOverallSummary: {
          type: 'boolean',
          description: 'Generate an overall summary combining all URLs',
          default: true,
        },
      },
      required: ['urls'],
    },
  },
  {
    name: 'fact_checker',
    description: 'Verify claims by searching multiple authoritative sources with credibility analysis and evidence extraction',
    inputSchema: {
      type: 'object',
      properties: {
        claim: {
          type: 'string',
          description: 'The claim or statement to verify',
          minLength: 10,
        },
        sources: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Specific authoritative sources to check (e.g., ["wikipedia.org", "bbc.com", "reuters.com"])',
          maxItems: 10,
        },
        confidenceThreshold: {
          type: 'number',
          description: 'Minimum confidence level for verification (0.0-1.0)',
          minimum: 0.0,
          maximum: 1.0,
          default: 0.7,
        },
        timeframe: {
          type: 'string',
          description: 'Time range for search results',
          enum: ['d1', 'd7', 'm1', 'm6', 'y1', 'y2'],
          default: 'y1',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum results per source',
          minimum: 1,
          maximum: 5,
          default: 3,
        },
        includeEvidence: {
          type: 'boolean',
          description: 'Include extracted evidence snippets',
          default: true,
        },
      },
      required: ['claim'],
    },
  },
  {
    name: 'research_assistant',
    description: 'Comprehensive research assistant with multi-step workflows, source synthesis, and structured report generation',
    inputSchema: {
      type: 'object',
      properties: {
        researchTopic: {
          type: 'string',
          description: 'The main research topic or question to investigate',
          minLength: 10,
        },
        researchType: {
          type: 'string',
          description: 'Type of research to conduct',
          enum: ['academic', 'news', 'factual', 'comprehensive'],
          default: 'comprehensive',
        },
        depth: {
          type: 'string',
          description: 'Research depth level',
          enum: ['quick', 'standard', 'deep'],
          default: 'standard',
        },
        sources: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Specific sources to include in research (optional)',
          maxItems: 15,
        },
        excludeSources: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Sources to exclude from research',
          maxItems: 10,
        },
        timeframe: {
          type: 'string',
          description: 'Time range for research results',
          enum: ['d1', 'd7', 'm1', 'm6', 'y1', 'y2'],
          default: 'y1',
        },
        maxSourcesPerType: {
          type: 'number',
          description: 'Maximum sources per source type',
          minimum: 2,
          maximum: 8,
          default: 5,
        },
        includeCitations: {
          type: 'boolean',
          description: 'Include detailed citations and source tracking',
          default: true,
        },
        generateReport: {
          type: 'boolean',
          description: 'Generate structured research report',
          default: true,
        },
        focusAreas: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Specific areas to focus research on (e.g., ["methodology", "findings", "implications"])',
          maxItems: 5,
        },
      },
      required: ['researchTopic'],
    },
  },
];

// Validation schemas
const searchQuerySchema = z.object({
  q: z.string().min(1),
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

const contentSummarizerSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(10),
  maxLength: z.number().min(50).max(500).optional(),
  includeSentiment: z.boolean().optional(),
  focusAreas: z.array(z.string()).max(5).optional(),
  generateOverallSummary: z.boolean().optional(),
});

const factCheckerSchema = z.object({
  claim: z.string().min(10),
  sources: z.array(z.string()).max(10).optional(),
  confidenceThreshold: z.number().min(0.0).max(1.0).optional(),
  timeframe: z.enum(['d1', 'd7', 'm1', 'm6', 'y1', 'y2']).optional(),
  maxResults: z.number().min(1).max(5).optional(),
  includeEvidence: z.boolean().optional(),
});

const researchAssistantSchema = z.object({
  researchTopic: z.string().min(10),
  researchType: z.enum(['academic', 'news', 'factual', 'comprehensive']).optional(),
  depth: z.enum(['quick', 'standard', 'deep']).optional(),
  sources: z.array(z.string()).max(15).optional(),
  excludeSources: z.array(z.string()).max(10).optional(),
  timeframe: z.enum(['d1', 'd7', 'm1', 'm6', 'y1', 'y2']).optional(),
  maxSourcesPerType: z.number().min(2).max(8).optional(),
  includeCitations: z.boolean().optional(),
  generateReport: z.boolean().optional(),
  focusAreas: z.array(z.string()).max(5).optional(),
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
          case 'content_summarizer':
            return await this.handleContentSummarizer(args);
          case 'fact_checker':
            return await this.handleFactChecker(args);
          case 'research_assistant':
            return await this.handleResearchAssistant(args);
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

    // Add optional parameters (excluding invalid ones)
    const validParams = ['fileType', 'siteSearch', 'dateRestrict', 'safe', 'exactTerms', 'excludeTerms', 'sort', 'gl', 'hl', 'num', 'start'];
    Object.entries(validatedArgs).forEach(([key, value]) => {
      if (key !== 'q' && value !== undefined && validParams.includes(key)) {
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

  private async handleContentSummarizer(args: unknown) {
    const validatedArgs = contentSummarizerSchema.parse(args);
    
    const summaryResults = {
      urls: validatedArgs.urls,
      maxLength: validatedArgs.maxLength || 200,
      includeSentiment: validatedArgs.includeSentiment !== false,
      focusAreas: validatedArgs.focusAreas || [],
      generateOverallSummary: validatedArgs.generateOverallSummary !== false,
      summaries: [] as any[],
      overallSummary: '',
      statistics: {
        totalUrls: validatedArgs.urls.length,
        successfulExtractions: 0,
        failedExtractions: 0,
        averageWordCount: 0,
        sentimentDistribution: {
          positive: 0,
          negative: 0,
          neutral: 0,
        },
      },
    };

    // Process each URL
    for (const url of validatedArgs.urls) {
      try {
        // Extract content using existing method
        const contentResult = await this.extractContentFromUrl(url);
        
        if (contentResult.success && contentResult.data) {
          const { title, content, wordCount, sentiment } = contentResult.data;
          
          // Generate summary based on focus areas
          const summary = this.generateSummary(content, validatedArgs.maxLength || 200, validatedArgs.focusAreas);
          
          summaryResults.summaries.push({
            url,
            title,
            summary,
            wordCount,
            sentiment: validatedArgs.includeSentiment ? sentiment : undefined,
            extractionTime: new Date().toISOString(),
          });

          summaryResults.statistics.successfulExtractions++;
          summaryResults.statistics.averageWordCount += wordCount;
          
          // Update sentiment distribution
          if (validatedArgs.includeSentiment && sentiment) {
            if (sentiment.comparative > 0.1) summaryResults.statistics.sentimentDistribution.positive++;
            else if (sentiment.comparative < -0.1) summaryResults.statistics.sentimentDistribution.negative++;
            else summaryResults.statistics.sentimentDistribution.neutral++;
          }
        } else {
          summaryResults.summaries.push({
            url,
            error: contentResult.error,
            extractionTime: new Date().toISOString(),
          });
          summaryResults.statistics.failedExtractions++;
        }
      } catch (error) {
        summaryResults.summaries.push({
          url,
          error: error instanceof Error ? error.message : 'Unknown error',
          extractionTime: new Date().toISOString(),
        });
        summaryResults.statistics.failedExtractions++;
      }
    }

    // Calculate average word count
    if (summaryResults.statistics.successfulExtractions > 0) {
      summaryResults.statistics.averageWordCount = 
        Math.round(summaryResults.statistics.averageWordCount / summaryResults.statistics.successfulExtractions);
    }

    // Generate overall summary if requested
    if (validatedArgs.generateOverallSummary && summaryResults.statistics.successfulExtractions > 0) {
      const allSummaries = summaryResults.summaries
        .filter(s => s.summary)
        .map(s => s.summary)
        .join(' ');
      summaryResults.overallSummary = this.generateSummary(allSummaries, 300, ['key insights', 'main themes', 'conclusions']);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(summaryResults, null, 2),
        },
      ],
    };
  }

  private async extractContentFromUrl(url: string) {
    try {
      const response = await axios.get(url, {
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
        .substring(0, 10000); // Limit content length for processing
      
      // Analyze sentiment
      const sentimentResult = sentiment.analyze(cleanedContent);
      
      return {
        success: true,
        data: {
          title: title.trim(),
          content: cleanedContent,
          wordCount: cleanedContent.split(' ').length,
          sentiment: {
            score: sentimentResult.score,
            comparative: sentimentResult.comparative,
            positive: sentimentResult.positive,
            negative: sentimentResult.negative,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private generateSummary(content: string, maxLength: number, focusAreas?: string[]): string {
    // Simple extractive summarization - extract key sentences
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    if (sentences.length === 0) {
      return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
    }

    // Score sentences based on length and word frequency
    const wordFreq: { [key: string]: number } = {};
    const words = content.toLowerCase().match(/\b\w+\b/g) || [];
    
    words.forEach(word => {
      if (word.length > 3) { // Ignore short words
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    const scoredSentences = sentences.map(sentence => {
      const sentenceWords = sentence.toLowerCase().match(/\b\w+\b/g) || [];
      const score = sentenceWords.reduce((sum, word) => sum + (wordFreq[word] || 0), 0);
      return { sentence: sentence.trim(), score };
    });

    // Sort by score and take top sentences
    scoredSentences.sort((a, b) => b.score - a.score);
    
    let summary = '';
    let currentLength = 0;
    
    for (const { sentence } of scoredSentences) {
      if (currentLength + sentence.length > maxLength) break;
      summary += sentence + '. ';
      currentLength += sentence.length + 2;
    }

    return summary.trim() || content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
  }

  private async handleFactChecker(args: unknown) {
    const validatedArgs = factCheckerSchema.parse(args);
    
    // Default authoritative sources if none provided
    const defaultSources = [
      'wikipedia.org',
      'bbc.com',
      'reuters.com',
      'ap.org',
      'factcheck.org',
      'snopes.com',
      'politifact.com',
      'scholar.google.com',
      'pubmed.ncbi.nlm.nih.gov',
      'nature.com'
    ];
    
    const sourcesToCheck = validatedArgs.sources && validatedArgs.sources.length > 0 
      ? validatedArgs.sources 
      : defaultSources;

    const factCheckResults = {
      claim: validatedArgs.claim,
      sourcesToCheck: sourcesToCheck,
      confidenceThreshold: validatedArgs.confidenceThreshold || 0.7,
      timeframe: validatedArgs.timeframe || 'y1',
      maxResults: validatedArgs.maxResults || 3,
      includeEvidence: validatedArgs.includeEvidence !== false,
      verification: {
        status: 'unknown' as 'verified' | 'disputed' | 'unverified' | 'unknown',
        confidence: 0,
        evidenceCount: 0,
        supportingSources: [] as string[],
        disputingSources: [] as string[],
        neutralSources: [] as string[],
      },
      sources: [] as any[],
      evidence: [] as any[],
      statistics: {
        totalSourcesChecked: sourcesToCheck.length,
        successfulSearches: 0,
        failedSearches: 0,
        totalResults: 0,
        averageRelevanceScore: 0,
      },
    };

    // Search each source for the claim
    for (const source of sourcesToCheck) {
      try {
        const params: Record<string, string> = {
          key: config.GOOGLE_API_KEY,
          cx: config.GOOGLE_CSE_ID,
          q: validatedArgs.claim,
          siteSearch: source,
          num: String(validatedArgs.maxResults || 3),
          dateRestrict: validatedArgs.timeframe || 'y1',
        };

        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params,
          timeout: 10000,
        });

        const results = response.data.items || [];
        factCheckResults.statistics.successfulSearches++;
        factCheckResults.statistics.totalResults += results.length;

        if (results.length > 0) {
          const sourceResults = {
            source,
            resultCount: results.length,
            totalAvailable: response.data.searchInformation?.totalResults || '0',
            results: results.map((item: any) => ({
              title: item.title,
              link: item.link,
              snippet: item.snippet,
              displayLink: item.displayLink,
              relevanceScore: this.calculateRelevanceScore(validatedArgs.claim, item.snippet),
            })),
            credibilityScore: this.calculateCredibilityScore(source),
          };

          factCheckResults.sources.push(sourceResults);

          // Extract evidence if requested
          if (validatedArgs.includeEvidence) {
            for (const result of results) {
              try {
                const evidenceResult = await this.extractEvidenceFromUrl(result.link, validatedArgs.claim);
                if (evidenceResult.success && evidenceResult.evidence) {
                  factCheckResults.evidence.push({
                    source,
                    url: result.link,
                    title: result.title,
                    evidence: evidenceResult.evidence,
                    relevanceScore: evidenceResult.relevanceScore,
                    sentiment: evidenceResult.sentiment,
                  });
                  factCheckResults.verification.evidenceCount++;
                }
              } catch (error) {
                // Continue with other evidence extraction attempts
              }
            }
          }
        }
      } catch (error) {
        factCheckResults.statistics.failedSearches++;
        factCheckResults.sources.push({
          source,
          error: error instanceof Error ? error.message : 'Search failed',
        });
      }
    }

    // Analyze verification status
    this.analyzeVerificationStatus(factCheckResults);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(factCheckResults, null, 2),
        },
      ],
    };
  }

  private calculateRelevanceScore(claim: string, snippet: string): number {
    const claimWords = claim.toLowerCase().split(/\s+/);
    const snippetWords = snippet.toLowerCase().split(/\s+/);
    
    let matches = 0;
    claimWords.forEach(word => {
      if (word.length > 3 && snippetWords.includes(word)) {
        matches++;
      }
    });
    
    return Math.min(matches / claimWords.length, 1.0);
  }

  private calculateCredibilityScore(source: string): number {
    const credibilityMap: { [key: string]: number } = {
      'wikipedia.org': 0.8,
      'bbc.com': 0.9,
      'reuters.com': 0.9,
      'ap.org': 0.9,
      'factcheck.org': 0.95,
      'snopes.com': 0.9,
      'politifact.com': 0.9,
      'scholar.google.com': 0.95,
      'pubmed.ncbi.nlm.nih.gov': 0.95,
      'nature.com': 0.9,
      'science.org': 0.9,
      'nejm.org': 0.95,
      'who.int': 0.9,
      'cdc.gov': 0.9,
      'nih.gov': 0.9,
    };
    
    return credibilityMap[source] || 0.5;
  }

  private async extractEvidenceFromUrl(url: string, claim: string) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GoogleSearchMCP/1.0)',
        },
      });

      const $ = cheerio.load(response.data);
      const content = $('main').text() || $('article').text() || $('body').text();
      
      // Find sentences that contain claim-related keywords
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
      const claimWords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      
      const relevantSentences = sentences.filter(sentence => {
        const sentenceLower = sentence.toLowerCase();
        return claimWords.some(word => sentenceLower.includes(word));
      });

      if (relevantSentences.length > 0) {
        const evidence = relevantSentences.slice(0, 3).join('. ').trim();
        const relevanceScore = this.calculateRelevanceScore(claim, evidence);
        const sentimentResult = sentiment.analyze(evidence);
        
        return {
          success: true,
          evidence,
          relevanceScore,
          sentiment: {
            score: sentimentResult.score,
            comparative: sentimentResult.comparative,
          },
        };
      }
      
      return { success: false, error: 'No relevant evidence found' };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private analyzeVerificationStatus(factCheckResults: any) {
    const { verification, sources, evidence } = factCheckResults;
    
    let supportingCount = 0;
    let disputingCount = 0;
    let neutralCount = 0;
    let totalCredibility = 0;
    let totalRelevance = 0;
    let sourceCount = 0;

    sources.forEach((source: any) => {
      if (source.results && source.results.length > 0) {
        sourceCount++;
        totalCredibility += source.credibilityScore || 0.5;
        
        // Analyze sentiment of results
        source.results.forEach((result: any) => {
          totalRelevance += result.relevanceScore || 0;
          
          // Simple sentiment analysis based on keywords
          const snippet = result.snippet.toLowerCase();
          if (snippet.includes('confirmed') || snippet.includes('verified') || snippet.includes('true')) {
            supportingCount++;
            verification.supportingSources.push(source.source);
          } else if (snippet.includes('false') || snippet.includes('disputed') || snippet.includes('debunked')) {
            disputingCount++;
            verification.disputingSources.push(source.source);
          } else {
            neutralCount++;
            verification.neutralSources.push(source.source);
          }
        });
      }
    });

    // Calculate overall confidence
    const avgCredibility = sourceCount > 0 ? totalCredibility / sourceCount : 0;
    const avgRelevance = sourceCount > 0 ? totalRelevance / sourceCount : 0;
    verification.confidence = (avgCredibility + avgRelevance) / 2;

    // Determine verification status
    if (supportingCount > disputingCount && verification.confidence >= factCheckResults.confidenceThreshold) {
      verification.status = 'verified';
    } else if (disputingCount > supportingCount && verification.confidence >= factCheckResults.confidenceThreshold) {
      verification.status = 'disputed';
    } else if (supportingCount > 0 || disputingCount > 0) {
      verification.status = 'unverified';
    } else {
      verification.status = 'unknown';
    }

    // Remove duplicates from source arrays
    verification.supportingSources = [...new Set(verification.supportingSources)];
    verification.disputingSources = [...new Set(verification.disputingSources)];
    verification.neutralSources = [...new Set(verification.neutralSources)];
  }

  private async handleResearchAssistant(args: unknown) {
    const validatedArgs = researchAssistantSchema.parse(args);
    
    // Define source categories based on research type
    const sourceCategories = this.getSourceCategories(validatedArgs.researchType || 'comprehensive');
    
    // Filter sources based on include/exclude lists
    const sourcesToUse = this.filterSources(sourceCategories, validatedArgs.sources, validatedArgs.excludeSources);
    
    const researchResults = {
      researchTopic: validatedArgs.researchTopic,
      researchType: validatedArgs.researchType || 'comprehensive',
      depth: validatedArgs.depth || 'standard',
      timeframe: validatedArgs.timeframe || 'y1',
      maxSourcesPerType: validatedArgs.maxSourcesPerType || 5,
      includeCitations: validatedArgs.includeCitations !== false,
      generateReport: validatedArgs.generateReport !== false,
      focusAreas: validatedArgs.focusAreas || [],
      researchWorkflow: {
        phase: 'initialization',
        stepsCompleted: 0,
        totalSteps: 0,
        currentStep: '',
      },
      sourceCategories: Object.keys(sourcesToUse),
      findings: [] as any[],
      sources: [] as any[],
      citations: [] as any[],
      synthesis: {
        keyFindings: [] as string[],
        conflictingInformation: [] as string[],
        consensusPoints: [] as string[],
        gapsInKnowledge: [] as string[],
        confidenceLevel: 0,
      },
      report: null as any,
      statistics: {
        totalSourcesSearched: 0,
        successfulSearches: 0,
        failedSearches: 0,
        totalResults: 0,
        averageCredibilityScore: 0,
        researchQualityScore: 0,
      },
    };

    // Phase 1: Multi-source research
    researchResults.researchWorkflow.phase = 'multi_source_research';
    researchResults.researchWorkflow.totalSteps = Object.keys(sourcesToUse).length;
    
    for (const [category, sources] of Object.entries(sourcesToUse)) {
      researchResults.researchWorkflow.currentStep = `Researching ${category} sources`;
      researchResults.researchWorkflow.stepsCompleted++;
      
      const categoryResults = await this.researchCategory(
        validatedArgs.researchTopic,
        sources as string[],
        category,
        validatedArgs.maxSourcesPerType || 5,
        validatedArgs.timeframe || 'y1'
      );
      
      researchResults.sources.push(...categoryResults.sources);
      researchResults.findings.push(...categoryResults.findings);
      researchResults.statistics.totalSourcesSearched += categoryResults.sources.length;
      researchResults.statistics.successfulSearches += categoryResults.successfulSearches;
      researchResults.statistics.failedSearches += categoryResults.failedSearches;
      researchResults.statistics.totalResults += categoryResults.totalResults;
    }

    // Phase 2: Content extraction and analysis
    researchResults.researchWorkflow.phase = 'content_analysis';
    researchResults.researchWorkflow.currentStep = 'Extracting and analyzing content';
    
    const analysisResults = await this.analyzeResearchContent(researchResults.findings, validatedArgs.focusAreas);
    researchResults.findings = analysisResults.findings;
    researchResults.statistics.averageCredibilityScore = analysisResults.averageCredibilityScore;

    // Phase 3: Synthesis and cross-reference analysis
    researchResults.researchWorkflow.phase = 'synthesis';
    researchResults.researchWorkflow.currentStep = 'Synthesizing findings across sources';
    
    const synthesisResults = await this.synthesizeResearchFindings(researchResults.findings, researchResults.sources);
    researchResults.synthesis = synthesisResults;

    // Phase 4: Citation management
    if (validatedArgs.includeCitations) {
      researchResults.researchWorkflow.phase = 'citation_management';
      researchResults.researchWorkflow.currentStep = 'Managing citations and references';
      
      researchResults.citations = this.generateCitations(researchResults.sources, researchResults.findings);
    }

    // Phase 5: Report generation
    if (validatedArgs.generateReport) {
      researchResults.researchWorkflow.phase = 'report_generation';
      researchResults.researchWorkflow.currentStep = 'Generating structured research report';
      
      researchResults.report = this.generateResearchReport(researchResults, validatedArgs.focusAreas);
    }

    // Calculate final statistics
    researchResults.statistics.researchQualityScore = this.calculateResearchQualityScore(researchResults);
    researchResults.researchWorkflow.phase = 'completed';
    researchResults.researchWorkflow.stepsCompleted = researchResults.researchWorkflow.totalSteps;
    researchResults.researchWorkflow.currentStep = 'Research completed';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(researchResults, null, 2),
        },
      ],
    };
  }

  private getSourceCategories(researchType: string): { [key: string]: string[] } {
    const categories = {
      academic: {
        'Academic Journals': ['scholar.google.com', 'pubmed.ncbi.nlm.nih.gov', 'nature.com', 'science.org', 'nejm.org'],
        'Educational': ['wikipedia.org', 'edu', 'mit.edu', 'stanford.edu'],
        'Research': ['arxiv.org', 'researchgate.net', 'academia.edu'],
      },
      news: {
        'News Sources': ['bbc.com', 'reuters.com', 'ap.org', 'cnn.com', 'nytimes.com'],
        'Fact Checkers': ['factcheck.org', 'snopes.com', 'politifact.com'],
        'International': ['guardian.com', 'dw.com', 'france24.com'],
      },
      factual: {
        'Government': ['who.int', 'cdc.gov', 'nih.gov', 'gov', 'europa.eu'],
        'Scientific': ['nature.com', 'science.org', 'pubmed.ncbi.nlm.nih.gov'],
        'Reference': ['wikipedia.org', 'britannica.com', 'encyclopedia.com'],
      },
      comprehensive: {
        'Academic': ['scholar.google.com', 'pubmed.ncbi.nlm.nih.gov', 'nature.com', 'science.org'],
        'News': ['bbc.com', 'reuters.com', 'ap.org', 'factcheck.org'],
        'Government': ['who.int', 'cdc.gov', 'nih.gov'],
        'Reference': ['wikipedia.org', 'britannica.com'],
        'Specialized': ['arxiv.org', 'researchgate.net'],
      },
    };
    
    return categories[researchType as keyof typeof categories] || categories.comprehensive;
  }

  private filterSources(
    sourceCategories: { [key: string]: string[] },
    includeSources?: string[],
    excludeSources?: string[]
  ): { [key: string]: string[] } {
    let filteredCategories = { ...sourceCategories };
    
    // Apply include filter
    if (includeSources && includeSources.length > 0) {
      filteredCategories = {};
      for (const [category, sources] of Object.entries(sourceCategories)) {
        const filteredSources = sources.filter(source => 
          includeSources.some(include => source.includes(include))
        );
        if (filteredSources.length > 0) {
          filteredCategories[category] = filteredSources;
        }
      }
    }
    
    // Apply exclude filter
    if (excludeSources && excludeSources.length > 0) {
      for (const [category, sources] of Object.entries(filteredCategories)) {
        filteredCategories[category] = sources.filter(source => 
          !excludeSources.some(exclude => source.includes(exclude))
        );
      }
    }
    
    return filteredCategories;
  }

  private async researchCategory(
    topic: string,
    sources: string[],
    category: string,
    maxSources: number,
    timeframe: string
  ) {
    const categoryResults = {
      category,
      sources: [] as any[],
      findings: [] as any[],
      successfulSearches: 0,
      failedSearches: 0,
      totalResults: 0,
    };

    for (const source of sources.slice(0, maxSources)) {
      try {
        const params: Record<string, string> = {
          key: config.GOOGLE_API_KEY,
          cx: config.GOOGLE_CSE_ID,
          q: topic,
          siteSearch: source,
          num: '5',
          dateRestrict: timeframe,
        };

        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params,
          timeout: 10000,
        });

        const results = response.data.items || [];
        categoryResults.successfulSearches++;
        categoryResults.totalResults += results.length;

        if (results.length > 0) {
          const sourceResult = {
            source,
            category,
            resultCount: results.length,
            totalAvailable: response.data.searchInformation?.totalResults || '0',
            results: results.map((item: any) => ({
              title: item.title,
              link: item.link,
              snippet: item.snippet,
              displayLink: item.displayLink,
              relevanceScore: this.calculateRelevanceScore(topic, item.snippet),
            })),
            credibilityScore: this.calculateCredibilityScore(source),
          };

          categoryResults.sources.push(sourceResult);

          // Extract content for analysis
          for (const result of results.slice(0, 2)) { // Limit to 2 per source for performance
            try {
              const contentResult = await this.extractContentFromUrl(result.link);
              if (contentResult.success && contentResult.data) {
                categoryResults.findings.push({
                  source,
                  category,
                  url: result.link,
                  title: result.title,
                  content: contentResult.data.content,
                  wordCount: contentResult.data.wordCount,
                  sentiment: contentResult.data.sentiment,
                  relevanceScore: this.calculateRelevanceScore(topic, contentResult.data.content),
                  extractionTime: new Date().toISOString(),
                });
              }
            } catch (error) {
              // Continue with other extractions
            }
          }
        }
      } catch (error) {
        categoryResults.failedSearches++;
        categoryResults.sources.push({
          source,
          category,
          error: error instanceof Error ? error.message : 'Search failed',
        });
      }
    }

    return categoryResults;
  }

  private async analyzeResearchContent(findings: any[], focusAreas?: string[]) {
    let totalCredibility = 0;
    let analyzedCount = 0;

    for (const finding of findings) {
      // Enhanced content analysis based on focus areas
      if (focusAreas && focusAreas.length > 0) {
        finding.focusAnalysis = this.analyzeFocusAreas(finding.content, focusAreas);
      }
      
      // Extract key insights
      finding.keyInsights = this.extractKeyInsights(finding.content);
      
      // Calculate content quality score
      finding.contentQualityScore = this.calculateContentQualityScore(finding);
      
      totalCredibility += finding.relevanceScore || 0;
      analyzedCount++;
    }

    return {
      findings,
      averageCredibilityScore: analyzedCount > 0 ? totalCredibility / analyzedCount : 0,
    };
  }

  private analyzeFocusAreas(content: string, focusAreas: string[]): { [key: string]: string[] } {
    const analysis: { [key: string]: string[] } = {};
    
    for (const area of focusAreas) {
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
      const relevantSentences = sentences.filter(sentence => {
        const sentenceLower = sentence.toLowerCase();
        const areaLower = area.toLowerCase();
        return sentenceLower.includes(areaLower) || 
               this.findRelatedTerms(sentenceLower, areaLower);
      });
      
      analysis[area] = relevantSentences.slice(0, 3); // Top 3 relevant sentences
    }
    
    return analysis;
  }

  private findRelatedTerms(sentence: string, term: string): boolean {
    const relatedTerms: { [key: string]: string[] } = {
      'methodology': ['method', 'approach', 'technique', 'procedure', 'process'],
      'findings': ['result', 'outcome', 'conclusion', 'discovery', 'evidence'],
      'implications': ['impact', 'consequence', 'significance', 'importance', 'effect'],
      'data': ['statistics', 'numbers', 'figures', 'measurements', 'analysis'],
      'research': ['study', 'investigation', 'examination', 'analysis', 'exploration'],
    };
    
    const terms = relatedTerms[term] || [term];
    return terms.some(relatedTerm => sentence.includes(relatedTerm));
  }

  private extractKeyInsights(content: string): string[] {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const insights: string[] = [];
    
    // Look for sentences with key indicators
    const indicators = ['shows', 'demonstrates', 'reveals', 'indicates', 'suggests', 'proves', 'confirms'];
    
    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase();
      if (indicators.some(indicator => sentenceLower.includes(indicator))) {
        insights.push(sentence.trim());
        if (insights.length >= 5) break; // Limit to 5 key insights
      }
    }
    
    return insights;
  }

  private calculateContentQualityScore(finding: any): number {
    let score = 0;
    
    // Word count factor (optimal range: 200-2000 words)
    const wordCount = finding.wordCount || 0;
    if (wordCount >= 200 && wordCount <= 2000) score += 0.3;
    else if (wordCount >= 100 && wordCount <= 3000) score += 0.2;
    
    // Relevance score
    score += (finding.relevanceScore || 0) * 0.4;
    
    // Credibility score
    score += (finding.credibilityScore || 0.5) * 0.3;
    
    return Math.min(score, 1.0);
  }

  private async synthesizeResearchFindings(findings: any[], sources: any[]) {
    const synthesis = {
      keyFindings: [] as string[],
      conflictingInformation: [] as string[],
      consensusPoints: [] as string[],
      gapsInKnowledge: [] as string[],
      confidenceLevel: 0,
    };

    // Group findings by topic similarity
    const topicGroups = this.groupFindingsByTopic(findings);
    
    // Analyze each topic group
    for (const [topic, groupFindings] of Object.entries(topicGroups)) {
      const analysis = this.analyzeTopicGroup(groupFindings);
      
      if (analysis.consensus) {
        synthesis.consensusPoints.push(`${topic}: ${analysis.consensus}`);
      }
      
      if (analysis.conflicts.length > 0) {
        synthesis.conflictingInformation.push(`${topic}: ${analysis.conflicts.join('; ')}`);
      }
      
      synthesis.keyFindings.push(...analysis.keyFindings);
    }

    // Calculate overall confidence
    synthesis.confidenceLevel = this.calculateSynthesisConfidence(findings, sources);
    
    return synthesis;
  }

  private groupFindingsByTopic(findings: any[]): { [key: string]: any[] } {
    const groups: { [key: string]: any[] } = {};
    
    for (const finding of findings) {
      const topic = this.extractMainTopic(finding.content);
      if (!groups[topic]) groups[topic] = [];
      groups[topic].push(finding);
    }
    
    return groups;
  }

  private extractMainTopic(content: string): string {
    // Simple topic extraction based on most frequent meaningful words
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 4)
      .filter(word => !['this', 'that', 'with', 'from', 'they', 'have', 'been', 'were', 'said', 'each', 'which', 'their', 'time', 'will', 'about', 'there', 'could', 'other', 'after', 'first', 'well', 'also', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us'].includes(word));
    
    const wordCounts: { [key: string]: number } = {};
    words.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    
    const sortedWords = Object.entries(wordCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([word]) => word);
    
    return sortedWords.join(' ');
  }

  private analyzeTopicGroup(findings: any[]): {
    consensus: string | null;
    conflicts: string[];
    keyFindings: string[];
  } {
    const insights = findings.flatMap(f => f.keyInsights || []);
    const sentiments = findings.map(f => f.sentiment?.score || 0);
    
    // Simple consensus detection
    const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
    const consensus = avgSentiment > 0.1 ? 'Generally positive findings' : 
                     avgSentiment < -0.1 ? 'Generally negative findings' : 
                     'Mixed or neutral findings';
    
    return {
      consensus,
      conflicts: [], // Simplified for now
      keyFindings: insights.slice(0, 3),
    };
  }

  private calculateSynthesisConfidence(findings: any[], sources: any[]): number {
    if (findings.length === 0) return 0;
    
    const avgRelevance = findings.reduce((sum, f) => sum + (f.relevanceScore || 0), 0) / findings.length;
    const avgCredibility = sources.reduce((sum, s) => sum + (s.credibilityScore || 0.5), 0) / sources.length;
    const sourceDiversity = new Set(sources.map(s => s.category)).size / Math.max(sources.length, 1);
    
    return (avgRelevance * 0.4 + avgCredibility * 0.4 + sourceDiversity * 0.2);
  }

  private generateCitations(sources: any[], findings: any[]): any[] {
    const citations: any[] = [];
    
    for (const source of sources) {
      if (source.results) {
        for (const result of source.results) {
          citations.push({
            title: result.title,
            url: result.link,
            source: source.source,
            category: source.category,
            credibilityScore: source.credibilityScore,
            relevanceScore: result.relevanceScore,
            accessedDate: new Date().toISOString(),
          });
        }
      }
    }
    
    return citations.sort((a, b) => (b.credibilityScore + b.relevanceScore) - (a.credibilityScore + a.relevanceScore));
  }

  private generateResearchReport(researchResults: any, focusAreas?: string[]): any {
    const report = {
      title: `Research Report: ${researchResults.researchTopic}`,
      executiveSummary: this.generateExecutiveSummary(researchResults),
      methodology: this.generateMethodologySection(researchResults),
      findings: this.generateFindingsSection(researchResults, focusAreas),
      synthesis: this.generateSynthesisSection(researchResults),
      recommendations: this.generateRecommendationsSection(researchResults),
      limitations: this.generateLimitationsSection(researchResults),
      citations: researchResults.citations.slice(0, 20), // Top 20 citations
      metadata: {
        generatedAt: new Date().toISOString(),
        researchType: researchResults.researchType,
        depth: researchResults.depth,
        totalSources: researchResults.statistics.totalSourcesSearched,
        confidenceLevel: researchResults.synthesis.confidenceLevel,
        qualityScore: researchResults.statistics.researchQualityScore,
      },
    };
    
    return report;
  }

  private generateExecutiveSummary(researchResults: any): string {
    const keyFindings = researchResults.synthesis.keyFindings.slice(0, 3);
    const consensusPoints = researchResults.synthesis.consensusPoints.slice(0, 2);
    
    return `This research on "${researchResults.researchTopic}" analyzed ${researchResults.statistics.totalSourcesSearched} sources across ${researchResults.sourceCategories.length} categories. Key findings include: ${keyFindings.join('; ')}. Consensus points: ${consensusPoints.join('; ')}. Overall confidence level: ${(researchResults.synthesis.confidenceLevel * 100).toFixed(1)}%.`;
  }

  private generateMethodologySection(researchResults: any): string {
    return `Research methodology involved systematic search across ${researchResults.sourceCategories.join(', ')} sources using Google Custom Search API. Search parameters included timeframe: ${researchResults.timeframe}, maximum sources per category: ${researchResults.maxSourcesPerType}. Content extraction and analysis included sentiment analysis, relevance scoring, and credibility assessment.`;
  }

  private generateFindingsSection(researchResults: any, focusAreas?: string[]): string {
    const findings = researchResults.findings.slice(0, 5);
    let findingsText = 'Key findings from the research:\n';
    
    findings.forEach((finding: any, index: number) => {
      findingsText += `${index + 1}. ${finding.title} (${finding.source}): ${finding.keyInsights?.[0] || 'No key insights extracted'}\n`;
    });
    
    if (focusAreas && focusAreas.length > 0) {
      findingsText += `\nFocus areas analysis: ${focusAreas.join(', ')}`;
    }
    
    return findingsText;
  }

  private generateSynthesisSection(researchResults: any): string {
    const synthesis = researchResults.synthesis;
    return `Synthesis of findings reveals ${synthesis.consensusPoints.length} consensus points and ${synthesis.conflictingInformation.length} areas of conflicting information. Key findings: ${synthesis.keyFindings.slice(0, 3).join('; ')}.`;
  }

  private generateRecommendationsSection(researchResults: any): string {
    const confidence = researchResults.synthesis.confidenceLevel;
    if (confidence > 0.8) {
      return 'High confidence in findings. Recommendations can be made with strong evidence base.';
    } else if (confidence > 0.6) {
      return 'Moderate confidence in findings. Recommendations should be made cautiously with additional verification.';
    } else {
      return 'Low confidence in findings. Additional research recommended before making conclusions.';
    }
  }

  private generateLimitationsSection(researchResults: any): string {
    return `Research limitations include: limited to publicly available sources, potential bias in source selection, time constraints (${researchResults.timeframe}), and reliance on automated content extraction. Quality score: ${(researchResults.statistics.researchQualityScore * 100).toFixed(1)}%.`;
  }

  private calculateResearchQualityScore(researchResults: any): number {
    const sourceDiversity = researchResults.sourceCategories.length / 5; // Normalize to 5 categories
    const avgCredibility = researchResults.statistics.averageCredibilityScore;
    const synthesisConfidence = researchResults.synthesis.confidenceLevel;
    const findingsCount = researchResults.findings.length;
    const findingsQuality = Math.min(findingsCount / 10, 1); // Normalize to 10 findings
    
    return (sourceDiversity * 0.25 + avgCredibility * 0.25 + synthesisConfidence * 0.25 + findingsQuality * 0.25);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Google Search MCP server running on stdio');
  }
}

export default GoogleSearchMCPServer;
