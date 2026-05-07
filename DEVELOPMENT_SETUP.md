# Development Setup Guide - Complete Onboarding

Welcome! This guide walks you through **everything you need** to set up your development environment for the Zendesk theme project. Follow the steps **in order** from top to bottom.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Clone the Repository](#step-1-clone-the-repository)
3. [Step 2: Install Node.js](#step-2-install-nodejs)
4. [Step 3: Install Zendesk CLI (ZCLI)](#step-3-install-zendesk-cli-zcli)
5. [Step 4: Authenticate with Zendesk](#step-4-authenticate-with-zendesk)
6. [Step 5: Install GitLab Runner](#step-5-install-gitlab-runner)
7. [Step 6: Understand Project Structure](#step-6-understand-project-structure)
8. [Step 7: Git Workflow & Conventional Commits](#step-7-git-workflow--conventional-commits)
9. [Step 8: Local Theme Preview](#step-8-local-theme-preview)
10. [Step 9: Version Management](#step-9-version-management)
11. [Step 10: Common Workflows](#step-10-common-workflows)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:
- ✅ macOS, Linux, or Windows with terminal access
- ✅ Git installed (`git --version` to verify)
- ✅ Access to GitLab repository (fork or clone permission)
- ✅ Zendesk Help Center account access

---

## Step 1: Clone the Repository

```bash
# Navigate to your projects folder
cd ~/Desktop

# Clone the repository
git clone https://git.hilti.com/BU_FPS/sw-support-group/FPS_ZD_SKC_PE.git
cd FPS_ZD_SKC_PE
```

Verify you're in the right folder:
```bash
pwd
# Should output: /Users/[username]/Desktop/FPS_ZD_SKC_PE

ls -la
# Should show: manifest.json, script.js, style.css, templates/, assets/, etc.
```

---

## Step 2: Install Node.js

Node.js is required for the version automation system.

### Check if Node.js is installed

```bash
node --version
npm --version
```

If you see version numbers (v14+), **skip to Step 3**.

### Install Node.js via Homebrew (macOS)

```bash
brew install node
```

### Verify installation

```bash
node --version
npm --version
```

Expected output: `v25.x.x` or similar (v14+ is fine)

---

## Step 3: Install Zendesk CLI (ZCLI)

ZCLI is the official tool for previewing and managing Zendesk themes locally.

### Install via npm

```bash
npm install -g @zendesk/zcli
```

### Verify installation

```bash
zcli --version
```

Expected output: `@zendesk/zcli/1.0.0-beta.56` or similar

---

## Step 4: Authenticate with Zendesk

## Step 4: Authenticate with Zendesk

One-time setup to connect ZCLI to your Zendesk account.

### Run interactive login

```bash
zcli login -i
```

This will:
1. Open a browser window
2. Ask you to sign in to your Zendesk account
3. Authorize the CLI tool
4. Store your auth token securely on your machine

### Verify authentication

```bash
zcli themes:list
```

Expected output: List of available themes (should NOT show an error)

If you see authentication errors, try again:
```bash
zcli logout
zcli login -i
```

---

## Step 5: Install GitLab Runner

GitLab Runner executes your CI/CD pipelines locally. This step is optional but recommended for development.

### Install via Homebrew (macOS)

```bash
brew install gitlab-runner
```

### Verify installation

```bash
gitlab-runner --version
```

### Register the runner

You'll need a registration token from GitLab. Go to:
**GitLab Project → Settings → CI/CD → Runners → Create project runner**

Follow the instructions to get the registration command, then run it in your terminal:

```bash
gitlab-runner register \
  --url https://git.hilti.com \
  --token glrt_XXXXXXXXXXXXX
```

When prompted:
- **Runner name**: `macOS Zendesk Theme Runner`
- **Executor**: `shell`
- **Tags**: `macos, shell, node`

### Start the runner

Run in a **dedicated terminal** (leave it running):

```bash
gitlab-runner run
```

You should see output like:
```
Listening for connections...
```

**Leave this terminal open** while you work. It will execute CI jobs when you push to GitLab.

---

## Step 6: Understand Project Structure

```
FPS_ZD_SKC_PE/
├── manifest.json          # Theme configuration & settings
├── script.js              # Client-side JavaScript behavior
├── style.css              # Theme styling (~17K lines)
├── package.json           # Node.js project metadata
├── .gitlab-ci.yml         # CI/CD pipeline configuration
├── templates/             # Handlebars templates (HBS)
│   ├── document_head.hbs  # HTML <head> injection
│   ├── header.hbs         # Navigation header
│   ├── article_page.hbs   # Single article display
│   ├── footer.hbs         # Footer & theme data
│   └── ...                # Other pages
├── assets/                # Images, fonts, icons
│   ├── Work-in-progress.svg
│   ├── HiltiSmall*.woff   # Custom fonts
│   └── ...                # Other assets
├── translations/          # Language files (JSON)
│   ├── en-us.json
│   ├── de.json
│   └── ...                # 60+ languages
├── scripts/
│   └── version-theme.mjs  # Semantic versioning automation
├── .vscode/
│   ├── tasks.json         # VS Code tasks (preview, login, etc.)
│   └── launch.json        # VS Code Run & Debug configs
├── DEVELOPMENT_SETUP.md   # This file
├── VERSIONING.md          # Detailed versioning rules
├── LOCAL_PREVIEW.md       # Preview mode troubleshooting
└── README.md              # Project overview
```

**Key files you'll edit:**
- `script.js` - JavaScript functionality
- `style.css` - Styling & layouts
- `templates/*.hbs` - Page templates
- `manifest.json` - Version & theme settings (auto-updated on release)

---

## Step 7: Git Workflow & Conventional Commits

### Create a feature branch

Always create a branch for your work:

```bash
git checkout -b FPSKB-XXX/feature-name
```

Example:
```bash
git checkout -b FPSKB-105/add-dark-mode
```

### Make commits with Conventional Commits format

Your commit messages MUST follow this format for automatic versioning to work:

```
type(scope): description
```

**Allowed types:**

| Type | Version Impact | When to use |
|------|---|---|
| `fix:` | PATCH bump | Bug fixes, corrections |
| `feat:` | MINOR bump | New features, additions |
| `chore:` | No bump | Docs, config, dependencies |
| `refactor:` | No bump | Code restructuring |
| `style:` | No bump | Formatting only |

**Examples:**

```bash
# Patch bump (bug fix)
git commit -m "fix: correct empty state icon asset reference"

# Minor bump (new feature)
git commit -m "feat: add dark mode toggle to theme settings"

# No version change (documentation)
git commit -m "chore: update README with setup instructions"

# Multiple lines (for breaking changes)
git commit -m "feat: redesign search page layout

This commit completely redesigns the search page:
- New responsive grid layout
- Updated filtering options
- Improved performance

BREAKING CHANGE: Old CSS class names removed
Users must update custom CSS overrides.
See MIGRATION.md for details."
```

### View your commits

Before pushing, verify your commit messages are correct:

```bash
git log --oneline -5
```

Expected output:
```
abc1234 feat: add dark mode toggle
def5678 fix: correct icon spacing
ghi9012 fix: resolve breadcrumb styling
```

### Push to GitLab

```bash
git push origin FPSKB-XXX/feature-name
```

---

## Step 8: Local Theme Preview

Preview your changes locally before committing.

### Ensure ZCLI is authenticated

```bash
zcli login -i
```

### Start preview from VS Code

**Option A: Using VS Code Tasks (Easiest)**
1. Press **⌘Shift+P** (macOS) or **Ctrl+Shift+P** (Linux/Windows)
2. Type `Tasks: Run Task`
3. Select `Zendesk: Preview Theme`

**Option B: Using terminal**
```bash
zcli themes:preview
```

### Open the preview URL

You'll see output like:
```
Uploading theme... Ok
Ready https://hiltiprofisengineering.zendesk.com/hc/admin/local_preview/start 🚀
```

Click the URL or open in browser:
```
https://hiltiprofisengineering.zendesk.com/hc/admin/local_preview/start
```

You'll be taken through Zendesk authentication, then see your live preview.

### Make changes and see them live

- Edit any file in VS Code
- The preview auto-syncs your changes
- Refresh the browser to see updates

### Stop preview

Press **Ctrl+C** in the terminal, or visit:
```
https://hiltiprofisengineering.zendesk.com/hc/admin/local_preview/stop
```

### DNS Issues?

If the preview page won't load, see [LOCAL_PREVIEW.md](LOCAL_PREVIEW.md) for DNS troubleshooting.

---

## Step 9: Version Management

The project uses **Semantic Versioning** with automatic version bumps based on your commit messages.

### Understanding Versions

- **Development version**: `2.2.10` - your working version in manifest.json
- **Release version**: `2.2.10` tagged as `theme-v2.2.10` - official release in git

### Check what version will be released

Before merging to main, preview the next version:

```bash
npm run version:dry-run
```

Example output:
```
Current version: 2.2.10
Commits since tag theme-v2.2.10: 3
  - fix: correct icon reference
  - feat: add dark mode toggle
  - fix: spacing issue
Detected bump type: MINOR (due to feat:)
Next version: 2.3.0
```

### Create a release (after merge to main)

Once your PR is merged to `main` branch:

**Option A: Using GitLab CI (Recommended)**
1. Go to **CI/CD → Pipelines** on main branch
2. Find the `theme_version_release` job
3. Click **Run** to trigger the release
4. This automatically:
   - Calculates next version
   - Updates manifest.json
   - Creates git tag (e.g., `theme-v2.3.0`)

**Option B: Using CLI**
```bash
npm run version:release
```

### Force a specific version bump (if needed)

```bash
npm run version:patch   # Force PATCH bump (2.2.10 → 2.2.11)
npm run version:minor   # Force MINOR bump (2.2.10 → 2.3.0)
npm run version:major   # Force MAJOR bump (2.2.10 → 3.0.0)
```

For detailed versioning rules, see [VERSIONING.md](VERSIONING.md).

---

## Step 10: Common Workflows

### Workflow 1: Fix a Bug

```bash
# 1. Create a branch
git checkout -b FPSKB-105/fix-icon-issue

# 2. Make your changes in VS Code
# (Edit script.js, style.css, etc.)

# 3. Test with preview
# Press ⌘Shift+P → Tasks: Run Task → Zendesk: Preview Theme

# 4. Commit with fix: prefix
git commit -m "fix: correct empty state icon reference"

# 5. Push to GitLab
git push origin FPSKB-105/fix-icon-issue

# 6. Create Pull Request on GitLab
# - GitLab CI runs version:dry-run
# - Review shows version would bump to 2.2.11 (PATCH)

# 7. After review, merge to main
# - Creates new pipeline on main

# 8. Trigger release (if ready)
# - Go to CI/CD → theme_version_release → Run
# - Version tagged as theme-v2.2.11
```

### Workflow 2: Add a New Feature

```bash
# 1. Create a branch
git checkout -b FPSKB-106/add-newsletter-widget

# 2. Make changes (create new templates, JS, CSS)

# 3. Test locally with preview

# 4. Commit with feat: prefix
git commit -m "feat: add newsletter subscription widget"
git commit -m "fix: correct widget alignment on mobile"

# 5. Push and create PR

# 6. After merge, release
# - Version bumps to 2.3.0 (MINOR, due to feat:)
# - Tagged as theme-v2.3.0
```

### Workflow 3: Handle Breaking Changes

```bash
# 1. Create a branch
git checkout -b FPSKB-107/redesign-search

# 2. Make changes

# 3. Commit with BREAKING CHANGE footer
git commit -m "feat: redesign search page layout

Complete redesign of search page:
- New responsive grid layout
- Updated filtering interface
- Improved performance

BREAKING CHANGE: Old CSS class names removed
- .search-* → .search-widget-*
- .filter-* → .search-filter-*

Users must update custom CSS overrides.
See MIGRATION.md for upgrade guide."

# 4. Push and create PR
# - CI shows: BREAKING CHANGE detected, MAJOR bump to 3.0.0

# 5. After review and merge, release
# - Version bumps to 3.0.0 (MAJOR)
# - Tagged as theme-v3.0.0
```

---

## Troubleshooting

### ZCLI command not found

Make sure ZCLI is globally installed:
```bash
which zcli
# Should return: /usr/local/bin/zcli

# If not found, install:
npm install -g @zendesk/zcli
```

### Preview not loading / "Domain can't be reached"

DNS issue. See [LOCAL_PREVIEW.md](LOCAL_PREVIEW.md) for full troubleshooting.

Quick fix:
```bash
# Check DNS
nslookup help.profisengineering.hilti.com

# If unresolved, switch to Google DNS
# macOS: System Preferences → Network → Wi-Fi → Advanced → DNS
# Add: 8.8.8.8 and 8.8.4.4

# Flush cache
sudo dscacheutil -flushcache
```

### GitLab Runner not picking up jobs

Make sure the runner is **actively running**:

```bash
# In a dedicated terminal, run:
gitlab-runner run
```

You should see:
```
Listening for connections...
```

Keep this terminal open while working.

### "No version change detected"

Your commits don't follow Conventional Commits format. Check:

```bash
git log --oneline -10
```

Commits must start with `fix:`, `feat:`, or `chore:`. Examples:

❌ Bad:
```
update styling
fix icon
add feature
```

✅ Good:
```
fix: correct icon alignment
feat: add newsletter widget
chore: update dependencies
```

### Version tag already exists

If release fails because tag already exists:

```bash
# Delete the tag locally
git tag -d theme-v2.2.11

# Try release again
npm run version:release
```

### Preview stuck or not syncing changes

Kill the preview process and restart:

```bash
# Press Ctrl+C in the terminal where zcli is running

# Wait 5 seconds, then restart:
zcli themes:preview
```

---

## Quick Reference Checklist

**First time setup (do once):**
```bash
☐ git clone repository
☐ brew install node (if needed)
☐ npm install -g @zendesk/zcli
☐ zcli login -i
☐ brew install gitlab-runner
☐ gitlab-runner register
☐ gitlab-runner run (in dedicated terminal)
```

**Daily development:**
```bash
☐ git checkout -b FPSKB-XXX/feature-name
☐ zcli themes:preview (or use VS Code task)
☐ Edit files, test in preview
☐ git commit -m "fix|feat: description"
☐ git push origin branch-name
☐ Create Pull Request on GitLab
☐ npm run version:dry-run (to see next version)
☐ Merge PR to main
☐ npm run version:release (or trigger via GitLab CI)
```

---

## Additional Documentation

- [VERSIONING.md](VERSIONING.md) - Detailed semantic versioning rules
- [LOCAL_PREVIEW.md](LOCAL_PREVIEW.md) - Preview mode setup & troubleshooting
- [.vscode/tasks.json](.vscode/tasks.json) - Available VS Code tasks
- [manifest.json](manifest.json) - Theme configuration & settings
- [scripts/version-theme.mjs](scripts/version-theme.mjs) - Version automation script

---

## Getting Help

**Common questions:**
- "How do I preview locally?" → See Step 8
- "What version will be released?" → Run `npm run version:dry-run`
- "How should I write commit messages?" → See Step 7
- "Preview not loading?" → See [LOCAL_PREVIEW.md](LOCAL_PREVIEW.md)
- "Git/version issues?" → See Troubleshooting section

**Questions about this guide?**
Ask your team lead or check the existing documentation above.

---

**Welcome to the team!** 🚀 Follow these steps in order and you'll be ready to develop. Happy coding!
