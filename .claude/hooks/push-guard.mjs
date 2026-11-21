// PreToolUse(Bash) hook for `git push`: Claude never pushes to the production or staging branch, and
// never force-pushes. Releases commit the version through .claude/scripts/release-bump.mjs (run from /promote
// after the user's yes), which is not a `git push` typed by Claude. Disable with PUSH_GUARD=off.
import { PRODUCTION, STAGING } from '../../.github/scripts/lib/config.mjs';
import { currentBranch, deny, invokes, readStdin } from './lib/ticket.mjs';
import { pushProblem } from './lib/push-guard.mjs';

if (process.env.PUSH_GUARD === 'off') process.exit(0);
const payload = readStdin();
const command = String(payload.tool_input?.command || '');
if (!invokes(command, 'git push')) process.exit(0);

const branch = currentBranch(payload.cwd || process.env.CLAUDE_PROJECT_DIR);
const problem = pushProblem(command, branch, { production: PRODUCTION, staging: STAGING });
if (problem) deny(`Push blocked: ${problem}`);
