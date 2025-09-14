import GoogleSearchMCPServer from './mcp-server.js';

async function main() {
  try {
    const server = new GoogleSearchMCPServer();
    await server.run();
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

main();
