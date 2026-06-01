import { setupTestDatabase } from './test-db';

export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  await setupTestDatabase();
}