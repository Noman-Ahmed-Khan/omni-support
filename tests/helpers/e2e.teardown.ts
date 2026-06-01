import { cleanupTestDatabase, disconnectTestDatabase } from './test-db';

export default async function globalTeardown(): Promise<void> {
  await cleanupTestDatabase();
  await disconnectTestDatabase();
}