#!/usr/bin/env node
// Turns a fresh copy of this template into a configured project. Dry-run by default: it prints every
// step and changes nothing until you pass --apply.
//
//   pnpm bootstrap --owner acme --repo shop [options]            (plan only)
//   pnpm bootstrap --owner acme --repo shop --apply              (do it)
//
// Options
//   --owner <login>              user or organisation that owns the repo and the Project (required)
//   --repo <name>                repository name (required)
//   --project-title <title>      Project board title (default: the repo name)
//   --copy-from <owner>/<number> copy this Project (statuses, views AND workflows come along) instead of
//                                creating an empty one. Recommended: keep one clean Project as the source.
//   --project-number <n>         use an existing Project instead of creating one
//   --secondary-language <code:Name>  e.g. hu:Hungarian. Issue titles, summaries and repros are then
//                                written twice (`EN title / HU title`). Omit for English only.
//   --type-mode <issue-type|label>  how the ticket type is stored (default: detected, see below)
//   --scope <name>               npm scope replacing `@org` (default: the repo name)
//   --with-web                   also generate a Next.js app (apps/web, SCSS, Vitest) and a React UI lib with Storybook
//                                (packages/ui). Verified: lint, test, build, build-storybook and typecheck all pass.
//   --commit                     commit the configuration (`chore(workspace): configure project`) and push it to main and
//                                staging BEFORE the rulesets go on (main is protected afterwards, so this is the last direct push)
//   --skip-github                only rewrite local files
//   --apply                      execute (otherwise: print the plan)
//
// GitHub steps need `gh auth login` and the `project` scope (`gh auth refresh -s project`).
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: o } = parseArgs({
  options: {
    owner: { type: 'string' },
    repo: { type: 'string' },
    'project-title': { type: 'string' },
    'copy-from': { type: 'string' },
    'project-number': { type: 'string' },
    'secondary-language': { type: 'string' },
    'type-mode': { type: 'string' },
    scope: { type: 'string' },
    'with-web': { type: 'boolean', default: false },
    commit: { type: 'boolean', default: false },
    'skip-github': { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
  },
});
// config.json must match Prettier or CI's format check fails on the first PR
const writeConfig = (path, data) => {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  try {
    execFileSync('pnpm', ['exec', 'prettier', '--write', path], { stdio: 'ignore' });
  } catch {
    console.log(
      `   (run \`pnpm format\` once dependencies are installed: ${path} is not Prettier-formatted yet)`,
    );
  }
};
const die = (m) => {
  console.error(`bootstrap: ${m}`);
  process.exit(1);
};
if (!o.owner || !o.repo) die('--owner and --repo are required (see the header of this file)');
const apply = o.apply;
const slug = `${o.owner}/${o.repo}`;
const title = o['project-title'] || o.repo;
const scope = o.scope || o.repo;
const STATUSES = [
  ['Todo', 'GRAY', 'Not started'],
  ['In Progress', 'YELLOW', 'Being worked on'],
  ['In Review', 'ORANGE', 'Pull request open'],
  ['On Stage', 'BLUE', 'Merged into staging'],
  ['On Prod', 'GREEN', 'Merged into main, waiting for the production deploy'],
  ['Done', 'PURPLE', 'Shipped (the production deploy closes the issue)'],
];
let secondary = null;
if (o['secondary-language']) {
  const [code, ...name] = o['secondary-language'].split(':');
  if (!/^[a-z]{2}$/i.test(code) || !name.length)
    die('--secondary-language must look like hu:Hungarian');
  secondary = { code: code.toLowerCase(), name: name.join(':') };
}

const step = (n, text) => console.log(`\n${n}. ${text}`);
const act = (text, fn) => {
  console.log(`   ${apply ? '' : '[plan] '}${text}`);
  if (apply) return fn();
};
const gh = (args, { input, soft } = {}) => {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    if (soft) return null;
    throw new Error(
      `gh ${args.slice(0, 3).join(' ')} failed: ${String(e.stderr || e.message).trim()}`,
    );
  }
};
const gql = (query, vars = {}) => {
  const a = ['api', 'graphql', '-f', `query=${query}`];
  for (const [k, v] of Object.entries(vars))
    a.push(typeof v === 'number' ? '-F' : '-f', `${k}=${v}`);
  return JSON.parse(gh(a)).data;
};

