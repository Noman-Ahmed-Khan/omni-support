import { PrismaClient } from '@prisma/client';
import { TransactionManager } from './transaction-manager';
import { DatabaseClient } from './transaction-context';

export class UnitOfWork {
  constructor(private readonly transactionManager: TransactionManager) {}

  async execute<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
    return this.transactionManager.run(work);
  }
}

export function createUnitOfWork(prisma: PrismaClient): UnitOfWork {
  return new UnitOfWork(new TransactionManager(prisma));
}
