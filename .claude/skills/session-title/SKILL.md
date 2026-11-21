---
name: session-title
description: Rename the current session to `<project> #<issue>: <description>` (`<project>` is `project.title` in `.github/project.config.json`). Use right after every plan approval (ExitPlanMode), once the GitHub issue number is known or was just created by the task setup, and whenever the ticket number first becomes clear in a session.
---

Keep the session list readable: every session that works on a ticket is titled

```
<project> #<issue number>: <description>
```

for example `myapp #13: design refresh docs and tokens`.

## When

- Right after a plan is approved and the `plan-approved-setup.mjs` hook has reported the issue (`created #N` or `done: issue #N`). Do it on **every** approval, so a follow-up plan on the same ticket refreshes the description.
- When the ticket number becomes clear some other way: the user names an issue, or the branch is `type/<N>/slug`.

## Steps

1. **Find the number.** In order: the hook output after approval (`created #N` / `done: issue #N`), the `Issue:` line of the plan's `## Task setup`, the current branch (`git branch --show-current` matches `type/<N>/slug`). If none gives a number (for example the hook failed before creating the issue), do not guess and do not rename; say that the title is still pending.
2. **Write the description.** Take the plan's `Title:`, or the branch slug for a bare branch. Lowercase it except proper nouns, no trailing period, and keep the whole title under about 60 characters. Describe the ticket, not the current step.
3. **Rename.** Load the tool if it is deferred (`ToolSearch` with `select:mcp__ccd_session_mgmt__set_session_title`), then call `mcp__ccd_session_mgmt__set_session_title` with `session_id: "self"` and the title. Skip it when the session already has exactly that title (check with `mcp__ccd_session_mgmt__get_session`, `session_id: "self"`).
4. **Report in one line** what the session is now called. If the app asks the user to approve the change, that is expected when they set the previous title themselves; a declined or unattended rename is not an error, just say so.

A subagent cannot rename the session it runs in; only the main session does this.
