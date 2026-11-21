#!/usr/bin/env node
// Fails when code reads `process.env.NAME` / `import.meta.env.NAME` and `.env.example` does not list NAME.
// Allowed without listing: NODE_ENV, CI and the platform variables below.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BUILT_IN = new Set([
  'NODE_ENV',
  'CI',
  'PORT',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_GIT_COMMIT_REF',
  'VERCEL_GIT_COMMIT_SHA',
  'NX_DAEMON',
  'NX_NO_CLOUD',
  'HUSKY',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'CLAUDE_PROJECT_DIR',
  'PLAN_GATE',
  'PUSH_GUARD',
  'TASK_SETUP_DRY_RUN',
  'PROJECT_NUMBER',
  'RELEASE_NAME',
  'SKIP_ENV_CHECK',
]);
const SOURCE = /\.(?:[cm]?[jt]sx?|vue|svelte)$/;
const IGNORED_DIRS = /^(?:\.claude|\.github|scripts|docs|node_modules|dist)\//;

export const envNames = (text) =>
  [...text.matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]);

export const listed = (example) =>
  new Set([...example.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.SKIP_ENV_CHECK) process.exit(0);
  const known = listed(readFileSync('.env.example', 'utf8'));
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => SOURCE.test(f) && !IGNORED_DIRS.test(f) && !/\.(?:test|spec)\./.test(f));
  const missing = new Map();
  for (const f of files)
    for (const name of envNames(readFileSync(f, 'utf8')))
      if (!known.has(name) && !BUILT_IN.has(name))
        (missing.get(name) ?? missing.set(name, []).get(name)).push(f);
  if (missing.size) {
    console.error('Environment variables read in code but missing from .env.example:');
    for (const [name, where] of missing)
      console.error(`  ${name}  (${[...new Set(where)].slice(0, 3).join(', ')})`);
    console.error(
      'Add them (with a placeholder value) so a fresh checkout and the Vercel project know about them.',
    );
    process.exit(1);
  }
  console.log(`env check ok (${known.size} documented variable(s))`);
}
