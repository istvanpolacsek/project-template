// Shared helpers for the sprint (monthly milestone) scripts: /rollover and /monthly-report.
// Node only, no dependencies. Reads the board through `gh`, writes only when a script asks to.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PROJECT, OWNER, repoSlug } from '../../hooks/lib/ticket.mjs';
import { PROJECT_NUMBER } from '../../../.github/scripts/lib/config.mjs';

// Scripts report failures as one line, not a stack trace.
process.on('uncaughtException', (e) => {
  console.error(e.message);
  process.exit(1);
});

const here = dirname(fileURLToPath(import.meta.url));

export const config = JSON.parse(
  readFileSync(join(here, '..', '..', 'sprint.config.json'), 'utf8'),
);

export const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const repo = () => repoSlug();

/** Run gh and return stdout; unlike the hook helpers this throws with gh's own message. */
export const gh = (args) => {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    throw new Error(`gh ${args.join(' ')} failed: ${String(e.stderr || e.message).trim()}`);
  }
};
export const ghJson = (args) => JSON.parse(gh(args) || 'null');

export const pad = (n) => String(n).padStart(2, '0');

/** `2026.10`-style key for a Date or a `{year, month}` pair (month is 1-12). */
export const monthKey = ({ year, month }) => `${year}.${pad(month)}`;

export const shiftMonth = ({ year, month }, delta) => {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};

export const today = () => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

/** Accepts `2026.09`, `2026-09` or `2026/9`. */
export const parseMonth = (text) => {
  const m = /^(\d{4})[.\-/](\d{1,2})$/.exec(String(text).trim());
  if (!m || +m[2] < 1 || +m[2] > 12) throw new Error(`not a month (expected YYYY.MM): ${text}`);
  return { year: +m[1], month: +m[2] };
};

/** Milestone title in the repo's convention, e.g. `2026.11 (November)`. */
export const milestoneTitle = (ym) => `${monthKey(ym)} (${MONTHS_EN[ym.month - 1]})`;

/** Last day of the month at midnight UTC, as the existing milestones use for `due_on`. */
export const milestoneDue = ({ year, month }) =>
  `${new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)}T00:00:00Z`;

export const listMilestones = (slug) =>
  ghJson(['api', '--paginate', `repos/${slug}/milestones?state=all&per_page=100`]);

export const findMilestone = (milestones, ym) =>
  milestones.find((m) => m.title.startsWith(monthKey(ym))) || null;

/** Compare status names ignoring case, spaces and punctuation: `To Do` == `Todo`. */
export const normalizeStatus = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/** The project board (see .github/project.config.json) and its items, with a field lookup. */
export const loadBoard = () => {
  const projects = ghJson(['project', 'list', '--owner', OWNER, '--format', 'json']);
  const board =
    projects.projects.find((p) => p.number === PROJECT_NUMBER) ??
    projects.projects.find((p) => p.title === DEFAULT_PROJECT);
  if (!board) throw new Error(`project ${PROJECT_NUMBER} ("${DEFAULT_PROJECT}") not found`);
  const n = String(board.number);
  const items = ghJson([
    'project',
    'item-list',
    n,
    '--owner',
    OWNER,
    '--limit',
    '2000',
    '--format',
    'json',
  ]).items;
  const fields = ghJson(['project', 'field-list', n, '--owner', OWNER, '--format', 'json']).fields;
  const statuses = fields.find((f) => f.name === 'Status')?.options.map((o) => o.name) ?? [];
  return { board, items, statuses };
};

/** Resolve user supplied status names against the board's options, or throw. */
export const resolveStatuses = (names, known) =>
  names.map((name) => {
    const hit = known.find((k) => normalizeStatus(k) === normalizeStatus(name));
    if (!hit) throw new Error(`unknown status "${name}" (board has: ${known.join(', ')})`);
    return hit;
  });

export const parseArgs = (argv) => {
  const flags = new Set();
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`unexpected argument: ${argv[i]}`);
    const name = argv[i].slice(2);
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) flags.add(name);
    else values[name] = argv[++i];
  }
  return { flags, values };
};

export const list = (text) =>
  String(text)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
