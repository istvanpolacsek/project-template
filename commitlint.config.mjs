import { readdirSync, existsSync } from 'node:fs';

// Scope = a workspace project folder name, or `workspace` for tooling, CI and config.
const folders = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []);
const projects = ['apps', 'packages', 'libs'].flatMap((dir) =>
  folders(dir)
    .filter((d) => d.isDirectory())
    .map((d) => d.name),
);

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'ci', 'revert'],
    ],
    'scope-empty': [2, 'never'],
    'scope-enum': [2, 'always', [...projects, 'workspace', 'deps', 'release']],
    'subject-case': [0],
    'header-max-length': [2, 'always', 72],
    'subject-full-stop': [2, 'never', '.'],
  },
};
