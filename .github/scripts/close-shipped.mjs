// Closes the issues that a production deployment shipped. Triggered by the successful Vercel commit
// status (context `Vercel`) of a commit on `main`, so an issue is closed only once it is really
// live; the workflow can also be dispatched by hand with a commit.
//   GH_TOKEN=<token with issues write and project read> node .github/scripts/close-shipped.mjs \
//     --repo OWNER/REPO --sha <deployed commit> [--dry-run]
// The deployed commit is the `[STG -> PROD]` merge commit. The issues come from that release PR
// (title, body, commits) and from the ticket PRs it merged. Idempotent: a redeploy of the same
// commit (for example the Contentful deploy hook) finds nothing left to close.
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { OWNER, PRODUCTION, PROJECT_NUMBER } from './lib/config.mjs';
import { issueRefs, pullNumbers, skipReason } from './lib/shipped.mjs';

const PROJECT = String(PROJECT_NUMBER);

const { values } = parseArgs({
  options: {
    repo: { type: 'string' },
    sha: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const { repo, sha } = values;
const dryRun = values['dry-run'];
if (!repo || !sha) throw new Error('--repo and --sha are required');

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const ghJson = (args) => JSON.parse(gh(args));
const paginate = (path) => ghJson(['api', '--paginate', '--slurp', path]).flat();

const releases = ghJson(['api', `repos/${repo}/commits/${sha}/pulls`]).filter(
  (p) => p.merged_at && p.base.ref === PRODUCTION,
);
if (releases.length === 0) {
  console.log(`${sha} is not part of a merged PR into main, nothing to close`);
  process.exit(0);
}

const refs = new Set();
const seenPulls = new Set();
const addPull = (number) => {
  if (seenPulls.has(number)) return;
  seenPulls.add(number);
  let pull;
  try {
    pull = ghJson(['api', `repos/${repo}/pulls/${number}`]);
  } catch {
    return;
  }
  for (const id of issueRefs(`${pull.title}\n${pull.body ?? ''}`)) refs.add(id);
  // Commits of the release PR can name more ticket PRs ("Merge pull request #81", "(#72)").
  for (const c of paginate(`repos/${repo}/pulls/${number}/commits`)) {
    for (const id of issueRefs(c.commit.message)) refs.add(id);
    for (const prNumber of pullNumbers(c.commit.message)) addPull(prNumber);
  }
};
for (const release of releases) addPull(release.number);

console.log(
  `${sha}: PR ${releases.map((r) => `#${r.number}`).join(', ')}, issues: ${
    [...refs].sort((a, b) => a - b).join(', ') || 'none'
  }`,
);

const QUERY = `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){issueOrPullRequest(number:$number){
    __typename
    ... on Issue{state labels(first:50){nodes{name}}
      projectItems(first:10){nodes{project{number owner{... on Organization{login} ... on User{login}}}
        fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}}`;
const [owner, name] = repo.split('/');
const release = releases[0].number;
const tag = process.env.RELEASE_NAME ? `${process.env.RELEASE_NAME}, ` : '';

for (const number of [...refs].sort((a, b) => a - b)) {
  let node;
  try {
    node = ghJson([
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
    ]).data.repository.issueOrPullRequest;
  } catch {
    console.log(`#${number}: not found, skipped`);
    continue;
  }
  const item = node?.projectItems?.nodes.find(
    (n) => n.project.number === Number(PROJECT) && n.project.owner.login === OWNER,
  );
  const reason = skipReason({
    state: node?.state?.toLowerCase(),
    isPullRequest: node?.__typename !== 'Issue',
    labels: node?.labels?.nodes.map((l) => l.name) ?? [],
    status: item?.fieldValueByName?.name ?? null,
  });
  if (reason) {
    console.log(`#${number}: skipped, ${reason}`);
    continue;
  }
  if (dryRun) {
    console.log(`#${number}: would close (dry run)`);
    continue;
  }
  gh([
    'issue',
    'close',
    String(number),
    '--repo',
    repo,
    '--reason',
    'completed',
    '--comment',
    `Shipped in ${tag}PR #${release} (production deployment of ${sha.slice(0, 7)}).`,
  ]);
  console.log(`#${number}: closed`);
}
