import fs from 'fs';
import path from 'path';

import { Router } from 'express';
import { load } from 'js-yaml';
import swaggerUi from 'swagger-ui-express';

import { logger } from '../../shared/utils/logger.util';

const specPath = path.resolve(__dirname, '../../../docs/api/openapi.yaml');

/**
 * Loads OpenAPI specification and validates/merges duplicate path items.
 * This ensures that operations on the same path are merged into a single path object,
 * preventing "duplicated mapping key" YAML errors.
 */
function loadAndValidateOpenAPISpec(): Record<string, unknown> {
  const rawContent = fs.readFileSync(specPath, 'utf8');
  let spec = load(rawContent) as Record<string, unknown>;

  // Validate and merge duplicate paths if they exist
  const paths = spec.paths as Record<string, Record<string, unknown>>;
  if (paths) {
    spec = validateAndMergePaths(spec, paths);
  }

  return spec;
}

/**
 * Detects duplicate path definitions and merges their operations.
 * Returns a corrected OpenAPI spec with all operations properly consolidated
 * under a single path object per unique path.
 */
function validateAndMergePaths(
  spec: Record<string, unknown>,
  paths: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const mergedPaths: Record<string, Record<string, unknown>> = {};
  const pathCounts: Record<string, number> = {};
  let hasDuplicates = false;

  // First pass: count occurrences and detect duplicates
  for (const pathKey of Object.keys(paths)) {
    pathCounts[pathKey] = (pathCounts[pathKey] ?? 0) + 1;
    if (pathCounts[pathKey] > 1) {
      hasDuplicates = true;
      logger.warn(`Detected duplicate path in OpenAPI spec: ${pathKey}`);
    }
  }

  if (!hasDuplicates) {
    return spec;
  }

  // Second pass: merge operations from duplicate paths
  for (const pathKey of Object.keys(paths)) {
    if (!mergedPaths[pathKey]) {
      mergedPaths[pathKey] = {};
    }

    const pathItem = paths[pathKey];
    const mergedItem = mergedPaths[pathKey];

    // HTTP methods that can appear in a path item
    const httpMethods = [
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'options',
      'head',
      'trace',
    ];

    for (const method of httpMethods) {
      if (method in pathItem) {
        if (method in mergedItem) {
          logger.error(
            `Conflict: multiple ${method.toUpperCase()} operations on path ${pathKey}`,
          );
        }
        mergedItem[method] = pathItem[method];
      }
    }

    // Copy non-method properties (parameters, servers, etc.)
    for (const [key, value] of Object.entries(pathItem)) {
      if (!httpMethods.includes(key) && !(key in mergedItem)) {
        mergedItem[key] = value;
      }
    }
  }

  logger.info('OpenAPI paths validated and merged successfully');
  return { ...spec, paths: mergedPaths };
}

const openApiDocument = loadAndValidateOpenAPISpec();

export function createSwaggerRouter(): Router {
  const router = Router();

  router.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { explorer: true }),
  );
  router.get('/docs.json', (_req, res) => res.json(openApiDocument));

  return router;
}
