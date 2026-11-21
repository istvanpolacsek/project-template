// Moves the issues referenced by a merged PR to `On Stage` (base staging) or `On Prod` (base main)
// on the Project board named in .github/project.config.json. Forward only, never closes an issue.
//   GH_TOKEN=<token with project write> node .github/scripts/project-status.mjs \
//     --repo OWNER/REPO --pr 12 --base staging [--dry-run]
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { OWNER, PRODUCTION, PROJECT_NUMBER, STAGING, STATUSES } from './lib/config.mjs';

const PROJECT = String(PROJECT_NUMBER);
const TARGETS = { [STAGING]: 'On Stage', [PRODUCTION]: 'On Prod' };
const ORDER = STATUSES;

const { values } = parseArgs({
  options: {
    repo: { type: 'string' },
    pr: { type: 'string' },
    base: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const { repo, pr, base } = values;
const dryRun = values['dry-run'];
if (!repo || !pr || !base) throw new Error('--repo, --pr and --base are required');

const target = TARGETS[base];
if (!target) {
  console.log(`base ${base} is not tracked, nothing to do`);
  process.exit(0);
}

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const ghJson = (args) => JSON.parse(gh(args));

// Fail loudly when the token cannot reach the project (GitHub App missing or without the org Projects permission).
let board;
let fields;
try {
  board = ghJson(['project', 'view', PROJECT, '--owner', OWNER, '--format', 'json']);
  fields = ghJson(['project', 'field-list', PROJECT, '--owner', OWNER, '--format', 'json']).fields;
} catch (error) {
  console.error(
    `::error::Cannot read project ${OWNER}/${PROJECT}. Check the token: PROJECT_TOKEN (a classic PAT with the project and repo scopes, needed for personal accounts) or the GitHub App (BOT_APP_ID / BOT_APP_PRIVATE_KEY, organisations only, "Projects: read and write"). ${error.message}`,
  );
  process.exit(1);
}
const status = fields.find((f) => f.name === 'Status');
const option = status?.options.find((o) => o.name === target);
if (!option) {
  console.error(`::error::Status option "${target}" not found on the board`);
  process.exit(1);
}

const refs = new Set();
const collect = (text) => {
  for (const [, id] of String(text ?? '').matchAll(/\[#(\d+)\b/g)) refs.add(Number(id));
  for (const [, line] of String(text ?? '').matchAll(/^Refs?:\s*(.+)$/gim)) {
    for (const [, id] of line.matchAll(/#(\d+)/g)) refs.add(Number(id));
  }
};

const pull = ghJson(['api', `repos/${repo}/pulls/${pr}`]);
collect(pull.title);
collect(pull.body);
const commits = ghJson([
  'api',
  '--paginate',
  '--slurp',
  `repos/${repo}/pulls/${pr}/commits`,
]).flat();
for (const c of commits) collect(c.commit.message);

console.log(`PR #${pr} -> ${base}: target "${target}", issues: ${[...refs].join(', ') || 'none'}`);

const QUERY = `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){issue(number:$number){
    projectItems(first:10){nodes{id project{id} fieldValueByName(name:"Status"){
      ... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}`;
const [owner, name] = repo.split('/');

for (const number of [...refs].sort((a, b) => a - b)) {
  let issue;
  try {
    issue = ghJson([
      'api',
      'graphql',
      '-f',
      `query=${QUERY}`,
      '-F',
      `owner=${owner}`,
      '-F',
      `name=${name}`,
      '-F',
      `number=${number}`,
    ]).data.repository.issue;
  } catch {
    console.log(`#${number}: not an issue, skipped`);
    continue;
  }
  const item = issue?.projectItems.nodes.find((n) => n.project.id === board.id);
  if (!item) {
    console.log(`#${number}: not on the board, skipped`);
    continue;
  }
  const current = item.fieldValueByName?.name ?? null;
  if (current && ORDER.indexOf(current) >= ORDER.indexOf(target)) {
    console.log(`#${number}: already ${current}, skipped`);
    continue;
  }
  if (dryRun) {
    console.log(`#${number}: ${current ?? 'unset'} -> ${target} (dry run)`);
    continue;
  }
  gh([
    'project',
    'item-edit',
    '--id',
    item.id,
    '--project-id',
    board.id,
    '--field-id',
    status.id,
    '--single-select-option-id',
    option.id,
  ]);
  console.log(`#${number}: ${current ?? 'unset'} -> ${target}`);
}
