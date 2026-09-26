/**
 * Keeps .env.example in sync with the environment variables the application reads.
 * Fails when a variable read in src/ is not documented, or when .env.example lists a
 * variable nothing reads.
 *
 * Usage: tsx scripts/check-env-example.ts
 */
import fs from 'fs';
import path from 'path';

/** Read by tooling rather than by src/ (Prisma CLI, seeds, package scripts). */
const DOCUMENTED_FOR_TOOLING = new Set([
  'PLATFORM_ADMIN_EMAIL',
  'PLATFORM_ADMIN_PASSWORD',
]);
/** Set by the runtime, never configured by hand. */
const RUNTIME_PROVIDED = new Set(['npm_package_version']);

const root = process.cwd();

const readVariables = new Set<string>();
const walk = (dir: string): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (full.endsWith('.ts')) {
      for (const match of fs
        .readFileSync(full, 'utf8')
        .matchAll(/\b(?:process\.)?env\.([A-Z0-9_]+)/g)) {
        readVariables.add(match[1]);
      }
    }
  }
};
walk(path.join(root, 'src'));
for (const name of RUNTIME_PROVIDED) readVariables.delete(name);

const documented = new Set<string>();
for (const line of fs
  .readFileSync(path.join(root, '.env.example'), 'utf8')
  .split(/\r?\n/)) {
  const match = /^\s*#?\s*([A-Z][A-Z0-9_]*)=/.exec(line);
  if (match) documented.add(match[1]);
}

const missing = [...readVariables].filter((name) => !documented.has(name)).sort();
const unused = [...documented]
  .filter((name) => !readVariables.has(name) && !DOCUMENTED_FOR_TOOLING.has(name))
  .sort();

if (missing.length > 0) {
  console.error(
    `Read by the application but missing from .env.example: ${missing.join(', ')}`,
  );
}
if (unused.length > 0) {
  console.error(`Listed in .env.example but not read anywhere: ${unused.join(', ')}`);
}
if (missing.length > 0 || unused.length > 0) {
  process.exit(1);
}

console.log(`.env.example documents all ${readVariables.size} environment variables.`);
