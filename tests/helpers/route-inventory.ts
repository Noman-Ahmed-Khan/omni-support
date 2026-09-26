import type { Application } from 'express';

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  name: string;
  regexp: RegExp;
  handle: { stack?: Layer[] };
}

const MOUNT_SUFFIX = '\\/?(?=\\/|$)';

/**
 * Turns an Express 4 mount regexp such as /^\/api\/v1\/?(?=\/|$)/i back into "/api/v1".
 * Routers in this app are only mounted on static paths.
 */
function mountPath(layer: Layer): string {
  const source = layer.regexp.source;
  if (!source.endsWith(MOUNT_SUFFIX)) return '';
  return source.slice(1, -MOUNT_SUFFIX.length).split('\\/').join('/');
}

/** Lists "METHOD /path" for every route registered on the app. */
export function listRoutes(app: Application): string[] {
  const routes: string[] = [];

  const walk = (stack: Layer[], prefix: string): void => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          routes.push(`${method.toUpperCase()} ${prefix}${layer.route.path}`);
        }
      } else if (layer.name === 'router' && layer.handle.stack) {
        walk(layer.handle.stack, prefix + mountPath(layer));
      }
    }
  };

  walk((app as unknown as { _router: { stack: Layer[] } })._router.stack, '');
  return [...new Set(routes)].sort();
}
