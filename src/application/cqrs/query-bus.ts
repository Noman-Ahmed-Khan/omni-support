import type { QueryHandler } from './query-handler.interface';

interface RegisteredQueryHandler<TQuery = unknown, TResult = unknown> {
  handler: QueryHandler<TQuery, TResult>;
}

export class QueryBus {
  private readonly handlers = new Map<string, RegisteredQueryHandler<unknown, unknown>>();

  register<TQuery, TResult>(
    queryName: string,
    handler: QueryHandler<TQuery, TResult>,
  ): void {
    this.handlers.set(queryName, { handler });
  }

  registerMany(
    registrations: Array<{
      queryName: string;
      handler: QueryHandler<unknown, unknown>;
    }>,
  ): void {
    for (const registration of registrations) {
      this.register(registration.queryName, registration.handler);
    }
  }

  async execute<TQuery, TResult>(queryName: string, query: TQuery): Promise<TResult> {
    const registration = this.handlers.get(queryName) as
      | RegisteredQueryHandler<TQuery, TResult>
      | undefined;

    if (!registration) {
      throw new Error(`Query handler '${queryName}' is not registered`);
    }

    return registration.handler.execute(query);
  }

  has(queryName: string): boolean {
    return this.handlers.has(queryName);
  }

  listRegisteredQueries(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
