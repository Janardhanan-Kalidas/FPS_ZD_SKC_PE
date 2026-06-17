# Zendesk Theme Project - Complete Documentation

Welcome! This comprehensive guide contains all documentation for the Zendesk theme development project. Follow the sections below in order for complete onboarding and reference.

---

## Table of Contents

1. [Development Setup Guide](#development-setup-guide)
2. [Local Theme Preview](#local-theme-preview)
3. [Theme Versioning](#theme-versioning)
4. [External Validation Workflow](#external-validation-workflow)

---

## External Validation Workflow

Theme validation is now owned by the external repository:

- `https://git.hilti.com/bu-f-ps/sw-support-group/skc_pe_deployment_validation`

### How validation is triggered

- CI deployments in this repository trigger the external validation pipeline after deploy and rollback.
- Local deployment scripts in this repository also trigger the external validation pipeline.
- Manual post-release validation is started directly in the external validation repository by running a pipeline and playing `theme_validate_post_release`.

### Gate behavior

- Production deployments use hard-gate behavior (validation trigger failures stop deployment completion).
- Preview/non-production deployments use soft-gate behavior (trigger failures are reported but do not block completion).

### Required trigger variables for local deployments

- `VALIDATION_TRIGGER_TOKEN` (GitLab pipeline trigger token from validation project)
- Optional overrides:
  - `VALIDATION_PROJECT_PATH` (default: `bu-f-ps/sw-support-group/skc_pe_deployment_validation`)
  - `VALIDATION_REF` (default: `main`)
  - `VALIDATION_GITLAB_API_URL` (default: `https://git.hilti.com/api/v4`)

## Development Setup Guide

## Complete Onboarding

Welcome! This guide walks you through **everything you need** to set up your development environment for the Zendesk theme project. Follow the steps **in order** from top to bottom.

### Section Table of Contents

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

### Prerequisites

Before starting, ensure you have:

- ✅ macOS, Linux, or Windows with terminal access
- ✅ Git installed (`git --version` to verify)
- ✅ Access to GitLab repository (fork or clone permission)
- ✅ Zendesk Help Center account access

### Workspace Hygiene (Important)

Keep the repository source-only. Do not commit local runtime artifacts.

Local-only files/folders to keep out of git:

- `.env.local`
- `node_modules/`
- `.venv/`
- `tooling/reports/`
- `.DS_Store`

If any of these appear locally, remove them before pushing changes.

### Step 1: Clone the Repository

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

### Step 2: Install Node.js

Node.js is required for the version automation system.

#### Check if Node.js is installed

```bash
node --version
npm --version
```

If you see version numbers (v14+), **skip to Step 3**.

#### Install Node.js via Homebrew (macOS)

```bash
brew install node
```

#### Verify installation

```bash
node --version
npm --version
```

Expected output: `v25.x.x` or similar (v14+ is fine)

### Step 3: Install Zendesk CLI (ZCLI)

ZCLI is the official tool for previewing and managing Zendesk themes locally.

#### Install via npm

```bash
npm install -g @zendesk/zcli
```

#### Check ZCLI version

```bash
```

Expected output: `@zendesk/zcli/1.0.0-beta.56` or similar

### Step 4: Authenticate with Zendesk

One-time setup to connect ZCLI to your Zendesk account.

#### Run interactive login

```bash
zcli login -i
```

This will:

1. Open a browser window
2. Ask you to sign in to your Zendesk account
3. Authorize the CLI tool
4. Store your auth token securely on your machine

#### Verify authentication

```bash
zcli themes:list
```

Expected output: List of available themes (should NOT show an error)

If you see authentication errors, try again:

```bash
zcli logout
zcli login -i
```

### Step 5: Install GitLab Runner

GitLab Runner executes your CI/CD pipelines locally. This step is optional but recommended for development.

#### Install via Homebrew (macOS)

```bash
brew install gitlab-runner
```

#### Check GitLab Runner version

```bash
```

#### Register the runner

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

#### Start the runner

Run in a **dedicated terminal** (leave it running):

```bash
gitlab-runner run
```

You should see output like:

```text
Listening for connections...
```

**Leave this terminal open** while you work. It will execute CI jobs when you push to GitLab.

### Step 6: Understand Project Structure

```text
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
└── README.md              # Project overview
```

**Key files you'll edit:**

- `script.js` - JavaScript functionality
- `style.css` - Styling & layouts
- `templates/*.hbs` - Page templates
- `manifest.json` - Version & theme settings (auto-updated on release)

### Step 7: Git Workflow & Conventional Commits

#### Create a feature branch

Always create a branch for your work:

```bash
git checkout -b feature/short-description
```

Example:

```bash
git checkout -b feature/add-dark-mode
```

#### Make commits with Conventional Commits format

Your commit messages MUST follow this format for automatic versioning to work:

```text
type(scope): description
```

**Allowed types:**

| Type | Version Impact | When to use |
| --- | --- | --- |
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

#### View your commits

Before pushing, verify your commit messages are correct:

```bash
git log --oneline -5
```

Expected output:

```text
abc1234 feat: add dark mode toggle
def5678 fix: correct icon spacing
ghi9012 fix: resolve breadcrumb styling
```

#### Push to GitLab

```bash
git push origin feature/short-description
```

### Step 8: Local Theme Preview

Preview your changes locally before committing.

#### Ensure ZCLI is authenticated

```bash
zcli login -i
```

#### Start preview from VS Code

#### Option A: Using VS Code Tasks (Easiest)

1. Press **⌘Shift+P** (macOS) or **Ctrl+Shift+P** (Linux/Windows)
2. Type `Tasks: Run Task`
3. Select `Zendesk: Preview Theme`

#### Option B: Using terminal

```bash
zcli themes:preview
```

#### Open the preview URL

You'll see output like:

```text
Uploading theme... Ok
Ready https://hiltiprofisengineering.zendesk.com/hc/admin/local_preview/start 🚀
```

Click the URL or open in browser:

```text
https://hiltiprofisengineering.zendesk.com/hc/admin/local_preview/start
```

You'll be taken through Zendesk authentication, then see your live preview.

#### Make changes and see them live

- Edit any file in VS Code
- The preview auto-syncs your changes
- Refresh the browser to see updates

#### Stop preview

Press **Ctrl+C** in the terminal, or visit:

```text
https://hiltiprofisengineering.zendesk.com/hc/admin/local_preview/stop
```

#### DNS Issues?

If the preview page won't load, see the [Local Theme Preview - Troubleshooting](#troubleshooting-preview) section for DNS troubleshooting.

### Step 9: Version Management

The project uses **Semantic Versioning** with automatic version bumps based on your commit messages.

#### Understanding Versions

- **Development version**: `2.2.10` - your working version in manifest.json
- **Release version**: `2.2.10` tagged as `theme-v2.2.10` - official release in git

#### Check what version will be released

Before merging to main, preview the next version:

```bash
npm run version:theme:dry
```

Example output:

```text
Current version: 2.2.10
Commits since tag theme-v2.2.10: 3
  - fix: correct icon reference
  - feat: add dark mode toggle
  - fix: spacing issue
Detected bump type: MINOR (due to feat:)
Next version: 2.3.0
```

#### Create a release (after merge to main)

Once your PR is merged to `main` branch:

#### Option A: Using GitLab CI (Recommended)

1. Go to **CI/CD → Pipelines** on main branch
2. Find the `theme_version_release` job
3. Click **Run** to trigger the release
4. This automatically:
   - Calculates next version
   - Updates manifest.json
   - Creates git tag (e.g., `theme-v2.3.0`)

#### Option B: Using CLI

```bash
npm run version:release
```

#### Force a specific version bump (if needed)

```bash
npm run version:patch   # Force PATCH bump (2.2.10 → 2.2.11)
npm run version:minor   # Force MINOR bump (2.2.10 → 2.3.0)
npm run version:major   # Force MAJOR bump (2.2.10 → 3.0.0)
```

For detailed versioning rules, see the [Theme Versioning](#theme-versioning) section.

### Step 10: Common Workflows

#### Workflow 1: Fix a Bug

```bash
# 1. Create a branch
git checkout -b fix/fix-icon-issue

# 2. Make your changes in VS Code
# (Edit script.js, style.css, etc.)

# 3. Test with preview
# Press ⌘Shift+P → Tasks: Run Task → Zendesk: Preview Theme

# 4. Commit with fix: prefix
git commit -m "fix: correct empty state icon reference"

# 5. Push to GitLab
git push origin fix/fix-icon-issue

# 6. Create Pull Request on GitLab
# - GitLab CI runs version:dry-run
# - Review shows version would bump to 2.2.11 (PATCH)

# 7. After review, merge to main
# - Creates new pipeline on main

# 8. Trigger release (if ready)
# - Go to CI/CD → theme_version_release → Run
# - Version tagged as theme-v2.2.11
```

#### Workflow 2: Add a New Feature

```bash
# 1. Create a branch
git checkout -b feature/add-newsletter-widget

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

#### Workflow 3: Handle Breaking Changes

```bash
# 1. Create a branch
git checkout -b feature/redesign-search

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
```

### Troubleshooting

_See the [Local Theme Preview - Troubleshooting](#troubleshooting-preview) section for preview-specific issues._

---

## Local Theme Preview

You can preview this Zendesk theme directly from VS Code by using the installed Zendesk CLI.

## Prerequisites for Local Theme Preview

- `zcli` installed locally
- Access to the target Zendesk Help Center
- Permission to preview themes in that Zendesk instance

This machine already has `zcli` installed.

## First-time setup

Authenticate once with Zendesk:

```bash
zcli login -i
```

That opens the interactive login flow and stores your auth token in the Zendesk CLI profile.

## Preview from VS Code

This repo now includes VS Code tasks in `.vscode/tasks.json`.

Open the command palette and run:

- `Tasks: Run Task`
- choose `Zendesk: Login` if you have not authenticated yet
- choose `Zendesk: Preview Theme` to start preview mode

You can also use the Run and Debug sidebar:

- open `Run and Debug`
- choose `Zendesk: Preview Theme`
- press the start button

The preview command watches the current theme folder and pushes local changes to Zendesk preview mode.

## Helpful tasks and launch shortcuts

- `Zendesk: Login`
- `Zendesk: Preview Theme`
- `Zendesk: List Themes`

## Notes

- The preview is not a standalone local web server. Zendesk renders the preview remotely using your local theme files.
- Any push from VS Code to GitLab is unrelated to preview mode.
- If the preview fails, run `Zendesk: Login` again and then retry `Zendesk: Preview Theme`.
- If you work against more than one Zendesk instance, use the CLI profile that matches the target subdomain.

## Terminal alternative

If you prefer the terminal inside VS Code, run:

```bash
zcli login -i
zcli themes:preview
```

## Troubleshooting {#troubleshooting-preview}

### Preview page won't load / "Page not found"

**Symptom**: Preview URL opens but returns a blank page or "not found" error, or the custom Help Center domain (`help.profisengineering.hilti.com`) doesn't resolve.

**Root cause**: The custom Help Center domain may not be resolvable from your local network or DNS configuration. This is a network/DNS issue, **not a theme compilation issue**. The theme uploads successfully (check for "Ok" in the terminal), but the preview can't authenticate to the custom domain.

**Solutions**:

1. **Switch to Google Public DNS** (recommended quick fix):
   - Go to **System Preferences** → **Network** → **Wi-Fi** → **Advanced**
   - **DNS Servers** tab
   - Remove your current DNS servers
   - Add: `8.8.8.8` and `8.8.4.4` (Google Public DNS)
   - Click **OK** and reconnect to Wi-Fi
   - Try the preview URL again

2. **Flush local DNS cache**:

   ```bash
   sudo dscacheutil -flushcache
   ```

3. **Test domain resolution**:

   ```bash
   nslookup help.profisengineering.hilti.com
   ```

   - If you see `** server can't find help.profisengineering.hilti.com: NXDOMAIN`, your DNS cannot resolve the custom domain
   - Try again after switching DNS providers

4. **Check if you're behind a corporate firewall/VPN**:
   - The custom Help Center domain may require VPN access from external networks
   - Connect to your corporate VPN and retry
   - Contact IT if the domain still doesn't resolve on VPN

5. **Verify primary domain works** (sanity check):

   ```bash
   nslookup hiltiprofisengineering.zendesk.com
   ```

   - Should return IPs like `216.198.54.11` or `216.198.53.11`
   - If this fails, you have a general connectivity issue

**After you fix DNS**: Restart the preview:

```bash
# Kill the current preview (Ctrl+C or run this in another terminal)
# Then restart
zcli themes:preview
```

---

## Theme Versioning

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

### Auto bump from commit history

```bash
npm run version:theme
```

### Force a specific bump

```bash
npm run version:theme -- --release-as patch
npm run version:theme -- --release-as minor
npm run version:theme -- --release-as major
```

### Update the manifest and create a git tag

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

For local theme preview from VS Code, see [Local Theme Preview](#local-theme-preview)

---

## End of Documentation

All project documentation is now consolidated in this file. For quick navigation, use the [Table of Contents](#table-of-contents) at the top.
