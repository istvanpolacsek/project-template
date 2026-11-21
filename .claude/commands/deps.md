---
description: Audit dependencies, file the ticket, fix what an override or bump can fix, and open the PR (asks first)
argument-hint: '[guidance, e.g. "include dev dependencies" or "only undici"]'
allowed-tools: Bash(node .claude/scripts/audit.mjs:*), Bash(pnpm install:*), Bash(pnpm format:check:*), Bash(pnpm nx:*)
---

Audit the dependencies and, with the user's yes, fix the vulnerable ones that a patched version exists for. Dependabot handles routine updates; this is the hands-on version for security findings, with a ticket, verification and a reviewed PR.

User guidance (may be empty): $ARGUMENTS

1. Make sure the working tree is clean and you are on `staging`, up to date with `origin/staging`. Otherwise stop and say what is in the way.
2. Report (read-only): `node .claude/scripts/audit.mjs --json`. Show findings in three groups: fixable (a patched version exists), needs a new major of a direct dependency, unpatched. Include severity, prod or dev, the dependency that pulls it in (`via`) and the advisory link. Defaults: production `moderate` and up, dev `high` and up. Never hide a critical finding even when it cannot be fixed here. Stop when nothing is fixable.
3. Ask which fixable findings to take (default: all fixable) and wait for the answer. Findings that need a new major are never applied; suggest a separate ticket.
4. After the confirmation, file the ticket exactly like an approved plan: write a plan file in the scratchpad with a `## Task setup` block (`Issue: create`, `Type: Task`, `Branch: chore/new/<slug>`, title, current milestone, project, summary naming the packages), preview it with `node .claude/hooks/task-setup.mjs --plan <file> --dry-run`, then run it without `--dry-run`. It creates the issue, the board entry and the linked branch and switches to it.
5. On that branch: `node .claude/scripts/audit.mjs --apply`. It bumps the vulnerable packages in the lockfile (`--method override` pins them with `overrides` instead) and reinstalls. Read the install output for peer-dependency warnings. First try upgrading the parent package that pulls the vulnerable one in (`pnpm up <pkg>@latest`, the `via` column); use the script only for what that does not fix. Do not edit `pnpm-lock.yaml` by hand and do not migrate across majors.
6. Verify and report failures as they are: `pnpm format:check`, `pnpm nx affected -t lint typecheck test build --base=origin/staging`. Show the audit before and after. If something breaks, find which override caused it and fix or drop it, and say so.
7. Commit `chore(deps): fix vulnerable dependencies` with a `Refs: #<issue>` footer. Then show the user the PR title and body (summary, a "Still open" list, the verification) and wait for a clear yes before `git push` and `gh pr create --base staging --title "[#<issue> -> STG] fix vulnerable dependencies"`.
