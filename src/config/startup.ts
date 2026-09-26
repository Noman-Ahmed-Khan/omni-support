import { ZodError } from 'zod';

import { getAIConfig } from './ai.config';
import { getAppConfig } from './app.config';
import { getDatabaseConfig } from './database.config';
import { getJwtConfig } from './jwt.config';
import { getMessagingConfig } from './messaging.config';
import { getOAuthConfig } from './oauth.config';
import { getRedisConfig } from './redis.config';
import { getStorageConfig } from './storage.config';

/**
 * Validates configuration required by every process before any connection is opened,
 * so a misconfigured deployment fails immediately with a readable message.
 */
export function validateStartupConfig(): void {
  const checks: Array<[string, () => unknown]> = [
    ['application', getAppConfig],
    ['database', getDatabaseConfig],
    ['jwt', getJwtConfig],
    ['redis', getRedisConfig],
    ['storage', () => getStorageConfig()],
    ['messaging', getMessagingConfig],
    ['ai', getAIConfig],
    ['oauth', getOAuthConfig],
    [
      'application.encryptionKey',
      () => {
        if (!getAppConfig().encryptionKey) throw new Error('ENCRYPTION_KEY is required');
      },
    ],
  ];

  const problems: string[] = [];

  for (const [name, load] of checks) {
    try {
      load();
    } catch (error) {
      if (error instanceof ZodError) {
        for (const issue of error.issues) {
          problems.push(`${name}.${issue.path.join('.') || '(root)'}: ${issue.message}`);
        }
      } else {
        problems.push(
          `${name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  }
}