// ---- owner facts (read-only, always run when gh works) ----------------------------------------
let ownerType = 'user';
let typeMode = o['type-mode'];
if (!o['skip-github']) {
  const t = gh(['api', `users/${o.owner}`, '--jq', '.type'], { soft: true });
  if (!t) die(`cannot read ${o.owner} (is gh authenticated? \`gh auth login\`)`);
  ownerType = t === 'Organization' ? 'org' : 'user';
  if (!typeMode) {
    const probe = ownerType === 'org' ? `orgs/${o.owner}/issue-types` : 'user/issue-types';
    const types = gh(['api', probe, '--jq', '[.[].name]|join(",")'], { soft: true });
    typeMode = types?.includes('Bug') ? 'issue-type' : 'label';
    if (types === null)
      console.log(
        'note: could not read the issue types (a personal account needs `gh auth refresh -s read:user`); assuming labels. Force it with --type-mode issue-type.',
      );
  }
}
typeMode ||= 'label';
console.log(
  `${slug}: owner is ${ownerType === 'org' ? 'an organisation' : 'a personal account'}, ticket type via ${typeMode === 'issue-type' ? 'native issue types' : 'labels (`type: Bug` ...)'}${secondary ? `, secondary language ${secondary.name}` : ''}`,
);
console.log(apply ? 'Applying.' : 'Dry run: nothing is changed. Add --apply to execute.');

// ---- 1. local files -----------------------------------------------------------------------------
step(1, 'Local files');
const configPath = '.github/project.config.json';
const config = JSON.parse(readFileSync(configPath, 'utf8'));
Object.assign(config, {
  owner: o.owner,
  ownerType,
  repo: slug,
  project: { number: Number(o['project-number'] || config.project.number), title },
  typeMode,
  secondaryLanguage: secondary,
});
act(`write ${configPath} (owner, repo, Project title, type mode, language)`, () =>
  writeConfig(configPath, config),
);
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    if (['node_modules', '.git', '.nx', 'dist'].includes(f)) return [];
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const files = walk('.').filter(
  (f) => /\.(json|ts|mts|mjs|md|yml)$/.test(f) && !f.endsWith('pnpm-lock.yaml'),
);
const hits = files.filter((f) => readFileSync(f, 'utf8').includes('@org/'));
act(`rename the npm scope @org -> @${scope} in ${hits.length} file(s)`, () => {
  for (const f of hits) writeFileSync(f, readFileSync(f, 'utf8').replaceAll('@org/', `@${scope}/`));
});
if (o['with-web']) {
  act(
    'add @nx/next, @nx/react, @nx/storybook; generate apps/web (Next, SCSS) and packages/ui (React lib + Storybook)',
    () => {
      const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
      run('pnpm', ['nx', 'add', '@nx/next', '@nx/react', '@nx/storybook']);
      run('pnpm', [
        'nx',
        'g',
        '@nx/next:app',
        'apps/web',
        '--name=web',
        '--style=scss',
        '--linter=eslint',
        '--unitTestRunner=vitest',
        '--e2eTestRunner=none',
        '--appDir',
        '--src',
        '--no-interactive',
      ]);
      run('pnpm', [
        'nx',
        'g',
        '@nx/react:library',
        'packages/ui',
        '--name=ui',
        '--bundler=none',
        '--linter=eslint',
        '--unitTestRunner=vitest',
        '--style=scss',
        '--no-interactive',
      ]);
      run('pnpm', [
        'nx',
        'g',
        '@nx/react:storybook-configuration',
        'ui',
        '--interactionTests=false',
        '--no-interactive',
      ]);
      run('pnpm', ['install']);
      // pnpm 11 fails CI installs on unapproved build scripts (esbuild, sharp, ...)
      try {
        run('pnpm', ['approve-builds', '--all']);
      } catch {
        console.log('   pnpm approve-builds --all found nothing to approve');
      }
      run('pnpm', ['format']);
    },
  );
}
act('set the code owner in .github/CODEOWNERS', () => {
  const f = '.github/CODEOWNERS';
  writeFileSync(f, readFileSync(f, 'utf8').replaceAll('@OWNER', `@${o.owner}`));
});
if (o['skip-github']) process.exit(0);

