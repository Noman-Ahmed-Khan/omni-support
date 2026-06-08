import type { PrismaClient } from '@prisma/client';

import type { DatabaseClient } from './transaction-context';
import { TransactionManager } from './transaction-manager';

export class UnitOfWork {
  constructor(private readonly transactionManager: TransactionManager) {}

  async execute<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
    return this.transactionManager.run(work);
  }
}

export function createUnitOfWork(prisma: PrismaClient): UnitOfWork {
  return new UnitOfWork(new TransactionManager(prisma));
}
