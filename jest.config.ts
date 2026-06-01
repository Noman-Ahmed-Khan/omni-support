import type { Config } from 'jest';

const moduleNameMapper = {
  '^@domain/(.*)$': '<rootDir>/src/domain/$1',
  '^@application/(.*)$': '<rootDir>/src/application/$1',
  '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
  '^@presentation/(.*)$': '<rootDir>/src/presentation/$1',
  '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  '^@config/(.*)$': '<rootDir>/src/config/$1',
};

const transform = {
  '^.+\\.tsx?$': [
    'ts-jest',
    {
      tsconfig: 'tsconfig.json',
      diagnostics: false,
    },
  ],
} satisfies Config['transform'];

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/*.spec.ts',
    '**/*.test.ts',
  ],
  transform,
  moduleNameMapper,
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/jest.setup.ts'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/container/**',
    '!prisma/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  clearMocks: true,
  restoreMocks: true,
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testMatch: ['<rootDir>/tests/unit/**/*.spec.ts'],
      testEnvironment: 'node',
      transform,
      moduleNameMapper,
      setupFilesAfterEnv: ['<rootDir>/tests/helpers/jest.setup.ts'],
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testMatch: ['<rootDir>/tests/integration/**/*.spec.ts'],
      testEnvironment: 'node',
      transform,
      moduleNameMapper,
      setupFilesAfterEnv: ['<rootDir>/tests/helpers/jest.setup.ts'],
      globalSetup: '<rootDir>/tests/helpers/integration.setup.ts',
      globalTeardown: '<rootDir>/tests/helpers/integration.teardown.ts',
    },
    {
      displayName: 'e2e',
      preset: 'ts-jest',
      testMatch: ['<rootDir>/tests/e2e/**/*.spec.ts'],
      testEnvironment: 'node',
      transform,
      moduleNameMapper,
      setupFilesAfterEnv: ['<rootDir>/tests/helpers/jest.setup.ts'],
      globalSetup: '<rootDir>/tests/helpers/e2e.setup.ts',
      globalTeardown: '<rootDir>/tests/helpers/e2e.teardown.ts',
    },
  ],
};

export default config;
