// Month rollover: creates the next milestone and moves unfinished issues into it.
//   node .claude/scripts/rollover.mjs [--from 2026.10] [--to 2026.11] [--status "Todo,In Progress"]
//        [--only 1204,1207] [--except 1211] [--no-close] [--apply]
// Dry-run unless --apply is given. Default scope is the open issues of the current month's
// milestone whose board Status is listed in `.claude/sprint.config.json` (rolloverStatuses).
import {
  config,
  findMilestone,
  gh,
  ghJson,
  list,
  listMilestones,
  loadBoard,
  milestoneDue,
  milestoneTitle,
  monthKey,
  normalizeStatus,
  parseArgs,
  parseMonth,
  repo,
  resolveStatuses,
  shiftMonth,
  today,
} from './lib/sprint.mjs';

const { flags, values } = parseArgs(process.argv.slice(2));
const apply = flags.has('apply');
const from = values.from ? parseMonth(values.from) : today();
const to = values.to ? parseMonth(values.to) : shiftMonth(from, 1);
const only = values.only ? list(values.only).map(Number) : null;
const except = new Set(values.except ? list(values.except).map(Number) : []);
const log = (msg) => console.log(`${apply ? '' : '[dry-run] '}${msg}`);

const slug = repo();
const milestones = listMilestones(slug);
const source = findMilestone(milestones, from);
if (!source) throw new Error(`no milestone for ${monthKey(from)}`);
if (monthKey(to) <= monthKey(from)) throw new Error('target month must be after the source month');

const { items, statuses } = loadBoard();
const moveStatuses = resolveStatuses(
  values.status ? list(values.status) : config.rolloverStatuses,
  statuses,
);
const moveKeys = new Set(moveStatuses.map(normalizeStatus));

// Open issues (not PRs) in the source milestone, joined with their board status.
const open = ghJson([
  'api',
  '--paginate',
  `repos/${slug}/issues?milestone=${source.number}&state=open&per_page=100`,
]).filter((i) => !i.pull_request);
const statusOf = new Map(
  items.filter((i) => i.content?.repository === slug).map((i) => [i.content.number, i.status]),
);

const candidates = open.map((i) => ({
  number: i.number,
  title: i.title,
  status: statusOf.get(i.number) ?? 'Todo',
}));
const move = candidates
  .filter((i) => (only ? only.includes(i.number) : moveKeys.has(normalizeStatus(i.status))))
  .filter((i) => !except.has(i.number));
const stay = candidates.filter((i) => !move.includes(i));

let target = findMilestone(milestones, to);
log(`${source.title} -> ${target ? target.title : `${milestoneTitle(to)} (new)`}`);
log(`moving statuses: ${only ? `only #${only.join(', #')}` : moveStatuses.join(', ')}`);

if (!target) {
  log(`create milestone "${milestoneTitle(to)}", due ${milestoneDue(to)}`);
  if (apply) {
    target = JSON.parse(
      gh([
        'api',
        `repos/${slug}/milestones`,
        '-f',
        `title=${milestoneTitle(to)}`,
        '-f',
        `due_on=${milestoneDue(to)}`,
        '-f',
        'state=open',
      ]),
    );
  }
}

for (const i of move) {
  log(`move #${i.number} [${i.status}] ${i.title}`);
  if (apply) {
    gh([
      'api',
      '-X',
      'PATCH',
      `repos/${slug}/issues/${i.number}`,
      '-F',
      `milestone=${target.number}`,
    ]);
  }
}
if (!move.length) log('nothing to move');
for (const i of stay) log(`stays #${i.number} [${i.status}] ${i.title}`);

// Close the old milestone once nothing open is left in it.
if (!flags.has('no-close')) {
  if (stay.length) {
    log(`keep ${source.title} open: ${stay.length} open issue(s) stay in it`);
  } else {
    log(`close milestone ${source.title}`);
    if (apply)
      gh(['api', '-X', 'PATCH', `repos/${slug}/milestones/${source.number}`, '-f', 'state=closed']);
  }
}
if (!apply) console.log('\nDry run only. Re-run with --apply to write these changes.');
