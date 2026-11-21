---
description: Release staging to main - propose the version, commit it to staging, then open the release PR (asks before every write)
argument-hint: '[major|minor|patch] [guidance, e.g. "skip the deps PR in the text" or "only refresh the open PR"]'
allowed-tools: Bash(node .claude/scripts/promote.mjs:*), Bash(node .claude/scripts/release-bump.mjs:*), Bash(gh pr create:*), Bash(gh pr edit:*)
---

Promote the staging branch to production: find what is merged into staging but not yet in production, agree a version, commit that version to staging, and open the `[STG -> PROD]` release pull request with a description a reviewer can trust.

Arguments (may be empty): $ARGUMENTS. An explicit `major`, `minor` or `patch` overrides the inferred bump.

**Nothing that writes (a commit, a push, a PR, a PR edit) happens before the user has said yes to it in chat.** Reading is free. Ask once per write, showing exactly what it will do. A "go ahead" in the arguments counts as that yes only for the step it names.

1. Gather the facts (read-only):

   ```bash
   node .claude/scripts/promote.mjs --json
   ```

   It reports the PRs on staging that production lacks (with their issues), direct commits without a PR, risky paths (`hosting`, `dependencies`, `env-file`, `env-vars-referenced`, `workflows`), the check results of the merged PRs, an already open promotion PR and the proposed `version` (`current`, `bump`, `next`, `alreadyOnStaging`).

2. Stop and say so when there is nothing to promote or a check is failing. Ask before going on if checks are pending or a PR reported no checks. Never hide a failure.

3. Draft the release text. Write the prose from the facts, not a copy of the commit list:
   - A one-line intro (what the release is, which PRs and issues).
   - `## What ships`: one bullet per PR or grouped by area, with issue and PR numbers (`#12 hero: ...`). Read PR bodies or diffs when a title is vague. Tooling and CI changes go in one closing bullet.
   - `## Heads-up`, only when the script found something: hosting config, env variables (name the variable and where it must be set), dependency changes. Leave it out otherwise.
   - `## Check after deploy`: concrete manual checks derived from the changes.
   - Title: `[STG -> PROD] v<version> <short summary>`, one line, no trailing period.
   - Add a `Refs #N` line per shipped issue.
   - End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

4. Ask for confirmation of the plan, showing **the version (current -> next and why), the title and the full body**. Offer to change the bump. Wait for a clear yes. This one yes covers steps 5 and 6 only if the user says so; otherwise ask again before each write.

5. Commit the version to staging (a commit plus a push to the staging branch). Skip when `alreadyOnStaging` is true:

   ```bash
   node .claude/scripts/release-bump.mjs <version> --dry-run   # show it
   node .claude/scripts/release-bump.mjs <version>             # after the yes
   ```

   It refuses a dirty tree, a branch other than staging, a local staging that differs from origin, or an existing tag. If the staging ruleset blocks the push, say so; do not work around it.

6. Open or refresh the PR (after the yes):
   - No open promotion PR: `gh pr create --base <production> --head <staging> --title "<title>" --body "<body>"`. The `pr-create-gate` hook checks the title and the branches.
   - One is already open: offer `gh pr edit <number> --title "<title>" --body "<body>"` instead of opening another.

7. Report the PR URL and remind the user to merge it with a **merge commit** (never squash, never delete the staging branch). After the merge, `release.yml` tags the version and `project-status.yml` moves the issues to `On Prod`; the Vercel production deploy then triggers `close-shipped.yml`, which closes them.

Do not touch issue data or the board: the workflows do that.
