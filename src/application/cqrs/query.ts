export interface Query<TResult = unknown> {
  readonly queryName?: string;
  readonly tenantId?: string;
  readonly correlationId?: string;
  readonly userId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly __resultType?: TResult;
}
