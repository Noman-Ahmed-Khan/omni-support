// Mock logger (shared concern)
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

process.env.NODE_ENV = 'test';
process.env.SKIP_TWILIO = 'true';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_minimum_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_minimum_32_characters_long';

// No Redis connection, no queue cleanup, no infrastructure
