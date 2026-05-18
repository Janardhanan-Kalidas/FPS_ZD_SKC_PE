# Theme Versioning

This theme now has a small repo-local semantic versioning script that updates `manifest.json` from git history.

## What it does

- Reads the current version from `manifest.json`
- Uses git tags with the prefix `theme-v` as release anchors
- Infers the next bump from commit messages since the last theme tag
- Updates `manifest.json`
- Can optionally create a matching annotated git tag

## Release rules

- `major`: any commit subject with `!:` or any commit body containing `BREAKING CHANGE:`
- `minor`: any commit starting with `feat:`
- `patch`: everything else when commits exist

If the current theme version has four numeric parts, such as `2.2.10.1`, the script treats `2.2.10` as the semantic-version base and bumps from there.

## Commands

Dry run:

```bash
npm run version:theme:dry
```

Auto bump from commit history:

```bash
npm run version:theme
```

Force a specific bump:

```bash
npm run version:theme -- --release-as patch
npm run version:theme -- --release-as minor
npm run version:theme -- --release-as major
```

Update the manifest and create a git tag:

```bash
npm run version:theme -- --tag
```

## Recommended commit format

Use conventional commits so the script can infer the right release type:

```text
feat: add article feedback modal
fix: correct locale-safe search links
feat!: replace old request form flow
```

For breaking changes with more context:

```text
feat: redesign article page

BREAKING CHANGE: removes the legacy sidebar markup used by custom CSS.
```

## CI usage

You can call the same script from GitHub Actions, GitLab CI, or any other runner.

## GitLab pipeline

This repo now includes a GitLab pipeline in `.gitlab-ci.yml`.

- Any `git push` to GitLab triggers the pipeline, including pushes done from VS Code
- Merge requests also trigger the validation job
- The validation job runs `npm run version:theme:dry`
- A separate manual release job exists for the default branch

Important:

- VS Code itself does not trigger CI directly
- The trigger happens when VS Code performs a normal `git push` to GitLab
- The included release job does not auto-commit or auto-push the bumped `manifest.json`
- That is intentional, because CI-based push-back usually needs a project access token or deploy token with write permissions

Example release step:

```bash
npm ci
npm run version:theme -- --tag
git add manifest.json
git commit -m "chore: bump theme version"
git push --follow-tags
```

If you later want full automatic release commits from GitLab CI, the next step is to add a GitLab project access token and extend the release job to commit the updated `manifest.json` back to the repository.

If you want fully automatic `minor` and `major` releases, your team needs to keep commit messages in conventional-commit format.

## Local preview

For local theme preview from VS Code, see `LOCAL_PREVIEW.md`