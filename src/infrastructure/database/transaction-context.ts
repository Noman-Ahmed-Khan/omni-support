import { AsyncLocalStorage } from 'async_hooks';
import { Prisma, PrismaClient } from '@prisma/client';

export type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const storage = new AsyncLocalStorage<DatabaseClient>();

export class TransactionContext {
  run<T>(client: DatabaseClient, work: () => Promise<T>): Promise<T> {
    return storage.run(client, work);
  }

  getClient(): DatabaseClient | undefined {
    return storage.getStore();
  }

  hasTransaction(): boolean {
    return storage.getStore() !== undefined;
  }
}

export const transactionContext = new TransactionContext();

export function resolveDatabaseClient(defaultClient: PrismaClient): DatabaseClient {
  return transactionContext.getClient() ?? defaultClient;
}
