---
description: Create next month's milestone and move unfinished issues into it (dry-run first)
argument-hint: '[guidance, e.g. "move also In Review" or "except 1204"]'
allowed-tools: Bash(node .claude/scripts/rollover.mjs:*)
---

Run the month rollover with `.claude/scripts/rollover.mjs`: create the next month's milestone (`YYYY.MM (Month)`, due the last day of the month) if it does not exist, and move the open issues of the current milestone into it.

User guidance (may be empty): $ARGUMENTS

Defaults: statuses `Todo` and `In Progress` (from `.claude/sprint.config.json`, `rolloverStatuses`), source = the current month's milestone, target = the next month, old milestone closed when nothing open is left in it. Translate the guidance into flags:

- `--status "A,B,C"`: replaces the default list entirely, so include `Todo,In Progress` when the guidance says "also X" ("move also In Review" -> `--status "Todo,In Progress,In Review"`). Board statuses: `Todo`, `In Progress`, `In Review`, `On Stage`, `On Prod`, `Done`.
- `--only 1204,1207`: move exactly these issues, ignoring status. `--except 1211`: keep these where they are.
- `--from YYYY.MM` / `--to YYYY.MM`: when the guidance names other months.
- `--no-close`: when the guidance says to leave the old milestone open.

Procedure:

1. Always run a dry-run first (no `--apply`) and show the user what would happen: milestone to create, issues to move (number, status, title), issues that stay, and whether the old milestone would close.
2. Only run again with `--apply` after the user confirms in chat, unless the guidance itself already says to apply it ("apply", "go ahead", "do it"). The apply creates a milestone and edits issues on GitHub, so do not skip the confirmation otherwise.
3. After applying, report what was created and moved. Moving an issue to the new milestone also updates the board's Milestone column. Do not change issue Status or reopen anything.

```bash
node .claude/scripts/rollover.mjs --status "Todo,In Progress,In Review"
```
