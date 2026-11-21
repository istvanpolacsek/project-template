// Pure helpers for the release version (semver in the root package.json). Node only, no dependencies.
// Release rule: the bump is inferred from the Conventional Commit subjects that are going to ship:
// a breaking change (`type(scope)!:` or a BREAKING CHANGE footer) is major, a `feat` is minor, anything else is patch.

export const RELEASE_SUBJECT = /^chore\(release\): v\d+\.\d+\.\d+$/;

export const inferBump = (messages) => {
  let bump = 'patch';
  for (const message of messages) {
    const subject = String(message).split('\n')[0];
    if (/^release|^chore\(release\)/.test(subject)) continue;
    if (/^\w+(\([^)]*\))?!:/.test(subject) || /^BREAKING[ -]CHANGE:/m.test(String(message)))
      return 'major';
    if (/^feat(\(|:|!)/.test(subject)) bump = 'minor';
  }
  return bump;
};

export const nextVersion = (current, bump) => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(current);
  if (!m) throw new Error(`not a semver version: ${current}`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`unknown bump: ${bump}`);
};

export const setPackageVersion = (raw, version) => {
  if (!/^(\s*)"version":\s*"[^"]*"/m.test(raw)) throw new Error('package.json has no "version"');
  return raw.replace(/^(\s*)"version":\s*"[^"]*"/m, `$1"version": "${version}"`);
};
