// Commits the release version to `staging` and pushes it. This WRITES (commit + push to the staging
// branch), so the /promote command runs it only after the user confirmed the version in chat.
//   node .claude/scripts/release-bump.mjs <x.y.z> [--dry-run]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { PRODUCTION, STAGING } from '../../.github/scripts/lib/config.mjs';
import { RELEASE_SUBJECT, setPackageVersion } from './lib/version.mjs';

const version = process.argv[2];
const dry = process.argv.includes('--dry-run');
const die = (message) => {
  console.error(`release-bump: ${message}`);
  process.exit(1);
};
if (!/^\d+\.\d+\.\d+$/.test(version || '')) die('usage: release-bump.mjs <x.y.z> [--dry-run]');

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

if (git('status', '--porcelain', '--untracked-files=no'))
  die('the working tree has uncommitted changes.');
git('fetch', '--tags', '--quiet', 'origin', PRODUCTION, STAGING);
if (git('branch', '--show-current') !== STAGING) die(`check out ${STAGING} first.`);
if (git('rev-parse', 'HEAD') !== git('rev-parse', `origin/${STAGING}`))
  die(`local ${STAGING} differs from origin/${STAGING}; sort that out first.`);
if (git('tag', '-l', `v${version}`)) die(`tag v${version} already exists.`);

const current = JSON.parse(git('show', `origin/${PRODUCTION}:package.json`)).version;
const onStaging = JSON.parse(readFileSync('package.json', 'utf8')).version;
if (onStaging === version) {
  console.log(
    `${STAGING} already carries v${version} (production is at v${current}); nothing to commit.`,
  );
  process.exit(0);
}

const subject = `chore(release): v${version}`;
if (!RELEASE_SUBJECT.test(subject)) die(`internal error: ${subject} is not a release subject.`);
console.log(
  `${dry ? '[dry-run] ' : ''}v${current} -> v${version}: commit "${subject}" and push to ${STAGING}`,
);
if (dry) process.exit(0);

writeFileSync('package.json', setPackageVersion(readFileSync('package.json', 'utf8'), version));
git('add', 'package.json');
git('commit', '-m', subject);
git('push', 'origin', STAGING);
console.log(`Pushed ${subject} to ${STAGING}.`);
