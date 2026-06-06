export interface QueryHandler<TQuery = unknown, TResult = unknown> {
  execute(query: TQuery): Promise<TResult>;
}
