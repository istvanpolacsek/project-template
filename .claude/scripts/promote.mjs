// Facts for a staging -> main promotion PR: the PRs merged into `staging` that `main` lacks, the
// issues behind them, risky paths, CI state of the merged PRs and an already open promotion PR.
//   node .claude/scripts/promote.mjs [--json]
// Read-only. The `/promote` command turns this report into the PR description.
import { execFileSync } from 'node:child_process';
import { PRODUCTION, SECONDARY, STAGING } from '../../.github/scripts/lib/config.mjs';
import { ghJson, parseArgs, repo } from './lib/sprint.mjs';
import { inferBump, nextVersion } from './lib/version.mjs';

const git = (args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const RISKS = [
  ['hosting', /^(vercel\.json|next\.config\.[cm]?[jt]s)$/],
  ['dependencies', /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/],
  ['env-file', /(^|\/)\.env[^/]*$/],
  ['workflows', /^\.github\/workflows\//],
];

const { flags } = parseArgs(process.argv.slice(2));
const slug = repo();

git(['fetch', '--quiet', '--tags', 'origin', PRODUCTION, STAGING]);
const range = `origin/${PRODUCTION}..origin/${STAGING}`;
const head = git(['rev-parse', `origin/${STAGING}`]);
const commits = git(['log', range, '--first-parent', '--format=%H%x09%s'])
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [sha, ...subject] = line.split('\t');
    return { sha, subject: subject.join('\t') };
  });

const report = { repo: slug, stagingHead: head, ahead: commits.length, prs: [], direct: [] };

// with a secondary language titles read `English / Other`; the release text is written from the English half
const enTitle = (title) => (SECONDARY ? title.split(' / ')[0] : title).trim();

const issueCache = new Map();
const issueOf = (number) => {
  if (!issueCache.has(number)) {
    try {
      const i = ghJson(['api', `repos/${slug}/issues/${number}`]);
      issueCache.set(number, {
        number,
        title: enTitle(i.title),
        type: i.type?.name ?? null,
        state: i.state,
      });
    } catch {
      issueCache.set(number, { number, title: null, type: null, state: null });
    }
  }
  return issueCache.get(number);
};

