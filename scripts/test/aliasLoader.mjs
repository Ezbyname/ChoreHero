// Node module-resolution hook so `node --test` can resolve both the `@/*`
// alias Babel/TypeScript already resolve for the app (see babel.config.js,
// tsconfig.json) and plain extensionless relative imports (e.g. `./profiles`
// re-exported from src/lib/repositories/index.ts). Only used by the
// unit-test runner — the app itself never loads this file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');

// The app's bundler (Babel/Metro) resolves module paths against both
// `foo.ts(x)` and `foo/index.ts` extensionlessly; plain Node ESM resolution
// requires an explicit, existing file, so that lookup is replicated by hand.
function resolveExtensionless(base) {
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return `${base}.ts`;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = pathToFileURL(resolveExtensionless(path.join(projectRoot, 'src', specifier.slice(2)))).href;
    return nextResolve(target, context);
  }

  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier)) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const target     = pathToFileURL(resolveExtensionless(path.join(parentDir, specifier))).href;
    return nextResolve(target, context);
  }

  return nextResolve(specifier, context);
}
