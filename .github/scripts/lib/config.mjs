// The one place that knows which repo, owner and Project board this checkout belongs to.
// Written by `pnpm bootstrap` (scripts/bootstrap.mjs) into .github/project.config.json.
// Shared by the Claude hooks, the /promote and /rollover scripts and the GitHub workflows' scripts.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'project.config.json');

export const config = JSON.parse(readFileSync(file, 'utf8'));

export const OWNER = config.owner;
export const OWNER_IS_ORG = config.ownerType === 'org';
export const FALLBACK_REPO = config.repo;
export const PROJECT_NUMBER = Number(process.env.PROJECT_NUMBER || config.project.number);
export const DEFAULT_PROJECT = config.project.title;
export const PRODUCTION = config.branches.production;
export const STAGING = config.branches.staging;
export const STATUSES = config.statuses;
// `issue-type`: organisation repos have native issue types. `label`: personal repos do not, so the
// type is carried by a `type: <Name>` label (and a Type field on the board).
export const TYPE_MODE = config.typeMode;
export const ISSUE_TYPES = config.issueTypes;
// `null`, or `{ "code": "hu", "name": "Hungarian" }`: issue titles, summaries and repros are then
// written in English and in this language (`EN title / XX title`).
export const SECONDARY = config.secondaryLanguage ?? null;
export const KEEP_OPEN_LABEL = config.keepOpenLabel;
export const configured = !/^(OWNER|REPO)/.test(`${config.owner}${config.repo}`);