for (const { sha, subject } of commits) {
  let pulls = [];
  try {
    pulls = ghJson(['api', `repos/${slug}/commits/${sha}/pulls`]) ?? [];
  } catch {
    // fall through to "direct"
  }
  const pr = pulls.find((p) => p.base.ref === STAGING && p.merged_at);
  if (!pr) {
    report.direct.push({ sha: sha.slice(0, 8), subject });
    continue;
  }
  const refs = new Set();
  const title = /\[#(\d+)\b/.exec(pr.title);
  if (title) refs.add(Number(title[1]));
  for (const [, line] of String(pr.body ?? '').matchAll(/^Refs?:\s*(.+)$/gim)) {
    for (const [, id] of line.matchAll(/#(\d+)/g)) refs.add(Number(id));
  }
  report.prs.push({
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    author: pr.user.login,
    headSha: pr.head.sha,
    head: pr.head.ref,
    issues: [...refs].map(issueOf),
  });
}

if (commits.length) {
  const files = git(['diff', '--name-only', `origin/${PRODUCTION}...origin/${STAGING}`]).split(
    '\n',
  );
  report.risks = Object.fromEntries(
    RISKS.map(([name, re]) => [name, files.filter((f) => re.test(f))]).filter(([, f]) => f.length),
  );
  const added = git([
    'diff',
    '-U0',
    `origin/${PRODUCTION}...origin/${STAGING}`,
    '--',
    '*.ts',
    '*.tsx',
    '*.js',
  ]);
  const envNames = new Set(
    [...added.matchAll(/^\+.*process\.env\.([A-Z0-9_]+)/gm)].map((m) => m[1]),
  );
  if (envNames.size) report.risks['env-vars-referenced'] = [...envNames].sort();

  // Checks run on the PR head (build-pr.yaml is a pull_request workflow), not on the staging push.
  const bad = new Set(['failure', 'timed_out', 'cancelled', 'action_required']);
  report.ci = { passing: 0, failing: [], pending: [], noChecks: [] };
  for (const p of report.prs) {
    try {
      const runs = ghJson([
        'api',
        `repos/${slug}/commits/${p.headSha}/check-runs?per_page=100`,
      ]).check_runs;
      if (!runs.length) report.ci.noChecks.push(`#${p.number}`);
      for (const r of runs) {
        if (bad.has(r.conclusion)) report.ci.failing.push(`#${p.number} ${r.name}`);
        else if (r.status !== 'completed') report.ci.pending.push(`#${p.number} ${r.name}`);
        else report.ci.passing++;
      }
    } catch (e) {
      report.ci.error = e.message;
    }
  }
}

report.openPromotion =
  ghJson([
    'pr',
    'list',
    '--repo',
    slug,
    '--base',
    PRODUCTION,
    '--head',
    STAGING,
    '--state',
    'open',
    '--json',
    'number,title,url',
  ])[0] ?? null;

// Release version: package.json on the production branch + the bump the shipping commits call for
try {
  const current = JSON.parse(git(['show', `origin/${PRODUCTION}:package.json`])).version;
  const onStaging = JSON.parse(git(['show', `origin/${STAGING}:package.json`])).version;
  // Squash commits carry the PR title (`[#12 -> STG] ...`), which is not a Conventional Commit, so the type
  // comes from the ticket branch prefix (feat/ fix/ chore/) as well; a breaking `!` in the title still counts.
  const fromBranches = report.prs.map(
    (p) => `${/^(feat|fix|chore)\//.exec(p.head)?.[1] ?? 'chore'}: ${p.title}`,
  );
  const bump = inferBump([...commits.map((c) => c.subject), ...fromBranches]);
  const next = nextVersion(current, bump);
  report.version = { current, bump, next, alreadyOnStaging: onStaging === next };
} catch (e) {
  report.version = { error: e.message };
}

if (flags.has('json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

if (!commits.length) {
  console.log(`Nothing to promote: ${PRODUCTION} already contains ${STAGING}.`);
  if (report.openPromotion) console.log(`Open promotion PR: #${report.openPromotion.number}`);
  process.exit(0);
}

console.log(
  `${STAGING} is ${report.ahead} commit(s) ahead of ${PRODUCTION} (head ${head.slice(0, 8)})`,
);
for (const p of report.prs) {
  const issues = p.issues.map((i) => `#${i.number}${i.title ? ` ${i.title}` : ''}`).join('; ');
  console.log(`  #${p.number}  ${p.title}${issues ? `  [${issues}]` : ''}  (${p.author})`);
}
for (const d of report.direct) console.log(`  direct commit ${d.sha}  ${d.subject}`);
console.log(
  Object.keys(report.risks).length
    ? 'Risky paths:'
    : 'Risky paths: none (no hosting config, content model or dependency changes)',
);
for (const [name, files] of Object.entries(report.risks)) {
  console.log(`  ${name}: ${files.slice(0, 6).join(', ')}${files.length > 6 ? ', ...' : ''}`);
}
const { ci } = report;
const names = (list) => (list.length ? ` (${list.join(', ')})` : '');
console.log(
  ci.error
    ? `CI of the PR heads: unknown (${ci.error})`
    : `CI of the PR heads: ${ci.passing} passing, ${ci.failing.length} failing${names(ci.failing)}, ${ci.pending.length} pending${names(ci.pending)}${ci.noChecks.length ? `; no checks reported for ${ci.noChecks.join(', ')}` : ''}`,
);
console.log(
  report.version.error
    ? `Version: unknown (${report.version.error})`
    : `Version: v${report.version.current} -> v${report.version.next} (${report.version.bump})${report.version.alreadyOnStaging ? ', already committed on ' + STAGING : ''}`,
);
console.log(
  report.openPromotion
    ? `Open promotion PR: #${report.openPromotion.number} ${report.openPromotion.title}`
    : 'Open promotion PR: none',
);
