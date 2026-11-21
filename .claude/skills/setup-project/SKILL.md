---
name: setup-project
description: Configure a fresh copy of this template (owner, repo, Project board, statuses, labels, rulesets, language). Use when the user says "set up this project", "bootstrap", "configure the template" or invokes /setup-project, and whenever `.github/project.config.json` still contains the placeholders OWNER / REPO.
---

# Set up a project from the template

`pnpm bootstrap` (`scripts/bootstrap.mjs`) does the work and is a **dry run unless `--apply` is passed**. This skill gathers the answers, shows the plan and applies it only after a clear yes. Everything that writes to GitHub (repo settings, labels, milestone, Project, rulesets) or to the working tree goes through that confirmation.

## 1. Check the starting point

- `.github/project.config.json` with `OWNER` / `REPO` means it is not configured yet.
- `gh auth status` must be logged in and have the `project` scope; if not, tell the user to run `gh auth refresh -s project` (you cannot do it for them).
- If the GitHub repo does not exist yet, the steps that need it are skipped; offer `gh repo create <owner>/<repo> --template <template> --private --clone` and wait for the user's yes.

## 2. Ask (one question at a time, with a sensible default)

1. **Owner and repo name** (a user or an organisation).
2. **Secondary language?** Default none (English only). If yes: the code and name, e.g. `hu:Hungarian`. Issue titles become `English title / Hungarian title`, and the plan's Task setup, issue summaries and bug repros are written in both languages.
3. **Project board**: copy an existing one (`--copy-from <owner>/<number>`: statuses, views and workflows come along, this is the recommended path), reuse one (`--project-number`), or create an empty one (default; workflows then need `docs/project-workflows.md`).
4. **Web app?** Default no. If yes, add `--with-web`: a Next.js app (`apps/web`, SCSS) plus a React UI library with Storybook (`packages/ui`).
5. **Ticket type**: native issue types (organisations, and personal accounts where GitHub has enabled them) or `type: X` labels. Leave it on auto-detect unless the user knows better.

## 3. Plan, confirm, apply

```bash
pnpm bootstrap --owner <o> --repo <r> [--secondary-language hu:Hungarian] [--copy-from <o>/<n>] [--with-web] [--commit]     # dry run
```

Show the printed plan and wait for a yes, then run the same command with `--apply`. Afterwards:

- `--commit` commits the configuration and pushes it to `main` and `staging` before the rulesets protect `main`; without it, commit and push the changes yourself BEFORE applying, or they will have to go through a PR. Ask the user first, it pushes;
- run `pnpm install` (the scope rename touched `package.json` files) and `pnpm format`;
- read the "Manual steps" the script prints (project token or GitHub App, Project workflows, Vercel) and walk the user through them; never ask for or paste a token yourself;
- tell the user the changes are uncommitted and offer to commit them (`chore(workspace): configure project`).
