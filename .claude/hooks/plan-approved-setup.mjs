// PostToolUse(ExitPlanMode) hook: the plan was approved, so apply its "## Task setup" section
// (issue, fields, project status, linked branch). Never blocks; reports the outcome to Claude.
//   PLAN_GATE=off skips it, TASK_SETUP_DRY_RUN=1 only previews (used for tests).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PROJECT } from '../../.github/scripts/lib/config.mjs';
import { context, parseTaskSetup, planPath, readStdin, validateTaskSetup } from './lib/ticket.mjs';

if (process.env.PLAN_GATE === 'off') process.exit(0);

const payload = readStdin();
const file = planPath(payload);
if (!file)
  context(
    'PostToolUse',
    'Task setup not applied: could not locate the plan file. Run task-setup.mjs --plan <file> by hand.',
  );

const setup = parseTaskSetup(readFileSync(file, 'utf8'));
if (!setup) process.exit(0);
const problems = validateTaskSetup(setup);
if (problems.length) {
  context(
    'PostToolUse',
    `Task setup not applied, the section is incomplete:\n${problems.map((p) => `- ${p}`).join('\n')}`,
  );
}

const script = join(dirname(fileURLToPath(import.meta.url)), 'task-setup.mjs');
const args = [script, '--plan', file, ...(process.env.TASK_SETUP_DRY_RUN ? ['--dry-run'] : [])];
let report;
try {
  report = execFileSync('node', args, {
    cwd: payload.cwd || process.env.CLAUDE_PROJECT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 50000,
  }).trim();
} catch (error) {
  report = `FAILED:\n${`${error.stdout || ''}${error.stderr || ''}`.trim() || error.message}`;
}

// Issue number for the session title: the report first (created / existing), then the plan itself
const issueNumber =
  /(?:created|done: issue) #(\d+)/.exec(report)?.[1] || (setup.issue ? String(setup.issue) : null);
const english = (setup.title || '').split(' / ')[0].trim();
const titleHint = issueNumber
  ? `Then run the \`session-title\` skill: rename this session to \`${DEFAULT_PROJECT} #${issueNumber}: <short description${english ? `, e.g. from "${english}"` : ''}>\`.`
  : 'The issue number is still unknown: do not rename the session yet; run the `session-title` skill as soon as it is.';

context(
  'PostToolUse',
  [
    'Task setup applied automatically because the plan was approved:',
    report,
    'Use the issue number above in commit footers (`Refs: #N`) and the PR title. Check `git branch --show-current` before the first commit.',
    titleHint,
  ].join('\n'),
);
