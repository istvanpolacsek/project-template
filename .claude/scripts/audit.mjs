// Dependency audit for the /deps command (pnpm). Read-only unless --apply.
//   node .claude/scripts/audit.mjs [--json] [--min-prod moderate] [--min-dev high] [--apply]
// --apply runs `pnpm audit --fix update` (lockfile bump; `--method override` pins versions in the workspace file) and `pnpm install`.
import { execFileSync, spawnSync } from 'node:child_process';
import { parseArgs } from './lib/sprint.mjs';

const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const { flags, values } = parseArgs(process.argv.slice(2));
const minProd = RANK[values['min-prod'] ?? 'moderate'];
const minDev = RANK[values['min-dev'] ?? 'high'];

const audit = (scope) => {
  const r = spawnSync('pnpm', ['audit', '--json', ...(scope ? [scope] : [])], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    return JSON.parse(r.stdout || '{}').advisories ?? {};
  } catch {
    throw new Error(`pnpm audit failed: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
  }
};

const prodIds = new Set(Object.keys(audit('--prod')));
const findings = Object.entries(audit())
  .map(([id, a]) => {
    const production = prodIds.has(id);
    const fixable = Boolean(a.patched_versions && a.patched_versions !== '<0.0.0');
    return {
      id,
      package: a.module_name,
      severity: a.severity,
      title: a.title,
      url: a.url,
      vulnerable: a.vulnerable_versions,
      patched: a.patched_versions,
      fixable,
      production,
      versions: [...new Set(a.findings.map((f) => f.version))],
      via: [
        ...new Set(a.findings.flatMap((f) => f.paths.map((p) => p.split('>').slice(1, 2)[0]))),
      ].slice(0, 5),
    };
  })
  .filter((f) => RANK[f.severity] >= (f.production ? minProd : minDev))
  .sort((a, b) => RANK[b.severity] - RANK[a.severity]);

if (flags.has('json')) {
  console.log(JSON.stringify({ findings }, null, 2));
} else if (!findings.length) {
  console.log('No findings at the chosen levels.');
} else {
  for (const f of findings)
    console.log(
      `${f.severity.padEnd(8)} ${f.production ? 'prod' : 'dev '} ${f.package}@${f.versions.join(',')}  ${f.title}\n         patched: ${f.patched || 'none'}${f.fixable ? '' : '  (unpatched)'}  via ${f.via.join(', ')}  ${f.url}`,
    );
}

if (flags.has('apply')) {
  if (!findings.some((f) => f.fixable)) {
    console.log('Nothing fixable.');
    process.exit(0);
  }
  // 1. `update`: bump within the existing ranges. 2. whatever is still fixable: pin with `overrides`
  // (what a parent package's exact pin needs). Prefer upgrading the parent (e.g. `pnpm up nx@latest`) when it exists.
  const run = (method) => execFileSync('pnpm', ['audit', '--fix', method], { stdio: 'inherit' });
  const fixableLeft = () =>
    audit() &&
    Object.values(audit()).some((a) => a.patched_versions && a.patched_versions !== '<0.0.0');
  const methods = values.method ? [values.method] : ['update', 'override'];
  for (const method of methods) {
    try {
      run(method);
    } catch {
      console.log(`pnpm audit --fix ${method} did not finish, trying the next method`);
    }
    if (!fixableLeft()) break;
  }
  execFileSync('pnpm', ['install'], { stdio: 'inherit' });
  console.log(
    'Applied. Re-run without --apply to see what is left. Overrides are a stopgap: remove them when the parent package catches up.',
  );
}
