// Read-only overview: the board by status, open PRs and what staging has that production lacks.
//   node .claude/scripts/status.mjs [--json] [--all]     (--all: include Done items)
import { PRODUCTION, STAGING, STATUSES } from '../../.github/scripts/lib/config.mjs';
import { ghJson, loadBoard, parseArgs, repo } from './lib/sprint.mjs';

const { flags } = parseArgs(process.argv.slice(2));
const slug = repo();
const { board, items } = loadBoard();

const byStatus = Object.fromEntries(STATUSES.map((s) => [s, []]));
byStatus['(no status)'] = [];
for (const item of items) {
  const c = item.content;
  if (!c || c.repository !== slug || c.type === 'PullRequest') continue;
  const bucket = item.status && byStatus[item.status] ? item.status : item.status || '(no status)';
  (byStatus[bucket] ??= []).push({
    number: c.number,
    title: c.title,
    milestone: item.milestone?.title ?? null,
    labels: item.labels ?? [],
  });
}

const prs =
  ghJson([
    'pr',
    'list',
    '--repo',
    slug,
    '--state',
    'open',
    '--limit',
    '50',
    '--json',
    'number,title,headRefName,baseRefName,isDraft,reviewDecision,statusCheckRollup',
  ]) ?? [];
const checks = (p) => {
  const rollup = p.statusCheckRollup ?? [];
  if (!rollup.length) return 'no checks';
  if (
    rollup.some((c) =>
      ['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ERROR'].includes(c.conclusion || c.state),
    )
  )
    return 'failing';
  if (rollup.some((c) => (c.status && c.status !== 'COMPLETED') || c.state === 'PENDING'))
    return 'pending';
  return 'passing';
};

let ahead = null;
try {
  ahead = ghJson([
    'api',
    `repos/${slug}/compare/${PRODUCTION}...${STAGING}`,
    '--jq',
    '{ahead_by,behind_by}',
  ]);
} catch {
  /* branches may not exist yet */
}

const report = {
  board: board.title,
  byStatus: Object.fromEntries(Object.entries(byStatus).filter(([, v]) => v.length)),
  openPullRequests: prs.map((p) => ({
    number: p.number,
    title: p.title,
    head: p.headRefName,
    base: p.baseRefName,
    draft: p.isDraft,
    checks: checks(p),
  })),
  stagingAheadOfProduction: ahead?.ahead_by ?? null,
};

if (flags.has('json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`Board "${board.title}"`);
for (const [status, list] of Object.entries(report.byStatus)) {
  if (status === 'Done' && !flags.has('all')) {
    console.log(`\n${status}: ${list.length} (use --all to list)`);
    continue;
  }
  console.log(`\n${status} (${list.length})`);
  for (const i of list)
    console.log(`  #${i.number} ${i.title}${i.milestone ? `  [${i.milestone}]` : ''}`);
}
console.log(`\nOpen pull requests (${prs.length})`);
for (const p of report.openPullRequests)
  console.log(
    `  #${p.number} ${p.title}  ${p.head} -> ${p.base}  ${p.draft ? 'draft, ' : ''}checks ${p.checks}`,
  );
console.log(
  `\n${STAGING} vs ${PRODUCTION}: ${ahead ? `${ahead.ahead_by} commit(s) to promote` : 'unknown'}${ahead?.behind_by ? `, ${ahead.behind_by} behind (hotfix on ${PRODUCTION}?)` : ''}`,
);
