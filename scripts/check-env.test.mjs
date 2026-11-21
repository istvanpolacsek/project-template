import assert from 'node:assert/strict';
import { test } from 'node:test';
import { envNames, listed } from './check-env.mjs';

test('envNames finds process.env and import.meta.env reads', () => {
  assert.deepEqual(
    envNames('const a = process.env.API_KEY; const b = import.meta.env.VITE_X; process.env["Z"]'),
    ['API_KEY', 'VITE_X'],
  );
});
test('listed reads documented and commented variables', () => {
  assert.deepEqual([...listed('# note\nA=1\n# B=2\n  C=\n')].sort(), ['A', 'B', 'C']);
});
