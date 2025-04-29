"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = __importDefault(require("./config"));
async function main() {
    const app = await (0, app_1.createApp)();
    const server = app.listen(config_1.default.PORT, () => app_1.logger.info(`Server listening on http://localhost:${config_1.default.PORT}`));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    function shutdown() {
        app_1.logger.info('Shutting down...');
        server.close(() => {
            app_1.logger.info('HTTP server closed');
            app_1.redisClient.disconnect()
                .then(() => { app_1.logger.info('Redis disconnected'); process.exit(0); })
                .catch(err => { app_1.logger.error('Redis disconnect error', err); process.exit(1); });
        });
        setTimeout(() => { app_1.logger.error('Forced shutdown'); process.exit(1); }, 10000);
    }
}
main().catch(err => { app_1.logger.error('Startup error', err); process.exit(1); });
