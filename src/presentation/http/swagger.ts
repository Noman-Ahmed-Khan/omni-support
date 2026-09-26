import fs from 'fs';
import path from 'path';

import { Router } from 'express';
import { load } from 'js-yaml';
import swaggerUi from 'swagger-ui-express';

import { logger } from '../../shared/utils/logger.util';

const specPath = path.resolve(__dirname, '../../../docs/api/openapi.yaml');

/** Loads the OpenAPI document. Its paths are checked against the router by tests/e2e/openapi-contract. */
function loadAndValidateOpenAPISpec(): Record<string, unknown> {
  return load(fs.readFileSync(specPath, 'utf8')) as Record<string, unknown>;
}

/**
 * Serves the API docs when enabled. A missing or invalid spec file never prevents the
 * application from starting; the docs routes are simply not mounted.
 */
export function createSwaggerRouter(enabled: boolean = true): Router {
  const router = Router();

  if (!enabled) {
    return router;
  }

  let openApiDocument: Record<string, unknown>;
  try {
    openApiDocument = loadAndValidateOpenAPISpec();
  } catch (error) {
    logger.warn('OpenAPI spec could not be loaded; API docs are disabled', {
      specPath,
      error: error instanceof Error ? error.message : error,
    });
    return router;
  }

  router.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { explorer: true }),
  );
  router.get('/docs.json', (_req, res) => res.json(openApiDocument));

  return router;
}
