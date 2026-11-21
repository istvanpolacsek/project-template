---
description: Where things stand - board by status, open PRs, what is waiting to be released
argument-hint: '[--all]'
allowed-tools: Bash(node .claude/scripts/status.mjs:*)
---

Run `node .claude/scripts/status.mjs $ARGUMENTS` (read-only) and summarise it for the user:

- The board by status, newest work first; call out issues in `In Review` whose PR checks are failing and `On Prod` issues the production deploy has not closed yet.
- Open PRs: failing or pending checks, drafts, PRs that target the wrong base.
- How many commits `staging` is ahead of `main`; if it is more than zero, suggest `/promote`. If `main` is ahead of `staging`, say so (a hotfix that never came back).

Report what the script printed; do not fix, move or close anything.
