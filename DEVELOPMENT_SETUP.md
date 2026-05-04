# Development Setup Guide

This guide covers the complete setup for developing and managing the Zendesk theme locally, including ZCLI installation and the semantic versioning workflow.

---

## Table of Contents

1. [Zendesk CLI (ZCLI) Installation](#zendesk-cli-zcli-installation)
2. [Semantic Versioning System](#semantic-versioning-system)
3. [Local Theme Preview](#local-theme-preview)
4. [Version Management Workflow](#version-management-workflow)
5. [Troubleshooting](#troubleshooting)

---

## Zendesk CLI (ZCLI) Installation

### What is ZCLI?

Zendesk CLI (Command Line Interface) is the official tool for managing Zendesk themes locally. It allows you to:
- Preview themes in real-time without publishing
- Upload and manage theme files
- Interact with your Zendesk Help Center from the terminal

### Prerequisites

- **Node.js** (v14 or higher)
- **npm** (comes with Node.js)
- **macOS, Linux, or Windows** with terminal/command prompt access

### Installation Steps

1. **Install ZCLI via npm**:
   ```bash
   npm install -g @zendesk/zcli
   ```

2. **Verify installation**:
   ```bash
   zcli --version
   ```
   You should see output like: `@zendesk/zcli/1.0.0-beta.56`

3. **Authenticate with Zendesk** (one-time setup):
   ```bash
   zcli login -i
   ```
   This opens an interactive flow:
   - Opens a browser window for Zendesk authentication
   - Sign in with your Zendesk account
   - Authorize the CLI tool
   - Token is stored securely on your machine (macOS: Keychain; Linux/Windows: encrypted storage)

4. **Verify authentication**:
   ```bash
   zcli themes:list
   ```
   This should display your available themes without errors.

### Authentication Troubleshooting

- **"Authentication failed"**: Log out and try again
  ```bash
  zcli logout
  zcli login -i
  ```

- **"Multiple Zendesk instances"**: If you work with multiple instances, create separate profiles
  ```bash
  zcli login -i --profile=instance-name
  zcli themes:list --profile=instance-name
  ```

---

## Semantic Versioning System

### What is Semantic Versioning?

Semantic Versioning (SemVer) uses a three-part version number: **MAJOR.MINOR.PATCH**

- **MAJOR** (e.g., `2.0.0`): Breaking changes, incompatible updates
- **MINOR** (e.g., `2.1.0`): New features, backwards-compatible additions
- **PATCH** (e.g., `2.0.1`): Bug fixes, backwards-compatible patches

**Examples:**
- `1.0.0` → `2.0.0` (major bump: complete redesign)
- `1.5.3` → `1.6.0` (minor bump: new feature)
- `1.5.3` → `1.5.4` (patch bump: bug fix)

### How This Project Uses Semantic Versioning

**Current Version**: `2.2.10.1` (from [manifest.json](manifest.json))

Our system automatically determines the version bump based on **commit messages** using the **Conventional Commits** standard.

#### Conventional Commits Format

Write commit messages in this format:

```
type(scope): description

optional body
optional footer
```

**Types that trigger version bumps:**

| Type | Bump Type | Usage |
|------|-----------|-------|
| `fix:` | PATCH | Bug fixes, hotfixes |
| `feat:` | MINOR | New features, additions |
| `BREAKING CHANGE` footer | MAJOR | Incompatible API/style changes |

**Commit Message Examples:**

**PATCH bump (bug fix):**
```bash
git commit -m "fix: correct empty state icon asset reference"
```

**MINOR bump (new feature):**
```bash
git commit -m "feat: add multi-language support for UI strings"
```

**MAJOR bump (breaking change - using footer):**
```bash
git commit -m "feat: redesign search page layout

BREAKING CHANGE: CSS class names changed from .search-* to .search-widget-*
Users must update custom CSS overrides."
```

Or for fixes with breaking changes:
```bash
git commit -m "fix: remove deprecated sidebar styling

BREAKING CHANGE: .sidebar-legacy class removed. Use .sidebar instead."
```

**Complex example with body and breaking change:**
```bash
git commit -m "feat: migrate from jQuery to vanilla JS

Replaces jQuery event binding with native JavaScript event listeners.
Improves performance and reduces bundle size.

BREAKING CHANGE: Custom extensions using jQuery window.Widgets API must be rewritten.
See MIGRATION.md for upgrade guide."
```

### Understanding Versions and Releases

This project follows **Semantic Versioning** with explicit **release tagging**.

**Current Version**: `2.2.10.1` in [manifest.json](manifest.json)
- The `.1` is a manual patch added after initial release
- Official releases use format: `MAJOR.MINOR.PATCH` (e.g., `2.2.10`, `2.3.0`, `3.0.0`)
- When you create a release, a git tag is created (e.g., `theme-v2.2.11`)

**Version Progression Example**:
```
Development branch: 2.2.10 (base version)
  ↓ (make changes)
Release v2.2.11 (tag: theme-v2.2.11)
  ↓ (make more changes)
Release v2.3.0 (tag: theme-v2.3.0)  ← MINOR bump (new feature)
  ↓ (bug fix)
Release v2.3.1 (tag: theme-v2.3.1)  ← PATCH bump (bug fix)
  ↓ (breaking changes)
Release v3.0.0 (tag: theme-v3.0.0)  ← MAJOR bump (breaking change)
```

### The Version Script

The version automation is handled by [scripts/version-theme.mjs](scripts/version-theme.mjs) (200 lines of Node.js).

**What it does:**

1. Reads current version from [manifest.json](manifest.json)
2. Queries git history since the last tag (prefix: `theme-v`)
3. Analyzes commit messages to determine bump type:
   - `fix:` commits → PATCH bump
   - `feat:` commits → MINOR bump
   - `BREAKING CHANGE:` footer → MAJOR bump
   - No commits of these types → no version change
4. Calculates next version based on highest bump type found
5. Updates version in [manifest.json](manifest.json) (if not dry-run)
6. Creates a git tag for the release (if --tag flag used)

**Example workflow:**

```
Current manifest version: 2.2.10
Last release tag: theme-v2.2.10

Commits since last tag:
  - fix: update icon asset URL
  - feat: add newsletter subscription widget
  - fix: correct breadcrumb styling

Version script analyzes:
  - Found: 2 fix: commits, 1 feat: commit
  - Highest bump: MINOR (due to feat:)
  - Decision: Bump MINOR

Next version calculated: 2.3.0
Tag created: theme-v2.3.0
manifest.json updated: "version": "2.3.0"
```

---

## Managing Release Versions

### Is 2.2.10.1 a Release Version?

**No.** The current version `2.2.10.1` in manifest.json is a **development version**, not an official release.

- **Development versions** (like `2.2.10.1`): Used during local development and testing
- **Release versions** (like `2.2.10`, `2.3.0`, `3.0.0`): Official tagged releases in git

### Release vs Development Workflow

**Development (daily work):**
```
You work on fixes/features
  ↓
Commit with conventional format (fix:, feat:, BREAKING CHANGE:)
  ↓
Push to feature branch
  ↓
manifest.json stays at 2.2.10 (development version)
  ↓
Create Pull Request
  ↓
Run npm run version:dry-run to preview next version
```

**Release (after merge to main):**
```
PR merged to main
  ↓
Run: npm run version:release
  ↓
Script calculates next version based on commits
  ↓
manifest.json updated: 2.2.10 → 2.3.0 (OFFICIAL RELEASE)
  ↓
Git tag created: theme-v2.3.0
  ↓
Tag pushed to GitLab
  ↓
Deploy to Zendesk Help Center
```

### How to Know if You're in a Release

Check if your manifest version matches a git tag:

```bash
# List all release tags
git tag -l "theme-v*"

# Output:
# theme-v2.0.0
# theme-v2.1.0
# theme-v2.2.10

# Current manifest version
grep "version" manifest.json | head -1
# "version": "2.2.10"  ← RELEASED (matches theme-v2.2.10 tag)

# vs.

grep "version" manifest.json | head -1
# "version": "2.2.10.1" ← DEVELOPMENT (no matching tag)
```

### Example Release Lifecycle

```
Day 1:
  - manifest.json version: 2.2.10
  - Last release tag: theme-v2.2.10
  - Status: Ready for new changes

You commit: fix: icon reference issue
  - manifest.json STAYS at 2.2.10 (development ongoing)

You commit: feat: add newsletter widget
  - manifest.json STAYS at 2.2.10 (development ongoing)

Day 5: Ready to release
  - Run: npm run version:release
  - manifest.json updated to 2.3.0 (new OFFICIAL release)
  - Git tag created: theme-v2.3.0
  - Status: Released to Zendesk

Day 6: More development
  - You make fixes/features
  - manifest.json STAYS at 2.3.0 (development ongoing)
  - Commits accumulate for next release
  
Day 10: Ready for next release
  - Run: npm run version:release
  - manifest.json updated to 2.3.1 or 2.4.0 (depending on commits)
  - Git tag created accordingly
```

### Release Checklist

Before creating a release:

```bash
# 1. Switch to main and update
git checkout main
git pull origin main

# 2. Preview what version will be released
npm run version:dry-run

# 3. Review recent commits
git log --oneline -10

# 4. If correct, create release
npm run version:release

# 5. Verify tag was created
git tag -l | tail -5

# 6. Verify manifest updated
git diff HEAD~1 manifest.json
```

---

## Local Theme Preview

### Quick Start

1. **Ensure ZCLI is authenticated**:
   ```bash
   zcli login -i
   ```

2. **Start the preview from VS Code**:
   - Press **⌘Shift+P** (macOS) or **Ctrl+Shift+P** (Linux/Windows)
   - Type `Tasks: Run Task`
   - Select `Zendesk: Preview Theme`

3. **Open the preview URL** in your browser:
   ```
   https://hiltiprofisengineering.zendesk.com/hc/admin/local_preview/start
   ```

4. **View your theme** in real-time
   - Changes you make are auto-synced to the preview
   - Refresh the browser to see updates

5. **Stop the preview**:
   - Press **Ctrl+C** in the VS Code terminal, or
   - Visit: `https://hiltiprofisengineering.zendesk.com/hc/admin/local_preview/stop`

### DNS Requirements

If you see "Domain can't be reached" errors:

1. Check your DNS resolution:
   ```bash
   nslookup help.profisengineering.hilti.com
   ```

2. If unresolved, switch to Google Public DNS:
   - **macOS**: System Preferences → Network → Wi-Fi → Advanced → DNS
   - Add: `8.8.8.8` and `8.8.4.4`

3. Flush DNS cache:
   ```bash
   sudo dscacheutil -flushcache
   ```

See [LOCAL_PREVIEW.md](LOCAL_PREVIEW.md) for detailed troubleshooting.

---

## Version Management Workflow

### Standard Release Process

#### 1. Develop Features/Fixes

```bash
# Create a feature branch
git checkout -b FPSKB-105/add-dark-mode

# Make changes and commit with conventional format
# Use fix: for bug fixes
git commit -m "fix: correct spacing in dark mode buttons"

# Use feat: for new features
git commit -m "feat: add dark mode toggle to theme settings"

# Push to GitLab
git push origin FPSKB-105/add-dark-mode
```

#### 2. Verify Commit Format

Your commits must follow Conventional Commits. Check them:

```bash
# View your commits
git log --oneline -5

# Should show:
# abc1234 feat: add dark mode toggle to theme settings
# def5678 fix: correct spacing in dark mode buttons
# ghi9012 fix: correct empty state icon reference
```

#### 3. Dry-run Version Check

Before merging, check what version bump will be applied:

```bash
npm run version:dry-run
```

Output example:
```
Current version: 2.2.10
Commits since tag theme-v2.2.10: 3
  - fix: correct icon reference
  - feat: add dark mode toggle
  - fix: spacing issue
Detected bump type: MINOR (due to feat:)
Next version: 2.3.0
```

#### 4. Create Pull Request

- Push your branch to GitLab
- GitLab CI automatically runs `version:dry-run` in the pipeline
- Review the CI output to confirm version bump
- Create a Pull Request and have team members review

#### 5. Merge to Main

Once approved and all checks pass:
- Merge to `main` branch
- This triggers another CI `version:dry-run` check

#### 6. Create Release (Manual)

After merging to `main`, create an official release:

**Option A: Via GitLab CI (Recommended)**
```
1. Go to CI/CD → Pipelines
2. Find the most recent pipeline on main branch
3. Click on the theme_version_release job
4. Click "Play" or "Retry" to trigger release
5. This automatically:
   - Calculates next version
   - Updates manifest.json
   - Creates git tag (e.g., theme-v2.3.0)
   - Uploads updated theme to Zendesk
```

**Option B: Via CLI (Local)**
```bash
npm run version:release
```

This does:
- Reads commits since last tag
- Determines next version (2.3.0)
- Updates manifest.json
- Creates git tag: `theme-v2.3.0`
- Displays release summary

**Option C: Force Specific Version**
```bash
# If dry-run detection is wrong, force the type
npm run version:patch    # Force PATCH bump
npm run version:minor    # Force MINOR bump
npm run version:major    # Force MAJOR bump
```

#### 7. Deploy to Production

After release tag is created:
- New version is now tagged in git (e.g., `theme-v2.3.0`)
- Deploy via Zendesk admin console or CI/CD pipeline
- Document changes in release notes

---

## Available npm Scripts

| Command | Purpose | Output |
|---------|---------|--------|
| `npm run version:dry-run` | Preview next version without changes | Shows version bump decision |
| `npm run version:release` | Create new version tag and update manifest | Updates manifest.json, creates git tag |
| `npm run version:patch` | Force PATCH bump | Useful if dry-run detection fails |
| `npm run version:minor` | Force MINOR bump | Override automatic detection |
| `npm run version:major` | Force MAJOR bump | For breaking changes |

### Examples

```bash
# Check what version change would happen
npm run version:dry-run

# Automatically bump and tag
npm run version:release

# Force a specific bump type
npm run version:minor
npm run version:major
```

---

## GitLab CI Integration

The project includes [.gitlab-ci.yml](.gitlab-ci.yml) with automated version management:

### On Every Push/MR

- **`theme_version_dry_run`** job runs
- Validates commit messages and shows next version
- No files modified; safe to run

### On Merge to Main

- Manual **`theme_version_release`** job available
- Creates version tag and updates manifest
- Uploads theme to Zendesk

### Example CI Output

```
theme_version_dry_run
├─ Current version: 2.2.10
├─ Commits since last tag: 3
├─ Commit types detected: fix(2), feat(1)
├─ Version bump type: MINOR
└─ Next version: 2.3.0
```

---

## Troubleshooting

### "ZCLI command not found"

Make sure ZCLI is globally installed:

```bash
npm install -g @zendesk/zcli
which zcli  # Should return /usr/local/bin/zcli
```

### "No version change detected"

Check that your commits follow Conventional Commits format:

```bash
# ❌ Bad commits (won't trigger version bump)
git commit -m "update styling"
git commit -m "changes"

# ✅ Good commits
git commit -m "fix: correct button styling"
git commit -m "feat: add search functionality"
```

### Preview not loading

See [LOCAL_PREVIEW.md](LOCAL_PREVIEW.md) troubleshooting section for DNS and network issues.

### Version tag already exists

If you try to create a release but the tag exists:

```bash
# Delete the local tag
git tag -d theme-v2.2.11

# Try release again
npm run version:release
```

---

## Quick Reference

**First time setup:**
```bash
zcli login -i
npm install
```

**Daily workflow:**
```bash
# Start preview
npm run preview  # or use VS Code task

# Make changes
git commit -m "fix: description"

# Check version
npm run version:dry-run

# Release (after merge to main)
npm run version:release
```

**CI/CD:**
- Push → GitLab CI validates version
- Merge to main → Manual release available
- Release → Version tag created + manifest updated

---

For additional help:
- [VERSIONING.md](VERSIONING.md) - Detailed versioning rules
- [LOCAL_PREVIEW.md](LOCAL_PREVIEW.md) - Preview mode guide
- [.vscode/tasks.json](.vscode/tasks.json) - Available VS Code tasks