// ---- 2. repository ------------------------------------------------------------------------------
step(2, 'Repository settings, branches, labels, milestone');
const repoExists = gh(['repo', 'view', slug, '--json', 'name'], { soft: true });
if (!repoExists) {
  console.log(
    `   ${slug} does not exist yet: create it from the template first (gh repo create ${slug} --template <template> --private --clone), then run this again.`,
  );
} else {
  act(
    'merge methods: squash + merge commit on, rebase off; "delete branch on merge" OFF (it would delete staging)',
    () =>
      gh([
        'repo',
        'edit',
        slug,
        '--enable-squash-merge',
        '--enable-merge-commit',
        '--enable-rebase-merge=false',
        '--delete-branch-on-merge=false',
      ]),
  );
  const hasStaging = gh(['api', `repos/${slug}/branches/staging`, '--jq', '.name'], { soft: true });
  if (!hasStaging) {
    act('create the staging branch from main', () => {
      const sha = gh(['api', `repos/${slug}/git/ref/heads/main`, '--jq', '.object.sha']);
      gh([
        'api',
        '-X',
        'POST',
        `repos/${slug}/git/refs`,
        '-f',
        'ref=refs/heads/staging',
        '-f',
        `sha=${sha}`,
      ]);
    });
  }
  const labels = [
    ['keep-open', 'C5DEF5', 'Never closed automatically by a production deploy'],
    ['hold', 'B60205', 'Stops a release PR from being merged'],
    ['triaged', '0E8A16', 'Looked at; see the triage comment'],
    ['fix-ready', '1D76DB', 'Triaged, the fix is understood'],
    ['needs-decision', 'FBCA04', 'Triaged, waiting for a decision'],
    ['needs-info', 'D876E3', 'Triaged, waiting for details'],
    ...(typeMode === 'label'
      ? config.issueTypes.map((t) => [`type: ${t}`, 'EDEDED', `Ticket type ${t}`])
      : []),
  ];
  act(`labels: ${labels.map((l) => l[0]).join(', ')}`, () => {
    for (const [name, color, description] of labels)
      gh([
        'label',
        'create',
        name,
        '--repo',
        slug,
        '--color',
        color,
        '--description',
        description,
        '--force',
      ]);
  });
  const d = new Date();
  const month = d.toLocaleString('en', { month: 'long' });
  const milestone = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')} (${month})`;
  act(`milestone "${milestone}" (the monthly sprint; /rollover moves unfinished work on)`, () => {
    const due = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)).toISOString();
    gh(['api', `repos/${slug}/milestones`, '-f', `title=${milestone}`, '-f', `due_on=${due}`], {
      soft: true,
    });
  });
  if (typeMode === 'issue-type' && ownerType === 'org')
    console.log(
      '   issue types Task / Bug / Feature exist by default in an organisation; add or rename them in the org settings if needed.',
    );
}

// ---- 3. Project ---------------------------------------------------------------------------------
step(3, 'Project board');
const ownerNode = () =>
  ownerType === 'org'
    ? gql('query($l:String!){organization(login:$l){id}}', { l: o.owner }).organization.id
    : gql('query($l:String!){user(login:$l){id}}', { l: o.owner }).user.id;
