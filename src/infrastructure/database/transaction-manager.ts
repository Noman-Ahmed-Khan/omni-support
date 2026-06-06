import { Prisma, PrismaClient } from '@prisma/client';
import { transactionContext, DatabaseClient } from './transaction-context';

export class TransactionManager {
  constructor(private readonly prisma: PrismaClient) {}

  async run<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
    const currentClient = transactionContext.getClient();

    if (currentClient) {
      return work(currentClient);
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) =>
      transactionContext.run(tx, () => work(tx)),
    );
  }
}
