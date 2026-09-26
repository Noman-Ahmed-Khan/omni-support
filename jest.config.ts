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

// Test selection, transforms and setup files are defined per project below; with
// `projects` set, Jest ignores those options at the top level.
const config: Config = {
  rootDir: '.',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/worker.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    // Measured baseline (2026-09) minus a small margin; raise as coverage grows.
    global: {
      branches: 35,
      functions: 51,
      lines: 58,
      statements: 57,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  clearMocks: true,
  restoreMocks: true,
  verbose: true,
  detectOpenHandles: true,
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testMatch: ['<rootDir>/tests/unit/**/*.spec.ts'],
      testEnvironment: 'node',
      transform,
      moduleNameMapper,
      setupFilesAfterEnv: ['<rootDir>/tests/helpers/jest.unit.setup.ts'],
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testMatch: ['<rootDir>/tests/integration/**/*.spec.ts'],
      testEnvironment: 'node',
      transform,
      moduleNameMapper,
      setupFilesAfterEnv: ['<rootDir>/tests/helpers/jest.integration.setup.ts'],
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
      setupFilesAfterEnv: ['<rootDir>/tests/helpers/jest.e2e.setup.ts'],
      globalSetup: '<rootDir>/tests/helpers/e2e.setup.ts',
      globalTeardown: '<rootDir>/tests/helpers/e2e.teardown.ts',
    },
  ],
};

export default config;
