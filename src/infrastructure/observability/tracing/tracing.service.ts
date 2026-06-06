import { AsyncLocalStorage } from 'async_hooks';

export interface TraceContext {
  traceId: string;
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  path?: string;
  method?: string;
}

export class TracingService {
  private readonly storage = new AsyncLocalStorage<TraceContext>();

  run<T>(context: TraceContext, work: () => Promise<T>): Promise<T> {
    return this.storage.run(context, work);
  }

  getContext(): TraceContext | undefined {
    return this.storage.getStore();
  }

  getTraceId(): string | undefined {
    return this.storage.getStore()?.traceId;
  }
}
