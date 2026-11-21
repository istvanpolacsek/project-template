# Project template

Nx + pnpm + Vitest + ESLint/Prettier/commitlint/husky, plus the Claude Code hooks, skills and GitHub automation that tie issues, a GitHub Project board and releases together.

## Use it

1. On GitHub: **Use this template** (or `gh repo create <owner>/<name> --template <owner>/<this-repo> --private --clone`).
2. In the new checkout: `pnpm install`, then in Claude Code run `/setup-project` (or `pnpm bootstrap --owner <o> --repo <r>`; it is a dry run until `--apply`).

## What a template cannot carry

A template copies **files only**. Issues, milestones, labels, repo settings, rulesets, secrets, variables and Projects are not copied, so `pnpm bootstrap` does them: settings, `staging` branch, labels, the first milestone, the Project board (Status: Todo, In Progress, In Review, On Stage, On Prod, Done), rulesets, repo-to-Project link. The Project's workflows cannot be created through the API; copying a Project (`--copy-from`) carries them over, see `docs/project-workflows.md`.

## What is inside

| Area          | Files                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| Config        | `.github/project.config.json` (owner, repo, Project, branches, statuses, type mode, language)                        |
| Quality       | `eslint.config.mjs`, `.prettierrc`, `commitlint.config.mjs`, `.husky/`, `lint-staged` in `package.json`              |
| Claude hooks  | `.claude/hooks/` plan-mode task setup, commit footer and PR title gates, board status, auto-format                   |
| Claude skills | `.claude/skills/` `setup-project`, `triage`, `session-title`; `.claude/commands/` `promote`, `rollover`              |
| Workflows     | `ci`, `project-status`, `close-shipped` (after a successful Vercel production deploy), `cleanup-branches`, `release` |
| Repo hygiene  | issue forms, PR template, Dependabot, rulesets for `main` and `staging`                                              |

## Options

`pnpm bootstrap` flags: `--secondary-language hu:Hungarian` (bilingual tickets), `--copy-from <owner>/<n>` (copy a Project with its workflows), `--with-web` (Next.js app + React UI lib with Storybook), `--type-mode`, `--scope`. Run it without `--apply` first.

## Tokens

Board automation needs a token that can write the Project: a GitHub App in an organisation (`BOT_APP_ID` variable + `BOT_APP_PRIVATE_KEY` secret), or on a personal account a classic PAT in the `PROJECT_TOKEN` secret (an App cannot reach user-owned Projects).
