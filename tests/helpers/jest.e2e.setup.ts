import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

// Mock logger
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

import { createRedisClient, disconnectRedis } from '../../src/infrastructure/cache/redis.client';
import { closeAllQueues } from '../../src/infrastructure/queue/queue.factory';
import { resetTestApp } from './test-app';

process.env.NODE_ENV = 'test';
process.env.SKIP_TWILIO = 'true';

beforeAll(async () => {
  await createRedisClient();
});

afterAll(async () => {
  await closeAllQueues();
  await resetTestApp();
  await disconnectRedis();
});
