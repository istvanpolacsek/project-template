// PreToolUse(Bash) hook for `gh pr create`: enforce the PR title convention
//   [#N -> STG] description      base staging
//   [#N -> PROD] description     base main
//   [STG -> PROD] description    release merge staging -> main
import { PRODUCTION, STAGING } from '../../.github/scripts/lib/config.mjs';
import {
  context,
  currentBranch,
  deny,
  envForBase,
  getIssue,
  invokes,
  optionValue,
  parseBranch,
  readStdin,
  repoSlug,
  shellTokens,
} from './lib/ticket.mjs';

const payload = readStdin();
const command = String(payload.tool_input?.command || '');
if (!invokes(command, 'gh pr create')) process.exit(0);

const cwd = payload.cwd || process.env.CLAUDE_PROJECT_DIR;
const tokens = shellTokens(command);
const title = optionValue(tokens, 'title', 't');
const base = optionValue(tokens, 'base', 'B');
const head = optionValue(tokens, 'head', 'H') || currentBranch(cwd);
const ticket = parseBranch(head);

const env = envForBase(base);
if (!base || !env) {
  deny(
    'Pass an explicit `--base`: `staging` for a stage PR ([#N -> STG]) or `main` for production ([#N -> PROD] / [STG -> PROD]).',
  );
}

let suggestion = '[STG -> PROD] description';
if (ticket) {
  const issue = getIssue(repoSlug(cwd), ticket.number, cwd);
  const desc = (issue?.title || ticket.slug.replace(/-/g, ' ')).split(' / ')[0].toLowerCase();
  suggestion = `[#${ticket.number} -> ${env}] ${desc}`;
}

if (!title)
  deny(`Pass an explicit --title following the convention, e.g. --title "${suggestion}".`);

const m = /^\[(?:#(\d+) -> (STG|PROD)|STG -> PROD)\] \S.*$/.exec(title);
if (!m)
  deny(
    `PR title "${title}" does not follow \`[#N -> STG|PROD] description\`. Suggested: "${suggestion}"`,
  );
if (m[2] && m[2] !== env)
  deny(`Title targets ${m[2]} but --base ${base} means ${env}. Suggested: "${suggestion}"`);
if (!m[2] && !(base === PRODUCTION && head === STAGING)) {
  deny(
    `\`[STG -> PROD]\` is only for the staging -> main release merge. Suggested: "${suggestion}"`,
  );
}
if (m[1] && ticket && Number(m[1]) !== ticket.number) {
  deny(
    `Title references #${m[1]} but branch ${head} belongs to #${ticket.number}. Suggested: "${suggestion}"`,
  );
}

const body = optionValue(tokens, 'body', 'b') ?? command;
if (ticket && !new RegExp(`#${ticket.number}\\b`).test(body)) {
  context(
    'PreToolUse',
    `Reminder: the PR description should reference the ticket (Closes/Refs #${ticket.number}) and end with the attribution line.`,
  );
}
