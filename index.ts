import { createApp, logger, redisClient } from './app';
import config from './config';

async function main() {
  const app = await createApp();
  const server = app.listen(config.PORT, () => logger.info(`Server listening on http://localhost:${config.PORT}`));

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  function shutdown() {
    logger.info('Shutting down...');
    server.close(() => {
      logger.info('HTTP server closed');
      redisClient.disconnect()
        .then(() => { logger.info('Redis disconnected'); process.exit(0); })
        .catch(err => { logger.error('Redis disconnect error', err); process.exit(1); });
    });
    setTimeout(() => { logger.error('Forced shutdown'); process.exit(1); }, 10000);
  }
}

main().catch(err => { logger.error('Startup error', err); process.exit(1); });
