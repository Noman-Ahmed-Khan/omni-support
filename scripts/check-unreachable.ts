/**
 * Fails when a file under src/ cannot be reached through imports from a process entry
 * point (src/main.ts, src/worker.ts). Keeps dead code from accumulating.
 *
 * Usage: tsx scripts/check-unreachable.ts
 */
import fs from 'fs';
import path from 'path';

import ts from 'typescript';

const ENTRY_POINTS = ['src/main.ts', 'src/worker.ts'];

/** Files kept on purpose although nothing imports them yet. */
const ALLOWED_UNREACHABLE = new Set<string>([
  // AES-256-GCM helper reserved for encrypting TenantIntegration credentials.
  'src/infrastructure/security/encryption.service.ts',
]);

const root = process.cwd();
const srcDir = path.join(root, 'src');
const configFile = ts.readConfigFile(path.join(root, 'tsconfig.json'), (file) =>
  ts.sys.readFile(file),
);
const { options } = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);

const reachable = new Set<string>();
const pending = ENTRY_POINTS.map((entry) => path.resolve(root, entry));

while (pending.length > 0) {
  const file = pending.pop()!;
  if (reachable.has(file)) continue;
  reachable.add(file);

  const { importedFiles } = ts.preProcessFile(fs.readFileSync(file, 'utf8'), true, true);
  for (const imported of importedFiles) {
    const resolved = ts.resolveModuleName(
      imported.fileName,
      file,
      options,
      ts.sys,
    ).resolvedModule;
    if (!resolved || resolved.isExternalLibraryImport) continue;

    const target = path.resolve(resolved.resolvedFileName);
    if (target.startsWith(srcDir + path.sep) && !target.endsWith('.d.ts')) {
      pending.push(target);
    }
  }
}

const allFiles: string[] = [];
const walk = (dir: string): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) allFiles.push(full);
  }
};
walk(srcDir);

const unreachable = allFiles
  .filter((file) => !reachable.has(path.resolve(file)))
  .map((file) => path.relative(root, file).split(path.sep).join('/'))
  .filter((file) => !ALLOWED_UNREACHABLE.has(file));

if (unreachable.length > 0) {
  console.error('Files not reachable from any entry point:');
  for (const file of unreachable) console.error(`  - ${file}`);
  process.exit(1);
}

console.log(`All ${allFiles.length} source files are reachable.`);
