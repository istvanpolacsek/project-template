// PreToolUse(Bash) hook for `git commit`: on a ticket branch (`type/N/slug`) the message must end
// with a `Refs: #N` footer matching the branch. Early feedback only, commitlint enforces it for everyone.
import { currentBranch, deny, invokes, parseBranch, readStdin } from './lib/ticket.mjs';

const payload = readStdin();
const command = String(payload.tool_input?.command || '');
if (!invokes(command, 'git commit')) process.exit(0);
// message not given on the command line (editor, -F, -C, --no-edit): commitlint will judge it
if (!/\s(-[a-zA-Z]*m|--message)\b/.test(command)) process.exit(0);

const ticket = parseBranch(currentBranch(payload.cwd || process.env.CLAUDE_PROJECT_DIR));
if (!ticket) process.exit(0);

const refs = [...command.matchAll(/Refs:\s*#(\d+)/g)].map((m) => Number(m[1]));
if (!refs.length) {
  deny(
    `Commit message needs a ticket footer. Branch ${ticket.prefix}/${ticket.number}/... means the message must end with:\n\nRefs: #${ticket.number}\n\n(after the body, before the Co-Authored-By trailer).`,
  );
}
if (!refs.includes(ticket.number)) {
  deny(
    `Commit footer says Refs: #${refs[0]} but the branch belongs to #${ticket.number}. Use \`Refs: #${ticket.number}\`.`,
  );
}
