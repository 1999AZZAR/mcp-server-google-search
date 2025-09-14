import GoogleSearchMCPServer from '../mcp-server';
import axios from 'axios';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('GoogleSearchMCPServer', () => {
  let server: GoogleSearchMCPServer;

  beforeEach(() => {
    server = new GoogleSearchMCPServer();
    jest.clearAllMocks();
  });

  describe('Google Search Tool', () => {
    it('should handle valid search request', async () => {
      const mockResponse = {
        data: {
          searchInformation: {
            totalResults: '1000',
            searchTime: '0.1',
            formattedSearchTime: '0.1 seconds',
          },
          items: [
            {
              title: 'Test Result',
              link: 'https://example.com',
              snippet: 'This is a test result',
              displayLink: 'example.com',
              formattedUrl: 'https://example.com',
            },
          ],
        },
      };

      mockAxios.get.mockResolvedValue(mockResponse);

      // Mock the server's handleGoogleSearch method
      const result = await (server as any).handleGoogleSearch({
        q: 'test query',
        num: 5,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.searchInfo.totalResults).toBe('1000');
      expect(parsedContent.items).toHaveLength(1);
      expect(parsedContent.items[0].title).toBe('Test Result');
    });

    it('should handle search with filters', async () => {
      const mockResponse = {
        data: {
          searchInformation: {
            totalResults: '100',
            searchTime: '0.05',
            formattedSearchTime: '0.05 seconds',
          },
          items: [],
        },
      };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await (server as any).handleGoogleSearch({
        q: 'test query',
        fileType: 'pdf',
        siteSearch: 'example.com',
        safe: 'active',
      });

      expect(result.content).toHaveLength(1);
      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://www.googleapis.com/customsearch/v1',
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'test query',
            fileType: 'pdf',
            siteSearch: 'example.com',
            safe: 'active',
          }),
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      const error = new Error('API Error');
      (error as any).response = {
        data: {
          error: {
            message: 'Invalid API key',
          },
        },
      };
      mockAxios.get.mockRejectedValue(error);

      await expect(
        (server as any).handleGoogleSearch({ q: 'test' })
      ).rejects.toThrow('Google Search API error: Invalid API key');
    });
  });

  describe('Extract Content Tool', () => {
    it('should extract content from URL', async () => {
      const mockHtml = `
        <html>
          <head><title>Test Page</title></head>
          <body>
            <main>This is the main content of the page.</main>
          </body>
        </html>
      `;

      mockAxios.get.mockResolvedValue({ data: mockHtml });

      const result = await (server as any).handleExtractContent({
        url: 'https://example.com',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.url).toBe('https://example.com');
      expect(parsedContent.title).toBe('Test Page');
      expect(parsedContent.content).toContain('main content');
      expect(parsedContent).toHaveProperty('sentiment');
      expect(parsedContent).toHaveProperty('wordCount');
    });

    it('should handle extraction errors', async () => {
      const error = new Error('Network error');
      (error as any).response = { status: 404 };
      mockAxios.get.mockRejectedValue(error);

      await expect(
        (server as any).handleExtractContent({ url: 'https://example.com' })
      ).rejects.toThrow('Content extraction failed: Page not found');
    });
  });

  describe('Input Validation', () => {
    it('should validate search query parameters', async () => {
      await expect(
        (server as any).handleGoogleSearch({})
      ).rejects.toThrow();
    });

    it('should validate extract URL parameter', async () => {
      await expect(
        (server as any).handleExtractContent({ url: 'invalid-url' })
      ).rejects.toThrow();
    });
  });
});
