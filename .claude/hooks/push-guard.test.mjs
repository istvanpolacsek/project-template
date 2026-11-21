import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pushProblem } from './lib/push-guard.mjs';

const b = { production: 'main', staging: 'staging' };

test('allows ticket branches', () => {
  assert.equal(pushProblem('git push -u origin feat/1/x', 'feat/1/x', b), null);
  assert.equal(pushProblem('git push', 'feat/1/x', b), null);
});
test('blocks protected branches', () => {
  assert.match(pushProblem('git push origin main', 'feat/1/x', b), /main/);
  assert.match(pushProblem('git push origin HEAD:staging', 'feat/1/x', b), /staging/);
  assert.match(pushProblem('git push', 'staging', b), /staging/);
  assert.match(pushProblem('git push origin HEAD', 'main', b), /main/);
});
test('blocks force and delete', () => {
  assert.match(pushProblem('git push --force origin feat/1/x', 'feat/1/x', b), /force/);
  assert.match(pushProblem('git push -f', 'feat/1/x', b), /force/);
  assert.match(pushProblem('git push origin --delete old', 'feat/1/x', b), /force/);
});
