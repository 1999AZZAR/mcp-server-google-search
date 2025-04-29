import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  GOOGLE_API_KEY: z.string().nonempty(),
  GOOGLE_CSE_ID: z.string().nonempty(),
  PORT: z.coerce.number().default(3000),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  CACHE_TTL: z.coerce.number().default(3600),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(30),
  CB_TIMEOUT_MS: z.coerce.number().default(5000),
  CB_ERROR_THRESHOLD: z.coerce.number().default(50),
  CB_RESET_TIMEOUT_MS: z.coerce.number().default(30000),
  LRU_CACHE_SIZE: z.coerce.number().default(500),
  LOG_LEVEL: z.string().default('info'),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  console.error('❌ Configuration validation error:', result.error.format());
  process.exit(1);
}

const config = {
  GOOGLE_API_KEY: result.data.GOOGLE_API_KEY,
  GOOGLE_CSE_ID: result.data.GOOGLE_CSE_ID,
  PORT: result.data.PORT,
  REDIS_URL: result.data.REDIS_URL,
  CACHE_TTL: result.data.CACHE_TTL,
  RATE_LIMIT_WINDOW_MS: result.data.RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX: result.data.RATE_LIMIT_MAX,
  CB_TIMEOUT_MS: result.data.CB_TIMEOUT_MS,
  CB_ERROR_THRESHOLD: result.data.CB_ERROR_THRESHOLD,
  CB_RESET_TIMEOUT_MS: result.data.CB_RESET_TIMEOUT_MS,
  LRU_CACHE_SIZE: result.data.LRU_CACHE_SIZE,
  LOG_LEVEL: result.data.LOG_LEVEL,
};

export default config;
