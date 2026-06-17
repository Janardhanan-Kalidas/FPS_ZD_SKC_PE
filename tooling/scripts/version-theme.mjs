#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const VALID_RELEASE_TYPES = new Set(['auto', 'major', 'minor', 'patch']);
const DEFAULT_TAG_PREFIX = 'theme-v';
const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'manifest.json');

function parseArgs(argv) {
  const args = {
    dryRun: false,
    releaseAs: 'auto',
    tag: false,
    tagPrefix: DEFAULT_TAG_PREFIX
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (arg === '--tag') {
      args.tag = true;
      continue;
    }

    if (arg === '--release-as') {
      args.releaseAs = argv[index + 1] || '';
      index += 1;
      continue;
    }

    if (arg === '--tag-prefix') {
      args.tagPrefix = argv[index + 1] || '';
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!VALID_RELEASE_TYPES.has(args.releaseAs)) {
    throw new Error(`--release-as must be one of: ${Array.from(VALID_RELEASE_TYPES).join(', ')}`);
  }

  if (!args.tagPrefix) {
    throw new Error('--tag-prefix cannot be empty');
  }

  return args;
}

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8'
  }).trim();
}

function readManifest() {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function writeManifest(manifest) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function normalizeBaseVersion(version) {
  const parts = version.split('.');

  if (!parts.every((part) => /^\d+$/.test(part))) {
    throw new Error(`manifest.json version must use numeric dot-separated parts. Received: ${version}`);
  }

  if (parts.length === 3) {
    return { baseVersion: version, warning: null };
  }

  if (parts.length === 4) {
    return {
      baseVersion: `${parts[0]}.${parts[1]}.${parts[2]}`,
      warning: `Current manifest version ${version} is not strict semver. Using ${parts[0]}.${parts[1]}.${parts[2]} as the semantic-version base.`
    };
  }

  throw new Error(`Expected manifest.json version to have 3 or 4 numeric parts. Received: ${version}`);
}

function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function bumpVersion(version, releaseType) {
  const current = parseSemver(version);

  if (releaseType === 'major') {
    return `${current.major + 1}.0.0`;
  }

  if (releaseType === 'minor') {
    return `${current.major}.${current.minor + 1}.0`;
  }

  return `${current.major}.${current.minor}.${current.patch + 1}`;
}

function getLatestThemeTag(tagPrefix) {
  const output = runGit(['tag', '--list', `${tagPrefix}*`, '--sort=-version:refname']);
  const tags = output ? output.split('\n').filter(Boolean) : [];
  return tags[0] || null;
}

function getCommitMessagesSince(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const output = runGit(['log', '--format=%s%n%b%x1e', range]);

  if (!output) {
    return [];
  }

  return output
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject, ...bodyLines] = entry.split('\n');
      return {
        subject: subject.trim(),
        body: bodyLines.join('\n').trim()
      };
    });
}

function inferReleaseType(commits) {
  if (!commits.length) {
    return null;
  }

  const hasMajor = commits.some((commit) => {
    return /BREAKING CHANGE:/i.test(commit.body) || /^[^:\s]+(?:\([^)]*\))?!:/.test(commit.subject);
  });

  if (hasMajor) {
    return 'major';
  }

  const hasMinor = commits.some((commit) => /^feat(?:\([^)]*\))?:\s/i.test(commit.subject));
  if (hasMinor) {
    return 'minor';
  }

  return 'patch';
}

function ensureTagDoesNotExist(tagName) {
  const existing = runGit(['tag', '--list', tagName]);
  if (existing) {
    throw new Error(`Tag already exists: ${tagName}`);
  }
}

function createTag(tagName, version) {
  runGit(['tag', '-a', tagName, '-m', `Release ${version}`]);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readManifest();

  if (!manifest.version) {
    throw new Error('manifest.json does not contain a version field');
  }

  const { baseVersion, warning } = normalizeBaseVersion(manifest.version);
  const latestTag = getLatestThemeTag(args.tagPrefix);
  const commits = getCommitMessagesSince(latestTag);
  const inferredReleaseType = inferReleaseType(commits);
  const releaseType = args.releaseAs === 'auto' ? inferredReleaseType : args.releaseAs;

  if (!releaseType) {
    console.log('No commits found since the last theme tag. Nothing to version.');
    return;
  }

  const nextVersion = bumpVersion(baseVersion, releaseType);
  const nextTag = `${args.tagPrefix}${nextVersion}`;

  if (warning) {
    console.log(`Warning: ${warning}`);
  }

  console.log(`Current manifest version: ${manifest.version}`);
  console.log(`Base semantic version: ${baseVersion}`);
  console.log(`Latest theme tag: ${latestTag || 'none'}`);
  console.log(`Commits considered: ${commits.length}`);
  console.log(`Release type: ${releaseType}`);
  console.log(`Next version: ${nextVersion}`);

  if (args.dryRun) {
    console.log('Dry run enabled. manifest.json was not changed.');
    if (args.tag) {
      console.log(`Dry run enabled. Tag ${nextTag} was not created.`);
    }
    return;
  }

  manifest.version = nextVersion;
  writeManifest(manifest);
  console.log(`Updated manifest.json to ${nextVersion}`);

  if (args.tag) {
    ensureTagDoesNotExist(nextTag);
    createTag(nextTag, nextVersion);
    console.log(`Created tag ${nextTag}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}