/**
 * @deprecated Use jest.unit.setup.ts, jest.integration.setup.ts, or jest.e2e.setup.ts instead.
 */
console.warn('Using deprecated jest.setup.ts. Please update jest.config.ts to use tier-specific setup files.');
import './jest.e2e.setup';