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
    const timestampText = typeof timestamp === 'string' ? timestamp : '';
    const messageText =
      typeof message === 'string' ? message : JSON.stringify(message);
    const metaStr = Object.keys(meta).length
      ? ` ${JSON.stringify(meta)}`
      : '';
    return `${timestampText} [${level}]: ${messageText}${metaStr}`;
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
export function createRequestLogger(correlationId: string, tenantId?: string): winston.Logger {
  return logger.child({ correlationId, tenantId });
}
