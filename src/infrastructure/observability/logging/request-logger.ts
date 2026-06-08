import { logger, createRequestLogger } from '../../../shared/utils/logger.util';
import type { TracingService } from '../tracing/tracing.service';

export function createObservabilityLogger(tracingService: TracingService): {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
} {
  return {
    info(message: string, meta: Record<string, unknown> = {}): void {
      const context = tracingService.getContext();
      createRequestLogger(
        context?.correlationId ?? meta.correlationId?.toString() ?? '',
        context?.tenantId,
      ).info(message, {
        ...meta,
        traceId: context?.traceId,
        userId: context?.userId,
      });
    },
    warn(message: string, meta: Record<string, unknown> = {}): void {
      const context = tracingService.getContext();
      createRequestLogger(
        context?.correlationId ?? meta.correlationId?.toString() ?? '',
        context?.tenantId,
      ).warn(message, {
        ...meta,
        traceId: context?.traceId,
        userId: context?.userId,
      });
    },
    error(message: string, meta: Record<string, unknown> = {}): void {
      const context = tracingService.getContext();
      createRequestLogger(
        context?.correlationId ?? meta.correlationId?.toString() ?? '',
        context?.tenantId,
      ).error(message, {
        ...meta,
        traceId: context?.traceId,
        userId: context?.userId,
      });
    },
    debug(message: string, meta: Record<string, unknown> = {}): void {
      const context = tracingService.getContext();
      createRequestLogger(
        context?.correlationId ?? meta.correlationId?.toString() ?? '',
        context?.tenantId,
      ).debug(message, {
        ...meta,
        traceId: context?.traceId,
        userId: context?.userId,
      });
    },
  };
}

export { logger };
