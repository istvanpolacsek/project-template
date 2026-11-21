// Pure helpers for close-shipped.mjs (kept apart so Vitest can import them).

import { KEEP_OPEN_LABEL as CONFIGURED } from './config.mjs';
export const KEEP_OPEN_LABEL = CONFIGURED || 'keep-open';

// Issue numbers named by `[#12 -> STG]` titles and `Refs: #12, #13` footers.
export function issueRefs(text) {
  const refs = new Set();
  for (const [, id] of String(text ?? '').matchAll(/\[#(\d+)\b/g)) refs.add(Number(id));
  for (const [, line] of String(text ?? '').matchAll(/^Refs?:\s*(.+)$/gim)) {
    for (const [, id] of line.matchAll(/#(\d+)/g)) refs.add(Number(id));
  }
  return refs;
}

// Pull request numbers in a commit subject: squash `... (#72)` and `Merge pull request #81 from ...`.
export function pullNumbers(message) {
  const subject = String(message ?? '').split('\n')[0];
  const numbers = new Set();
  for (const [, id] of subject.matchAll(/\(#(\d+)\)\s*$/g)) numbers.add(Number(id));
  for (const [, id] of subject.matchAll(/^Merge pull request #(\d+)\b/g)) numbers.add(Number(id));
  return numbers;
}

// Why an issue is left alone, or null when it may be closed. Only issues the board already shows
// as `On Prod` are closed, and the `keep-open` label always wins (umbrella and owner-side tickets).
export function skipReason({ state, isPullRequest, labels, status }) {
  if (isPullRequest) return 'is a pull request';
  if (state !== 'open') return 'already closed';
  if (labels.includes(KEEP_OPEN_LABEL)) return `has the ${KEEP_OPEN_LABEL} label`;
  if (status !== 'On Prod') return `board status is ${status ?? 'unset'}, not On Prod`;
  return null;
}
