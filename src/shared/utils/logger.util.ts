import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? ` ${JSON.stringify(meta)}`
      : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  }),
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: logFormat,
  defaultMeta: { service: 'omnisupport' },
  transports: [
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
    }),
  ],
});

// Add correlation ID to logger
export function createRequestLogger(correlationId: string, tenantId?: string) {
  return logger.child({ correlationId, tenantId });
}