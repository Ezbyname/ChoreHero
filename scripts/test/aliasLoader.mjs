// Node module-resolution hook so `node --test` can resolve the same `@/*`
// alias Babel/TypeScript already resolve for the app (see babel.config.js,
// tsconfig.json). Only used by the unit-test runner — the app itself never
// loads this file.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');

// The app's bundler (Babel/Metro) resolves `@/foo` against both
// `src/foo.ts(x)` and `src/foo/index.ts` extensionlessly; plain Node ESM
// resolution requires an explicit, existing file, so that lookup is
// replicated here by hand.
function resolveAliasPath(relativePath) {
  const base = path.join(projectRoot, 'src', relativePath);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return `${base}.ts`;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = pathToFileURL(resolveAliasPath(specifier.slice(2))).href;
    return nextResolve(target, context);
  }
  return nextResolve(specifier, context);
}
