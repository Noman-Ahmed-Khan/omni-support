# OmniSupport Testing Strategy

This document outlines the testing conventions and boundaries for the OmniSupport project. We adhere to a strict separation of concerns to ensure tests are fast, reliable, and isolated.

## Test Tiers

We divide tests into three distinct tiers:

1.  **Unit Tests (`tests/unit/**/*.spec.ts`)**
    *   **Goal:** Test business logic in isolation.
    *   **Scope:** Domain entities, value objects, application services, pure validation logic.
    *   **Infrastructure:** strictly **NONE**. No database connections, no Redis, no SMTP, no external API calls.
    *   **Environment:** Runs with `jest.unit.setup.ts`. Mock all dependencies via `jest-mock-extended`.
    *   **Speed:** Should run in milliseconds.

2.  **Integration Tests (`tests/integration/**/*.spec.ts`)**
    *   **Goal:** Test interaction with infrastructure components.
    *   **Scope:** Repository implementations, Redis caching, Email provider adapters, Queue integrations.
    *   **Infrastructure:** Requires running instances of PostgreSQL and Redis (via `docker-compose.test.yml`).
    *   **Environment:** Runs with `jest.integration.setup.ts`. Uses real database and cache, but mocks external APIs (e.g., Twilio, OpenAI).

3.  **End-to-End (E2E) Tests (`tests/e2e/**/*.spec.ts`)**
    *   **Goal:** Test the full system flow from HTTP request to database and back.
    *   **Scope:** API endpoints, authentication flows, complete ticket workflows.
    *   **Infrastructure:** Requires full application bootstrap, database, and Redis.
    *   **Environment:** Runs with `jest.e2e.setup.ts`. Uses `getTestApp()` to instantiate the express server and DI container.

## Environment Variables

### Unit Tests
Unit tests should not require real credentials or infrastructure URLs. Temporary dummy variables are provided in CI (`unit-tests.yml`) as a safety net, but the codebase uses lazy configuration initialization (`getXConfig()`) to prevent environment validation from crashing unit tests.

### Integration & E2E
Integration and E2E tests load `.env.test`. You must ensure your local `.env.test` has valid dummy values for the required infrastructure.

## Running Tests Locally

```bash
# Run all unit tests
npm run test:unit

# Run integration tests (requires docker-compose up -d)
npm run test:integration

# Run e2e tests (requires docker-compose up -d)
npm run test:e2e

# Run all tests
npm test
```

## Rules for New Tests

1.  **Never** import infrastructure modules directly into a unit test.
2.  **Never** use `getTestApp()` or `buildContainer()` in a unit test.
3.  If you need to test a service, mock its repository and other dependencies.
4.  Configuration variables should be accessed via `getXConfig()` (e.g., `getMessagingConfig()`) instead of eager module-level constants to ensure lazy evaluation.
