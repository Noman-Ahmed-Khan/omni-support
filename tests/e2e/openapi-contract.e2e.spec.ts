import fs from 'fs';
import path from 'path';

import { load } from 'js-yaml';

import { listRoutes } from '../helpers/route-inventory';
import { getTestApp } from '../helpers/test-app';

/** Routes that are intentionally not part of the public API description. */
const UNDOCUMENTED = new Set([
  'GET /api/v1/attachments/files/*', // signed download links, not called by clients directly
]);

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function documentedOperations(): string[] {
  const spec = load(
    fs.readFileSync(path.join(process.cwd(), 'docs/api/openapi.yaml'), 'utf8'),
  ) as {
    paths: Record<string, Record<string, unknown>>;
    servers?: Array<{ url: string }>;
  };

  const operations: string[] = [];
  for (const [route, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      if (item[method]) {
        operations.push(`${method.toUpperCase()} ${route.replace(/\{(\w+)\}/g, ':$1')}`);
      }
    }
  }
  return operations;
}

describe('OpenAPI contract', () => {
  it('documents every route and no route that does not exist', async () => {
    const { app } = await getTestApp();

    const routes = listRoutes(app)
      .filter((route) => !route.includes('/docs'))
      .filter((route) => !UNDOCUMENTED.has(route));
    const normalize = (op: string) =>
      op.replace(/:\w+/g, ':param').replace(/(.)\/$/, '$1');

    const documented = new Set(documentedOperations().map(normalize));
    const implemented = new Set(routes.map(normalize));

    const undocumented = [...implemented].filter((op) => !documented.has(op));
    const missing = [...documented].filter((op) => !implemented.has(op));

    expect({ undocumented, missing }).toEqual({ undocumented: [], missing: [] });
  });
});
