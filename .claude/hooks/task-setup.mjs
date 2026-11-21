// Applies the "## Task setup" block of an approved plan to GitHub and git. Idempotent.
//   node .claude/hooks/task-setup.mjs --plan <plan.md> [--dry-run] [--base staging]
// Creates the issue when asked, fills type / assignee / milestone / project / description,
// then prepares the linked working branch (unless already on a `type/N/slug` branch).
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SECONDARY, STAGING, TYPE_MODE } from '../../.github/scripts/lib/config.mjs';
import {
  currentBranch,
  currentMilestone,
  getIssue,
  gh,
  git,
  parseBranch,
  parseTaskSetup,
  repoSlug,
  setIssueStatus,
  validateTaskSetup,
} from './lib/ticket.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};

const dry = flag('dry-run');
const planFile = value('plan');
const base = value('base') || STAGING;
if (!planFile) {
  console.error('usage: task-setup.mjs --plan <plan.md> [--dry-run] [--base staging]');
  process.exit(1);
}

const setup = parseTaskSetup(readFileSync(planFile, 'utf8'));
const problems = validateTaskSetup(setup);
if (problems.length) {
  console.error(`Task setup is incomplete:\n${problems.map((p) => `- ${p}`).join('\n')}`);
  process.exit(1);
}

const repo = repoSlug();
const log = (msg) => console.log(`${dry ? '[dry-run] ' : ''}${msg}`);
const fail = (msg) => {
  console.error(msg);
  process.exitCode = 1;
};

/** Run a gh write call, or just print it in dry-run mode. */
const write = (description, ghArgs) => {
  log(description);
  if (dry) return '';
  const out = gh(ghArgs);
  if (out === null) fail(`  failed: gh ${ghArgs.join(' ')}`);
  return out;
};

const isBug = setup.type === 'Bug';
const summaryMd = SECONDARY
  ? [
      '## EN',
      ...setup.summary.map((s) => `- ${s}`),
      ...(isBug ? ['', '### Repro', setup.repro] : []),
      '',
      `## ${SECONDARY.code.toUpperCase()}`,
      ...setup.summaryHu.map((s) => `- ${s}`),
      ...(isBug ? ['', '### Repro', setup.reproHu] : []),
    ].join('\n')
  : [
      '## Summary',
      ...setup.summary.map((s) => `- ${s}`),
      ...(isBug ? ['', '### Repro', setup.repro] : []),
    ].join('\n');
const hasSummary = (body) => /^## (Summary|EN|Plan summary)\s*$/m.test(body);
const bodyFile = join(tmpdir(), `task-setup-${process.pid}.md`);
const withBodyFile = (text, fn) => {
  writeFileSync(bodyFile, text);
  return fn();
};

// 1. issue ---------------------------------------------------------------------------------
let number = setup.issue;
const milestone = currentMilestone(repo);
if (!number) {
  log(`create issue "${setup.title}" (${setup.type})`);
  if (!dry) {
    const url = withBodyFile(summaryMd, () =>
      gh([
        'issue',
        'create',
        '--title',
        setup.title,
        '--body-file',
        bodyFile,
        '--assignee',
        '@me',
        ...(milestone ? ['--milestone', milestone.title] : []),
      ]),
    );
    number = Number(/\/(\d+)$/.exec(url || '')?.[1]);
    if (!number) {
      fail('could not create the issue');
      process.exit(1);
    }
    log(`created #${number}: ${url}`);
  } else {
    number = 0;
  }
}

if (number || !dry) {
  const issue = number ? getIssue(repo, number) : null;
  if (issue) {
    if (issue.type !== setup.type) {
      write(
        `set type ${issue.type || 'none'} -> ${setup.type}`,
        TYPE_MODE === 'issue-type'
          ? ['api', '-X', 'PATCH', `repos/${repo}/issues/${number}`, '-f', `type=${setup.type}`]
          : ['issue', 'edit', String(number), '--add-label', `type: ${setup.type}`],
      );
    }
    if (!issue.assignees.length) {
      write('assign @me', ['issue', 'edit', String(number), '--add-assignee', '@me']);
    }
    if (!issue.milestone && milestone) {
      write(`set milestone ${milestone.title}`, [
        'issue',
        'edit',
        String(number),
        '--milestone',
        milestone.title,
      ]);
    }
    if (!hasSummary(issue.body)) {
      const body = issue.body.trim() ? `${issue.body.trim()}\n\n${summaryMd}` : summaryMd;
      log(`${issue.body.trim() ? 'append' : 'write'} plan summary to the description`);
      if (
        !dry &&
        withBodyFile(body, () => gh(['issue', 'edit', String(number), '--body-file', bodyFile])) ===
          null
      )
        fail('  failed to update the description');
    }
    setStatus(number);
  }
}

/** Put the issue on the board (if needed) and start it: Todo / unset -> In Progress. */
function setStatus(n) {
  const msg = setIssueStatus(repo, n, 'In Progress', {
    project: setup.project,
    onlyFrom: [null, 'Todo'],
    dry,
  });
  log(`project: ${msg}`);
  if (msg.startsWith('cannot') || msg.startsWith('not found')) fail(`  ${msg}`);
}

// 2. branch --------------------------------------------------------------------------------
const branch = currentBranch();
if (parseBranch(branch)) {
  log(`already on working branch ${branch}, no branch work`);
} else {
  const planned = setup.branch.replace(/\/new\//, `/${number || 'NEW'}/`);
  // reuse a branch that is already linked to the issue, or that already exists on the remote
  const linked = (number ? getIssue(repo, number)?.linkedBranches : null) || [];
  const existing = linked.find(parseBranch) || null;
  const onRemote = Boolean(git(['ls-remote', '--heads', 'origin', planned]));
  const name = existing || planned;
  const create = !existing && !onRemote;
  log(
    create
      ? `create linked branch ${name} from ${base} and switch to it`
      : `reuse existing branch ${name} and switch to it`,
  );
  if (!dry) {
    if (
      create &&
      gh(['issue', 'develop', String(number), '--name', name, '--base', base]) === null
    ) {
      fail('  gh issue develop failed');
    } else if (git(['fetch', 'origin', name]) === null) {
      fail(`  could not fetch ${name}`);
    } else if (
      git(['switch', '-c', name, '--track', `origin/${name}`]) === null &&
      git(['switch', name]) === null
    ) {
      fail(`  could not switch to ${name} (uncommitted changes in the way?); switch manually`);
    }
  }
}

log(number ? `done: issue #${number}` : 'done (dry-run, issue would be created)');
