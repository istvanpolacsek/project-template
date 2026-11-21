import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBranch, parseTaskSetup, validateTaskSetup } from './lib/ticket.mjs';

const plan = `## Task setup
- Issue: create
- Type: Feature
- Title: Add login
- Branch: feat/new/add-login
- Milestone: 2026.11 (November)
- Project: REPO
- Summary:
  - one
  - two
  - three
`;

test('parseBranch', () => {
  assert.deepEqual(parseBranch('fix/12/some-slug'), {
    prefix: 'fix',
    number: 12,
    slug: 'some-slug',
  });
  assert.equal(parseBranch('main'), null);
});

test('a complete single-language task setup validates', () => {
  const problems = validateTaskSetup(parseTaskSetup(plan));
  // a secondary language may be configured in project.config.json; only then is more required
  assert.ok(
    problems.every((p) => /Summary [A-Z]{2}|Repro [A-Z]{2}|Title/.test(p)),
    problems.join('; '),
  );
});

test('a missing block is reported', () => {
  assert.deepEqual(validateTaskSetup(parseTaskSetup('# just a plan')), [
    'there is no "## Task setup" section',
  ]);
});

test('branch prefix must match the type', () => {
  const bad = plan.replace('feat/new/add-login', 'fix/new/add-login');
  assert.ok(validateTaskSetup(parseTaskSetup(bad)).some((p) => /does not match type/.test(p)));
});
