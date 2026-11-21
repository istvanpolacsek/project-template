<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

# Project guidelines

## Setup status

If `.github/project.config.json` still contains `OWNER` / `REPO`, this is an unconfigured copy of the template: run the `setup-project` skill (`pnpm bootstrap`) before anything else. That file is the single source for the repo, the Project board, branch names, statuses, ticket-type mode and the optional secondary language; hooks, scripts and workflows all read it.

## Workspace

- Nx workspace, **pnpm**, Node per `.nvmrc`. Projects live in `packages/` (add `apps/` as needed); generate with the `nx-generate` skill, run tasks through `pnpm nx ...`. Tests are Vitest (`@nx/vitest`), lint is ESLint flat config (`eslint.config.mjs`, with `eslint-config-prettier`), formatting is Prettier (authoritative: single quotes, 100 cols, LF).
- Before finishing any change run `pnpm format:check` and `pnpm nx affected -t lint typecheck test build`, and report failures as they are. Never bypass checks (`--no-verify`, blanket `eslint-disable`).
- pnpm 11 fails an install on dependencies with unapproved build scripts (`ERR_PNPM_IGNORED_BUILDS`, usually seen first in CI): approve them in `pnpm-workspace.yaml` under `allowBuilds`, or run `pnpm approve-builds --all`.
- `pnpm test:tools` runs the tests of the hooks and scripts under `.claude/` and `.github/`.

## Branches, commits, PRs

- `main` is production, `staging` is the integration branch. Ticket branches are `feat|fix|chore/<issue>/<short-slug>` (prefix = ticket type Feature | Bug | Task), cut from `origin/staging`.
- Conventional commits via commitlint: type `feat|fix|chore|docs|refactor|test|ci|revert`, **scope required** (a project folder name, or `workspace` for tooling, CI, config, `deps`, `release`), subject <= 72 chars. On a ticket branch every commit ends with `Refs: #<issue>` (a hook checks it), before the attribution trailer.
- PR titles: `[#12 -> STG] description` (base `staging`), `[#12 -> PROD] ...` (base `main`), `[STG -> PROD] ...` for the release PR. Feature PRs squash into `staging`; the release PR merges into `main` with a **merge commit** and `staging` is never deleted. `pr-create-gate` checks the titles. Never create a PR unless the user asks.

## Plan mode and tickets (hooks in `.claude/hooks/`)

- In plan mode the plan must start with a `## Task setup` section (issue, type, branch, milestone, project, 3-4 summary bullets; repro for bugs; plus the secondary language if configured). `plan-exit-gate` blocks `ExitPlanMode` until it is complete (`PLAN_GATE=off` disables the hooks). On approval `task-setup.mjs` creates/updates the issue, its type, milestone, board entry and the linked branch (`gh issue develop`). Preview: `node .claude/hooks/task-setup.mjs --plan <file> --dry-run`.
- Then run the `session-title` skill to rename the session `<project> #<issue>: <description>`.
- Claude never runs `git push` to `main`/`staging` or force-pushes (`push-guard` hook, `PUSH_GUARD=off` disables); the release version is committed by `/promote` through `release-bump.mjs` after your yes.
- Board status: Todo -> In Progress (plan approved) -> In Review (`gh pr create`) -> On Stage / On Prod (`project-status.yml` on merge) -> Done (the production deploy closes the issue). Statuses never move backwards. Details: `docs/project-workflows.md`.

## Skills and commands

- `/promote`: release `staging` -> `main`. Proposes the version, commits `chore(release): vX.Y.Z` to `staging`, then opens the `[STG -> PROD]` PR. **Asks before every write** (commit, push, PR).
- `/status`: read-only overview (board by status, open PRs, what is waiting to be released).
- `/deps`: audit (pnpm), file a ticket, fix, open a PR; asks first.
- `/rollover`: creates next month's milestone and moves unfinished issues into it (dry run first).
- `triage` skill: labels and comments on untriaged bugs, never edits code or closes anything.
- `setup-project` skill: configures a fresh copy of the template.

## Deploys

Vercel is the default host: `main` deploys to production, `staging` is the stable preview. When the production deployment succeeds, `close-shipped.yml` closes the issues that are `On Prod` (not those labelled `keep-open`). Never print or commit secret values.
