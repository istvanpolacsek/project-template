// Shared helpers for the ticket related Claude Code hooks (plan mode, commit, PR).
// Everything is read-only except where a function says otherwise. Node only, no dependencies.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_PROJECT,
  FALLBACK_REPO,
  ISSUE_TYPES,
  OWNER,
  PROJECT_NUMBER,
  SECONDARY,
  STAGING,
  PRODUCTION,
  TYPE_MODE,
} from '../../../.github/scripts/lib/config.mjs';

export { DEFAULT_PROJECT, FALLBACK_REPO, ISSUE_TYPES, OWNER, SECONDARY, TYPE_MODE };

/** Secondary language tag as used in plan fields, e.g. `HU`; null when the project is single-language. */
export const LANG2 = SECONDARY ? SECONDARY.code.toUpperCase() : null;

// branch prefix <-> GitHub issue type
export const TYPE_BY_PREFIX = { feat: 'Feature', fix: 'Bug', chore: 'Task' };
export const PREFIX_BY_TYPE = { Feature: 'feat', Bug: 'fix', Task: 'chore' };

export const readStdin = () => {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
};

const run = (cmd, args, { cwd, input } = {}) => {
  try {
    return execFileSync(cmd, args, {
      cwd,
      input,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
};

export const git = (args, cwd) => run('git', args, { cwd });
export const gh = (args, cwd) => run('gh', args, { cwd });
export const ghJson = (args, cwd) => {
  const out = gh(args, cwd);
  try {
    return out ? JSON.parse(out) : null;
  } catch {
    return null;
  }
};

export const currentBranch = (cwd) => git(['branch', '--show-current'], cwd) || '';

/** `chore/1236/plan-mode-hooks` -> { prefix: 'chore', number: 1236, slug: 'plan-mode-hooks' } */
export const parseBranch = (branch) => {
  const m = /^(feat|fix|chore)\/(\d+)\/(.+)$/.exec(branch || '');
  return m ? { prefix: m[1], number: Number(m[2]), slug: m[3] } : null;
};

export const envForBase = (base) => ({ [STAGING]: 'STG', [PRODUCTION]: 'PROD' })[base] || null;

export const slugify = (text, max = 40) =>
  String(text || '')
    .split(' / ')[0]
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');

export const repoSlug = (cwd) =>
  ghJson(['repo', 'view', '--json', 'nameWithOwner'], cwd)?.nameWithOwner || FALLBACK_REPO;

/** Open milestone for the current month, titled like `2026.10 (October)`. */
export const currentMilestone = (repo, cwd) => {
  const d = new Date();
  const prefix = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  const list = ghJson(['api', `repos/${repo}/milestones?state=open&per_page=50`], cwd) || [];
  return list.find((m) => m.title.startsWith(prefix)) || null;
};

/** Issue facts needed to judge the task setup; `null` when the issue cannot be read. */
export const getIssue = (repo, number, cwd) => {
  const issue = ghJson(['api', `repos/${repo}/issues/${number}`], cwd);
  if (!issue || issue.message) return null;
  const [owner, name] = repo.split('/');
  const query = `query($o:String!,$n:String!,$i:Int!){repository(owner:$o,name:$n){issue(number:$i){linkedBranches(first:10){nodes{ref{name}}} projectItems(first:5){nodes{project{title}}}}}}`;
  const gql = ghJson(
    [
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-F',
      `i=${number}`,
      '-f',
      `o=${owner}`,
      '-f',
      `n=${name}`,
    ],
    cwd,
  );
  const extra = gql?.data?.repository?.issue;
  return {
    number,
    title: issue.title,
    state: issue.state,
    body: issue.body || '',
    type:
      issue.type?.name ||
      (issue.labels || []).map((l) => /^type: (.+)$/.exec(l.name)?.[1]).find(Boolean) ||
      null,
    assignees: (issue.assignees || []).map((a) => a.login),
    milestone: issue.milestone?.title || null,
    linkedBranches: extra
      ? extra.linkedBranches.nodes.map((n) => n.ref?.name).filter(Boolean)
      : null,
    // null = could not be read (the token usually lacks the `project` scope)
    projects: extra ? extra.projectItems.nodes.map((n) => n.project.title) : null,
  };
};

/**
 * Set the board Status of an issue (adding it to the project first when missing).
 * `onlyFrom` limits the move to the listed current statuses (`null` = no status yet), so a
 * later stage is never moved backwards. Returns a one-line report, never throws.
 */
export const setIssueStatus = (repo, number, status, { project, onlyFrom, dry, cwd } = {}) => {
  const wanted = (project || DEFAULT_PROJECT).toLowerCase();
  const projects = ghJson(['project', 'list', '--owner', OWNER, '--format', 'json'], cwd);
  if (!projects)
    return 'cannot read projects (gh token needs the `project` scope: gh auth refresh -s project)';
  const board =
    projects.projects.find((p) => p.title.toLowerCase() === wanted) ||
    (!project ? projects.projects.find((p) => p.number === PROJECT_NUMBER) : null);
  if (!board) return `not found: project "${project || DEFAULT_PROJECT}"`;
  const n = String(board.number);
  const fields = ghJson(['project', 'field-list', n, '--owner', OWNER, '--format', 'json'], cwd);
  const field = fields?.fields.find((f) => f.name === 'Status');
  const option = field?.options?.find((o) => o.name.toLowerCase() === status.toLowerCase());
  if (!option) return `not found: Status option "${status}"`;
  const items = ghJson(
    ['project', 'item-list', n, '--owner', OWNER, '--limit', '1000', '--format', 'json'],
    cwd,
  );
  let item = items?.items.find(
    (i) => i.content?.number === number && i.content?.repository === repo,
  );
  if (!item) {
    if (dry) return `would add #${number} to "${board.title}" and set ${status}`;
    const added = ghJson(
      [
        'project',
        'item-add',
        n,
        '--owner',
        OWNER,
        '--url',
        `https://github.com/${repo}/issues/${number}`,
        '--format',
        'json',
      ],
      cwd,
    );
    if (!added?.id) return 'cannot add the issue to the project';
    item = { id: added.id, status: null };
  }
  const current = item.status || null;
  if (current === option.name) return `#${number} already ${status}`;
  if (onlyFrom && !onlyFrom.includes(current))
    return `#${number} stays ${current} (not moved to ${status})`;
  if (dry) return `would move #${number} ${current || 'unset'} -> ${status}`;
  const edited = gh(
    [
      'project',
      'item-edit',
      '--id',
      item.id,
      '--project-id',
      board.id,
      '--field-id',
      field.id,
      '--single-select-option-id',
      option.id,
    ],
    cwd,
  );
  return edited === null
    ? 'cannot set the status'
    : `#${number} ${current || 'unset'} -> ${status}`;
};

/** Plan file of the current ExitPlanMode call: from the payload, else the newest recent plan. */
export const planPath = (payload) => {
  const file =
    payload.tool_response?.filePath ||
    payload.tool_input?.planFilePath ||
    payload.tool_input?.plan_file_path;
  if (file && existsSync(file)) return file;
  try {
    const dir = join(homedir(), '.claude', 'plans');
    const newest = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
      .sort((x, y) => y.t - x.t)[0];
    if (newest && Date.now() - newest.t < 6 * 3600 * 1000) return join(dir, newest.f);
  } catch {
    /* no plan available */
  }
  return null;
};

/** Text of the plan about to be submitted: the hook payload first, else the plan file. */
export const readPlan = (payload) => {
  const inline = payload.tool_input?.plan;
  if (typeof inline === 'string' && inline) return inline;
  const file = planPath(payload);
  try {
    return file ? readFileSync(file, 'utf8') : null;
  } catch {
    return null;
  }
};

/**
 * Parse the `## Task setup` block (legacy heading `## Step 0: Task setup` still works) of a plan:
 *   - Issue: #1236 | create        - Type: Feature|Bug|Task     - Branch: chore/1236/slug
 *   - Title: short title (create only) - Milestone: ...         - Project: ...
 *   - Summary: (3-4 nested bullets)    - Repro: (Bug)
 *   With a secondary language (project.config.json) also `Summary XX:` and `Repro XX:`, and the title is `EN / XX`.
 * Returns null when there is no such block.
 */
export const parseTaskSetup = (plan) => {
  const lines = String(plan || '').split('\n');
  const start = lines.findIndex((l) => /^#{1,4}\s*(step\s*0|task setup)\b/i.test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^#{1,4}\s/.test(l));
  if (end < 0) end = lines.length;
  const block = lines.slice(start + 1, end);
  const field = (name) => {
    const re = new RegExp(`^\\s{0,1}[-*]\\s*\\**${name}\\**\\s*:\\s*(.*)$`, 'i');
    const hit = block.map((l) => re.exec(l)).find(Boolean);
    return hit ? hit[1].replace(/\*\*/g, '').trim() : null;
  };
  // nested bullets under `- Summary:`, up to the next top-level field
  const bullets = (lang = null) => {
    const re = lang
      ? new RegExp(`^\\s{0,1}[-*]\\s*\\**summary\\s+${lang}\\**\\s*:`, 'i')
      : /^\s{0,1}[-*]\s*\**summary(?:\s+en)?\**\s*:/i;
    const at = block.findIndex((l) => re.test(l));
    if (at < 0) return [];
    const rest = block.slice(at + 1);
    const next = rest.findIndex((l) => /^\s{0,1}[-*]\s+\S/.test(l));
    return (next < 0 ? rest : rest.slice(0, next))
      .filter((l) => /^\s{2,}[-*]\s+\S/.test(l))
      .map((l) => l.replace(/^\s*[-*]\s+/, '').trim());
  };
  const summary = bullets();
  const issueRaw = field('Issue') || '';
  const issueMatch = /#(\d+)/.exec(issueRaw);
  return {
    issue: issueMatch ? Number(issueMatch[1]) : null,
    issueRaw,
    create: /\b(create|new)\b/i.test(issueRaw) && !issueMatch,
    type: field('Type'),
    branch: (field('Branch') || '').split(/\s/)[0].replace(/[`()]/g, ''),
    title: field('Title'),
    milestone: field('Milestone'),
    project: field('Project'),
    summary,
    repro: field('Repro'),
    summaryHu: LANG2 ? bullets(LANG2) : [],
    reproHu: LANG2 ? field(`Repro ${LANG2}`) : null,
  };
};

/** Problems that make a Task setup block incomplete; empty list = fine. */
export const validateTaskSetup = (s) => {
  if (!s) return ['there is no "## Task setup" section'];
  const p = [];
  if (!s.issueRaw) p.push('"Issue:" is missing (`#N` or `create`)');
  else if (!s.issue && !s.create) p.push('"Issue:" must be `#N` or `create`');
  if (!ISSUE_TYPES.includes(s.type || ''))
    p.push(`"Type:" must be one of ${ISSUE_TYPES.join(', ')}`);
  if (s.create && !s.title)
    p.push(
      LANG2
        ? '"Title:" is missing (`English title / ' + SECONDARY.name + ' title`)'
        : '"Title:" is missing (a short English title)',
    );
  const bm = /^(feat|fix|chore)\/(\d+|new)\/[a-z0-9-]+$/.exec(s.branch || '');
  if (!bm)
    p.push(
      '"Branch:" must look like `feat|fix|chore/<N>/<short-slug>` (use `new` as N for a new issue)',
    );
  else if (PREFIX_BY_TYPE[s.type] && bm[1] !== PREFIX_BY_TYPE[s.type])
    p.push(
      `branch prefix \`${bm[1]}\` does not match type ${s.type} (expected \`${PREFIX_BY_TYPE[s.type]}\`)`,
    );
  else if (s.issue && bm[2] !== String(s.issue))
    p.push(`branch number ${bm[2]} differs from issue #${s.issue}`);
  if (!s.milestone) p.push('"Milestone:" is missing (current month, e.g. `2026.10 (October)`)');
  if (!s.project) p.push(`"Project:" is missing (\`${DEFAULT_PROJECT}\`)`);
  if (s.summary.length < 3 || s.summary.length > 4)
    p.push(`"Summary:" needs 3-4 nested one-liner bullets (found ${s.summary.length})`);
  if (LANG2 && (s.summaryHu.length < 3 || s.summaryHu.length > 4))
    p.push(`"Summary ${LANG2}:" needs 3-4 nested one-liner bullets (found ${s.summaryHu.length})`);
  if (s.type === 'Bug') {
    if (!s.repro) p.push('bug: "Repro:" is missing');
    if (LANG2 && !s.reproHu) p.push(`bug: "Repro ${LANG2}:" is missing`);
  }
  return p;
};

/** Split a shell command into tokens, honouring simple quotes (good enough for flags). */
export const shellTokens = (command) =>
  [...String(command).matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g)].map(
    (m) => m[1] ?? m[2] ?? m[3],
  );

/** True when `words` (e.g. `gh pr create`) is run as a command, not just mentioned in a string. */
export const invokes = (command, words) =>
  new RegExp(
    `(?:^|[;&|\\n]\\s*)(?:\\w+=\\S*\\s+)*${words.split(' ').join('\\s+(?:-\\S+\\s+)*')}\\b`,
  ).test(String(command));

export const optionValue = (tokens, long, short) => {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === `--${long}` || (short && t === `-${short}`)) return tokens[i + 1] ?? null;
    if (t.startsWith(`--${long}=`)) return t.slice(long.length + 3);
  }
  return null;
};

export const deny = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};

export const context = (hookEventName, additionalContext) => {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext } }),
  );
  process.exit(0);
};
