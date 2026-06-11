import 'dotenv/config';
import { createRedisClient, disconnectRedis } from '../../src/infrastructure/cache/redis.client';
import { closeAllQueues } from '../../src/infrastructure/queue/queue.factory';
import { resetTestApp } from './test-app';

// Silence logger during tests
jest.mock('../../src/shared/utils/logger.util', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  createRequestLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Set test environment
process.env.NODE_ENV = 'test';
process.env.SKIP_TWILIO = 'true';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_minimum_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_minimum_32_characters_long';

beforeAll(async () => {
  await createRedisClient();
});

afterAll(async () => {
  await closeAllQueues();
  await resetTestApp();
  await disconnectRedis();
});