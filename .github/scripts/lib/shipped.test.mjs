import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { issueRefs, pullNumbers, skipReason } from './shipped.mjs';

describe('issueRefs', () => {
  it('reads titles and Refs footers', () => {
    const text = '[#73 -> STG] Privacy notice\n\nbody\nRefs: #73, #76\nRefs: #78';
    assert.deepEqual([...issueRefs(text)].sort(), [73, 76, 78]);
  });

  it('ignores bare PR numbers', () => {
    assert.equal(issueRefs('Merge pull request #81 from owner/x (#72)').size, 0);
  });
});

describe('pullNumbers', () => {
  it('reads squash and merge commit subjects', () => {
    assert.deepEqual([...pullNumbers('[#76 -> STG] Real sitemap dates (#79)\n\nRefs: #76')], [79]);
    assert.deepEqual([...pullNumbers('Merge pull request #81 from owner/chore/67/x')], [81]);
  });

  it('ignores PR numbers outside the subject', () => {
    assert.equal(pullNumbers('chore: bump\n\nsee (#5)').size, 0);
  });
});

describe('skipReason', () => {
  const ok = { state: 'open', isPullRequest: false, labels: [], status: 'On Prod' };

  it('allows an open On Prod issue', () => assert.equal(skipReason(ok), null));
  it('honours the keep-open label', () =>
    assert.match(skipReason({ ...ok, labels: ['keep-open'] }), /keep-open/));
  it('requires On Prod', () => {
    assert.match(skipReason({ ...ok, status: 'On Stage' }), /On Stage/);
    assert.match(skipReason({ ...ok, status: null }), /unset/);
  });
  it('skips closed issues and pull requests', () => {
    assert.equal(skipReason({ ...ok, state: 'closed' }), 'already closed');
    assert.equal(skipReason({ ...ok, isPullRequest: true }), 'is a pull request');
  });
});
