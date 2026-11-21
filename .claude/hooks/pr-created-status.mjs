// PostToolUse(Bash) hook for `gh pr create`: once the PR exists, move its ticket to "In Review"
// on the project board (never backwards from a later stage). Silent on any failure.
import {
  context,
  currentBranch,
  invokes,
  optionValue,
  parseBranch,
  readStdin,
  repoSlug,
  setIssueStatus,
  shellTokens,
} from './lib/ticket.mjs';

const payload = readStdin();
const command = String(payload.tool_input?.command || '');
if (!invokes(command, 'gh pr create')) process.exit(0);
// only when gh printed the new pull request URL
if (!/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/.test(JSON.stringify(payload.tool_response ?? '')))
  process.exit(0);

const cwd = payload.cwd || process.env.CLAUDE_PROJECT_DIR;
const head = optionValue(shellTokens(command), 'head', 'H') || currentBranch(cwd);
const ticket = parseBranch(head);
if (!ticket) process.exit(0);

const msg = setIssueStatus(repoSlug(cwd), ticket.number, 'In Review', {
  onlyFrom: [null, 'Todo', 'In Progress'],
  cwd,
});
context('PostToolUse', `Project board: ${msg}`);
