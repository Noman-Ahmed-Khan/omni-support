import dotenv from 'dotenv';

/**
 * Loads `.env.test` before anything reads configuration. Variables already set in the
 * environment (e.g. by CI) take precedence. Without this, Prisma CLI commands run by the
 * global setup would fall back to `.env` and touch the development database.
 */
dotenv.config({ path: '.env.test' });