const projectQuery = `id number title fields(first:40){nodes{... on ProjectV2SingleSelectField{id name options{id name}}}} workflows(first:30){nodes{id name enabled}}`;
let project = null;
if (o['project-number']) {
  console.log(`   using existing Project #${o['project-number']}`);
  const q = ownerType === 'org' ? 'organization' : 'user';

  project = gql(
    `query($l:String!,$n:Int!){${q}(login:$l){projectV2(number:$n){${projectQuery}}}}`,
    { l: o.owner, n: Number(o['project-number']) },
  )[q]?.projectV2;
} else if (o['copy-from']) {
  const [srcOwner, srcNumber] = o['copy-from'].split('/');
  act(
    `copy Project ${o['copy-from']} as "${title}" (statuses, views and workflows are copied; items are not)`,
    () => {
      const src =
        gql('query($l:String!,$n:Int!){organization(login:$l){projectV2(number:$n){id}}}', {
          l: srcOwner,
          n: Number(srcNumber),
        }).organization?.projectV2 ??
        gql('query($l:String!,$n:Int!){user(login:$l){projectV2(number:$n){id}}}', {
          l: srcOwner,
          n: Number(srcNumber),
        }).user?.projectV2;
      const copied = gql(
        `mutation($o:ID!,$p:ID!,$t:String!){copyProjectV2(input:{ownerId:$o,projectId:$p,title:$t,includeDraftIssues:false}){projectV2{${projectQuery}}}}`,
        { o: ownerNode(), p: src.id, t: title },
      );
      project = copied.copyProjectV2.projectV2;
    },
  );
} else {
  act(`create an empty Project "${title}"`, () => {
    project = gql(
      `mutation($o:ID!,$t:String!){createProjectV2(input:{ownerId:$o,title:$t}){projectV2{${projectQuery}}}}`,
      { o: ownerNode(), t: title },
    ).createProjectV2.projectV2;
  });
}
if (project) {
  config.project = { number: project.number, title: project.title };
  writeConfig(configPath, config);
  console.log(`   Project #${project.number} "${project.title}" -> written to ${configPath}`);
  const status = project.fields.nodes.find((f) => f?.name === 'Status');
  const have = status?.options.map((x) => x.name).join('|');
  if (have !== STATUSES.map((s) => s[0]).join('|')) {
    act(`Status options -> ${STATUSES.map((s) => s[0]).join(', ')}`, () => {
      // keep the ids of options that already exist: the built-in workflows (Item closed -> Done ...) point at them
      const opts = STATUSES.map(([name, color, description]) => {
        const id = status.options.find((x) => x.name === name)?.id;
        return `{${id ? `id:${JSON.stringify(id)},` : ''}name:${JSON.stringify(name)},color:${color},description:${JSON.stringify(description)}}`;
      }).join(',');
      gql(
        `mutation($f:ID!){updateProjectV2Field(input:{fieldId:$f,singleSelectOptions:[${opts}]}){projectV2Field{... on ProjectV2SingleSelectField{id}}}}`,
        { f: status.id },
      );
    });
  } else console.log('   Status options already match');
  // GitHub switches these two on in every new project; both would fight the On Stage / On Prod flow.
  for (const w of project.workflows.nodes.filter(
    (w) => ['Pull request merged', 'Pull request linked to issue'].includes(w.name) && w.enabled,
  )) {
    act(
      `delete the built-in workflow "${w.name}" (it would set Done when a PR merges into staging; the API cannot just disable it)`,
      () =>
        gql('mutation($w:ID!){deleteProjectV2Workflow(input:{workflowId:$w}){deletedWorkflowId}}', {
          w: w.id,
        }),
    );
  }
  if (repoExists) {
    act(`link the Project to ${slug}`, () => {
      const repoId = gql('query($o:String!,$n:String!){repository(owner:$o,name:$n){id}}', {
        o: o.owner,
        n: o.repo,
      }).repository.id;
      gql(
        'mutation($p:ID!,$r:ID!){linkProjectV2ToRepository(input:{projectId:$p,repositoryId:$r}){repository{id}}}',
        { p: project.id, r: repoId },
      );
    });
  }
}

if (o.commit && repoExists) {
  step('3b', 'Commit and push the configuration (before the rulesets lock main)');
  act(
    'git add -A; commit "chore(workspace): configure project"; push to main, then fast-forward staging',
    () => {
      const git = (...a) =>
        execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      git('add', '-A');
      if (git('status', '--porcelain')) git('commit', '-m', 'chore(workspace): configure project');
      git('push', 'origin', 'HEAD:main');
      git('push', 'origin', 'HEAD:staging');
    },
  );
}

// ---- 4. rulesets --------------------------------------------------------------------------------
step(4, 'Branch protection (rulesets)');
if (repoExists) {
  act(
    'create rulesets main + staging from .github/rulesets/*.json (private repos need GitHub Pro/Team; skipped with a note otherwise)',
    () => {
      for (const f of ['main', 'staging']) {
        const out = gh(
          ['api', '-X', 'POST', `repos/${slug}/rulesets`, '--input', `.github/rulesets/${f}.json`],
          { soft: true },
        );
        console.log(
          out
            ? `   ruleset ${f} created`
            : `   ruleset ${f} NOT created (already exists, or the plan does not allow it)`,
        );
      }
    },
  );
}

// ---- 5. what an API cannot do -------------------------------------------------------------------
step(5, 'Manual steps (printed, not automatable)');
console.log(`   - Secrets: ${ownerType === 'org' ? 'GitHub App (variable BOT_APP_ID, secret BOT_APP_PRIVATE_KEY, permission "Projects: read and write")' : 'secret PROJECT_TOKEN = classic PAT with scopes project + repo (an App cannot reach user-owned Projects)'}.
     gh secret set ${ownerType === 'org' ? 'BOT_APP_PRIVATE_KEY' : 'PROJECT_TOKEN'} -R ${slug}
   - Project workflows (Project > ... > Workflows) cannot be created or edited through the API:
     ${o['copy-from'] ? 'they came with the copy; only "Auto-add to project" (bound to a repository) is missing: add it, repo ' + slug + ', filter `is:issue is:open`.' : 'enable them by hand, see docs/project-workflows.md (or use --copy-from next time).'}
   - Vercel: connect the repo; production branch main, staging stays a preview. close-shipped.yml reacts to the production deployment.
   - Project table: show the "Type" column if you use native issue types (Project > field visibility).`);
