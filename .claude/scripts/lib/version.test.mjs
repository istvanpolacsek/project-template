import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inferBump, nextVersion, setPackageVersion } from './version.mjs';

test('inferBump', () => {
  assert.equal(inferBump(['fix(app): a', 'chore(workspace): b']), 'patch');
  assert.equal(inferBump(['fix(app): a', 'feat(app): b']), 'minor');
  assert.equal(inferBump(['feat(app)!: a']), 'major');
  assert.equal(inferBump(['fix(app): a\n\nBREAKING CHANGE: gone']), 'major');
  assert.equal(inferBump(['chore(release): v1.2.3']), 'patch');
});

test('nextVersion', () => {
  assert.equal(nextVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(nextVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(nextVersion('1.2.3', 'major'), '2.0.0');
  assert.throws(() => nextVersion('x', 'patch'));
});

test('setPackageVersion', () => {
  const raw = '{\n  "name": "a",\n  "version": "0.0.0"\n}\n';
  assert.equal(setPackageVersion(raw, '1.0.0'), '{\n  "name": "a",\n  "version": "1.0.0"\n}\n');
});
