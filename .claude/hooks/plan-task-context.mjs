// UserPromptSubmit / PostToolUse(EnterPlanMode) hook: while in plan mode, look up the GitHub
// ticket behind the work and tell Claude what the "Task setup" section of the plan must say.
// Read-only (only `gh` GETs). Never blocks: on any trouble it stays silent.
import {
  context,
  currentBranch,
  currentMilestone,
  DEFAULT_PROJECT,
  LANG2,
  SECONDARY,
  getIssue,
  parseBranch,
  PREFIX_BY_TYPE,
  readStdin,
  repoSlug,
} from './lib/ticket.mjs';

const payload = readStdin();
const event = payload.hook_event_name || 'UserPromptSubmit';
const inPlanMode = payload.permission_mode === 'plan' || payload.tool_name === 'EnterPlanMode';
if (!inPlanMode || process.env.PLAN_GATE === 'off') process.exit(0);

const cwd = payload.cwd || process.env.CLAUDE_PROJECT_DIR;
const repo = repoSlug(cwd);
const branch = currentBranch(cwd);
const onWorkingBranch = parseBranch(branch);
const prompt = String(payload.prompt || '');

const mentioned = [...prompt.matchAll(/(?:issues\/|#)(\d{2,5})\b/g)].map((m) => Number(m[1]));
const wantsNewIssue = /\b(create|new|open|prepare)\b[^.\n]{0,30}\b(issue|ticket)\b/i.test(prompt);
const number = onWorkingBranch?.number ?? mentioned[0] ?? null;
const source = onWorkingBranch
  ? `current branch ${branch}`
  : mentioned.length
    ? 'the prompt'
    : null;

const milestone = currentMilestone(repo, cwd);
const wantedMilestone = milestone?.title || 'current month, `YYYY.MM (Month)`';
const lines = [
  '## Task setup check (plan-mode hook)',
  'The plan MUST start with a `## Task setup` section in exactly this shape, or ExitPlanMode is blocked. Keep the implementation steps in a separate later section (e.g. `## Steps`):',
  '```',
  '## Task setup',
  '- Issue: #N | create',
  '- Type: Feature | Bug | Task        (feat | fix | chore)',
  LANG2
    ? `- Title: English title / ${SECONDARY.name} title      (only when Issue is \`create\`)`
    : '- Title: short English title                  (only when Issue is `create`)',
  '- Branch: <feat|fix|chore>/<N>/<short-slug>  (current | create; `new` as N for a new issue)',
  `- Milestone: ${wantedMilestone}`,
  `- Project: ${DEFAULT_PROJECT}`,
  '- Summary:',
  '  - 3-4 one-liner bullets compressing the plan',
  ...(LANG2
    ? [
        `- Summary ${LANG2}:`,
        `  - the same 3-4 bullets in ${SECONDARY.name}`,
        `- Repro: ... / Repro ${LANG2}: ...   (bugs only, both languages)`,
      ]
    : ['- Repro: ...                      (bugs only)']),
  '```',
  'Task setup is applied automatically when the plan is approved (issue, fields, project status, linked branch); preview with `node .claude/hooks/task-setup.mjs --plan <plan file> --dry-run`.',
  `Current branch: \`${branch || 'unknown'}\`${onWorkingBranch ? ' (already a working branch: keep it, do not create or switch branches)' : ''}.`,
  '',
];

if (number) {
  const issue = getIssue(repo, number, cwd);
  if (!issue) {
    lines.push(
      `Issue #${number} (from ${source}) could not be read with gh; say so in Task setup instead of guessing.`,
    );
  } else {
    const expectedType = onWorkingBranch
      ? { feat: 'Feature', fix: 'Bug', chore: 'Task' }[onWorkingBranch.prefix]
      : null;
    const check = (ok, text) => `- ${ok ? 'OK     ' : 'MISSING'} ${text}`;
    lines.push(
      `Issue #${number} (from ${source}): "${issue.title}" [${issue.state}]`,
      check(
        Boolean(issue.type) && (!expectedType || issue.type === expectedType),
        `type: ${issue.type || 'none'}${expectedType && issue.type !== expectedType ? ` (branch prefix says ${expectedType})` : ''}`,
      ),
      check(issue.assignees.length > 0, `assignee: ${issue.assignees.join(', ') || 'none'}`),
      check(
        Boolean(issue.milestone),
        `milestone: ${issue.milestone || `none, expected ${wantedMilestone}`}`,
      ),
      check(
        issue.projects === null ? false : issue.projects.length > 0,
        issue.projects === null
          ? 'project: unknown (token lacks the `project` scope: `gh auth refresh -s project`)'
          : `project: ${issue.projects.join(', ') || `none, expected ${DEFAULT_PROJECT}`}`,
      ),
      check(
        issue.linkedBranches === null ? false : issue.linkedBranches.length > 0,
        `linked dev branch: ${issue.linkedBranches?.join(', ') || (issue.linkedBranches === null ? 'unknown' : 'none')}`,
      ),
      check(
        issue.body.trim().length > 0,
        `description: ${issue.body.trim() ? 'filled' : 'empty, Task setup summary will fill it'}`,
      ),
      '',
      'Reuse #' +
        number +
        ' in Task setup and list only the MISSING items as things to fix. Never overwrite a human-written description.',
    );
    if (!onWorkingBranch) {
      const prefix = PREFIX_BY_TYPE[issue.type] || 'chore';
      lines.push(
        `Branch to prepare: \`${prefix}/${number}/<short-slug>\` (type ${issue.type || 'unknown, decide it'}).`,
      );
    }
  }
} else if (wantsNewIssue || event === 'PostToolUse') {
  lines.push(
    `No issue is mentioned. Task setup must say \`Issue: create\` (set Type, Title, Milestone, Project, Summary${LANG2 ? ' + ' + LANG2 : ''}) unless the user names one.`,
  );
} else {
  lines.push(
    'No issue found on the branch or in the prompt. If the user did not ask for an issue, still plan `Issue: create` and let them veto it during plan review.',
  );
}

context(event, lines.join('\n'));
