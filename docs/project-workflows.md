# Project workflows

GitHub Projects has built-in workflows (Project > ... > Workflows). **The API can only delete them, not create or
configure them**, so a new Project gets them one of two ways:

1. **Copy a Project that already has them** (recommended): `pnpm bootstrap --copy-from <owner>/<number>`. The copy
   keeps the Status options, the views and every workflow including its enabled/disabled state and its target status.
   Items are not copied. (Verified: a copy of a Project that has them arrives with all of them, including their enabled or disabled state.)
   Only **Auto-add to project** is lost, because it is bound to a repository.
2. **Set them by hand** from the table below. `pnpm bootstrap` already does the part the API allows: it creates the
   six statuses (keeping the ids of the built-in options so the default workflows survive) and deletes the two built-in
   workflows that fight the flow.

## Statuses

| Status        | Meaning                            | Moved by                                                                |
| ------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `Todo`        | issue created                      | workflow _Item added to project_                                        |
| `In Progress` | plan approved / issue reopened     | Claude hook `plan-approved-setup` / workflow _Item reopened_            |
| `In Review`   | `gh pr create` succeeded           | Claude hook `pr-created-status`                                         |
| `On Stage`    | PR merged into `staging`           | Actions `project-status.yml`                                            |
| `On Prod`     | release PR merged into `main`      | Actions `project-status.yml`                                            |
| `Done`        | production deploy closed the issue | Actions `close-shipped.yml` closes it, workflow _Item closed_ sets Done |

Status only ever moves forward.

## Workflows to enable

| Workflow                         | Setting                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| Auto-add to project              | repo of this project, filter `is:issue is:open` (issues, not PRs) |
| Item added to project            | Status -> `Todo`                                                  |
| Item reopened                    | Status -> `In Progress`                                           |
| Item closed                      | Status -> `Done`                                                  |
| Auto-close issue                 | when Status is `Done`, close the issue                            |
| Auto-archive items               | filter `is:closed updated:<@today-2w`                             |
| Auto-add sub-issues to project   | on, if you use sub-issues                                         |
| **Pull request merged**          | **OFF / deleted.** It would set `Done` on a merge into staging    |
| **Pull request linked to issue** | **OFF / deleted.** `Refs #N` does not create a link anyway        |

Keep one clean Project that follows this table (in an organisation, ideally marked as a template) and use it as the `--copy-from` source for every new project.
