// Pure decision for the push guard: given the `git push` command and the current branch, return a
// reason to deny it, or null. Kept apart from the hook so it can be unit tested.
export const pushProblem = (command, branch, { production, staging }) => {
  const words = String(command).trim().split(/\s+/);
  const args = words.slice(words.indexOf('push') + 1);
  const flags = args.filter((a) => a.startsWith('-'));
  const positional = args.filter((a) => !a.startsWith('-'));
  const protectedBranches = [production, staging];

  if (flags.some((f) => /^(--force|-f|--force-with-lease(=.*)?|--mirror|--delete|-d)$/.test(f)))
    return 'force pushes and branch deletions are not allowed from here.';

  // positional = [remote] [refspec...]; a bare `git push` pushes the current branch
  const refspecs = positional.slice(1);
  const targets = refspecs.length
    ? refspecs.map((r) =>
        r
          .replace(/^\+/, '')
          .split(':')
          .pop()
          .replace(/^refs\/heads\//, ''),
      )
    : [branch];
  const resolved = targets.map((t) => (t === 'HEAD' ? branch : t));
  const hit = resolved.find((t) => protectedBranches.includes(t));
  if (hit)
    return `do not push to ${hit} directly. Work on a ticket branch and open a PR; releases go through /promote.`;
  return null;
};
