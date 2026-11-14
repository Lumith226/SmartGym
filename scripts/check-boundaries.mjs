import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function forbiddenImport(file, specifier, root = process.cwd()) {
  const location = relative(root, file).replaceAll('\\', '/');
  const service = location.match(/^backend\/services\/([^/]+)\//);
  const owner = location.startsWith('frontend/')
    ? { directory: 'frontend', packageName: '@smartgym/web' }
    : service && { directory: 'backend/services/' + service[1], packageName: '@smartgym/' + service[1] };
  if (!owner) return false;
  if (specifier.startsWith('@smartgym/')) {
    return specifier !== owner.packageName && !specifier.startsWith(owner.packageName + '/');
  }
  if (!specifier.startsWith('.')) return false;
  const target = relative(root, resolve(dirname(file), specifier)).replaceAll('\\', '/');
  return !target.startsWith(owner.directory + '/');
}

export async function checkBoundaries(root = process.cwd()) {
  const violations = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (['node_modules', '.next', 'dist', '.local'].includes(entry.name)) continue;
      const file = resolve(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (/\.(ts|tsx|js|mjs|cjs)$/.test(file)) {
        const content = await readFile(file, 'utf8');
        for (const match of content.matchAll(/(?:from\s*|import\s*\(|require\s*\()['"]([^'"]+)['"]/g)) {
          if (forbiddenImport(file, match[1], root)) violations.push(relative(root, file) + ' → ' + match[1]);
        }
      }
    }
  }
  for (const dir of ['frontend', 'backend/services']) await visit(resolve(root, dir));
  return violations;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = await checkBoundaries();
  if (violations.length) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
  } else console.log('Service import boundaries passed');
}
