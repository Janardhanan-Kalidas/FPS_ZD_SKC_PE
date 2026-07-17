# Zendesk SKC Theme - Onboarding to Deployment Guide

This document is the single source of truth for this repository. It is written in execution order for a new team member, starting from project scope and ending with deployment and rollback.

---

## Table of Contents

1. [Project Scope](#project-scope)
2. [Architecture and Repository Ownership](#architecture-and-repository-ownership)
3. [Quick Start for New Team Members](#quick-start-for-new-team-members)
4. [Development Environment Setup](#development-environment-setup)
5. [Local Preview Workflow](#local-preview-workflow)
6. [Project Structure and Where to Change What](#project-structure-and-where-to-change-what)
7. [Admin Settings and Toggle Behavior](#admin-settings-and-toggle-behavior)
8. [New Implementations](#new-implementations)
9. [Branching, Commits, and Daily Workflow](#branching-commits-and-daily-workflow)
10. [Versioning and Release](#versioning-and-release)
11. [Deployment Runbook](#deployment-runbook)
12. [Troubleshooting](#troubleshooting)
13. [Governance and Handover Boundaries](#governance-and-handover-boundaries)

---

## Project Scope

This repository is intentionally limited to Zendesk Help Center theme lifecycle operations.

### In scope

- Theme templates, styling, scripts, and translations
- Theme admin settings in `manifest.json`
- Local preview and theme validation in developer workflow
- Version bumping logic for theme releases
- GitLab pipeline jobs for release, backup, deploy, and rollback

### Out of scope

- Cross-repo release orchestration and enterprise approval workflow
- Jira ticket automation and release ticket transitions
- Confluence release report generation and publishing
- External quality reporting pipelines not directly tied to theme artifacts

---

## Architecture and Repository Ownership

### Runtime model

- Zendesk renders pages remotely using Handlebars templates in `templates/`.
- Theme behavior is driven by `script.js` and style rules in `style.css`.
- Theme customization is controlled through `manifest.json` settings and consumed as `settings.*` in templates.
- Translations are stored in `translations/*.json`.

### CI/CD model

- GitLab pipeline stages run in this order: `release -> backup -> deploy`.
- Default branch supports production backup/deploy/rollback.
- Non-default branches support preview deploy.
- Deployment safeguards are enforced with confirmation variables.

---

## Quick Start for New Team Members

Use this as your first-day checklist.

1. Get repository access in GitLab.
2. Confirm Zendesk Help Center admin/theme access.
3. Install required tools (`git`, `node`, `npm`, `zcli`).
4. Clone the repository and install dependencies.
5. Authenticate `zcli`.
6. Run local preview and confirm theme loads.
7. Create a feature branch and perform a small non-breaking test change.
8. Open a merge request and validate pipeline behavior.

---

## Development Environment Setup

### Prerequisites

- macOS, Linux, or Windows with terminal access
- Git access to repository
- Node.js (LTS recommended)
- npm
- Zendesk CLI (`@zendesk/zcli`)
- Optional: GitLab Runner for local CI-like runs

### 1) Clone repository

```bash
cd ~/Desktop
git clone https://git.hilti.com/BU_FPS/sw-support-group/FPS_ZD_SKC_PE.git
cd FPS_ZD_SKC_PE
```

### 2) Install and verify Node.js

```bash
node --version
npm --version
```

If missing, install Node.js (macOS example):

```bash
brew install node
```

### 3) Install Zendesk CLI

```bash
npm install -g @zendesk/zcli
zcli --version
```

### 4) Authenticate Zendesk CLI

```bash
zcli login -i
zcli themes:list
```

### 5) Install dependencies for tooling

```bash
npm ci
```

### 6) Optional: GitLab Runner

```bash
brew install gitlab-runner
gitlab-runner --version
```

Register runner only if required by your team:

```bash
gitlab-runner register --url https://git.hilti.com --token <runner-token>
```

---

## Local Preview Workflow

### Preferred path: VS Code tasks

- `Zendesk: Login`
- `Zendesk: Preview Theme`
- `Zendesk: List Themes`

### Terminal path

```bash
zcli login -i
zcli themes:preview
```

Expected output includes:

- `Uploading theme... Ok`
- Preview URL under `/hc/admin/local_preview/start`

Stop preview:

```bash
# In the preview terminal
Ctrl+C
```

or open `/hc/admin/local_preview/stop`.

### Notes

- Preview is rendered by Zendesk, not by a local web server.
- A Git push and Zendesk preview are independent operations.

---

## Project Structure and Where to Change What

```text
manifest.json                # Theme settings schema and defaults
script.js                    # Main client-side logic loaded by theme
style.css                    # Theme styling
.gitlab-ci.yml               # CI/CD stages, jobs, deployment guards
package.json                 # Tooling scripts for version/deploy/backup/rollback
templates/*.hbs              # Page templates and settings consumption
translations/*.json          # Locale strings
assets/                      # Static images, icons, JS extensions (code-managed)
settings/                    # Admin-uploadable defaults (favicon, logo only)
tooling/scripts/*.sh|*.mjs   # Deployment and versioning automation
```

### High-impact files

- Search and autocomplete behavior: `script.js`, `style.css`, `templates/search_results.hbs`, `templates/community_topic_page.hbs`
- Header/search display modes: `manifest.json`, `templates/header.hbs`
- Deployment behavior: `.gitlab-ci.yml`, `tooling/scripts/`

---

## Admin Settings and Toggle Behavior

Theme settings are defined in `manifest.json` and consumed in templates/scripts using `settings.*`.

### Search-related toggles and options

- `header_search_style` (none, inline, collapsible, slide-down)
- `instant_search` (checkbox)
- `scoped_kb_search` (checkbox)
- `scoped_community_search` (checkbox)
- `search_placeholder` (text)
- `search_translucent` (checkbox)
- `show_search_button` (checkbox)

How these are applied:

- Header mode and rendering logic: `templates/header.hbs`
- Community search scoping: `templates/community_topic_page.hbs`
- Search field rendering across pages: `templates/*.hbs`

### Article page and content toggles

- `show_article_voting`
- `show_article_sharing`
- `enable_downvote_feedback_modal`
- `show_recently_viewed_articles`
- `show_related_articles`
- `show_article_comments`
- `article_sidebar`

### Media and extension toggles

- `enable_lightboxes`
- `enable_video_player`

How media toggles are applied:

- Conditional CSS/JS include logic in `templates/document_head.hbs` and `templates/footer.hbs`

### Promoted article list toggle implementation

In promoted articles settings, `promoted_article_list_style` includes a `toggles` option. This style is rendered in `templates/footer.hbs` and is part of the current UI pattern for expandable grouped content.

---

## New Implementations

This repository includes newer behavior that should be understood before making changes.

### 1) Hero Image (Code-Managed)

The home page hero image is **hardcoded in the template** — no admin upload is needed.

**How it works:**
- The hero image is referenced via `{{asset 'SKC_hero_3.jpg'}}` inline in `templates/home_page.hbs`
- CSS in `style.css` controls sizing: `aspect-ratio: 1920 / 340` with `background-size: 100% 100%`
- The hero content (title + search bar) is absolutely positioned over the image

**To change the hero image:**
1. Place your new image in `assets/` (recommended: 1920×340px JPG)
2. Update the `style="background-image: url('{{asset 'YOUR_FILENAME.jpg'}}')"` in `templates/home_page.hbs`
3. If dimensions differ, update `aspect-ratio` in `.hero` CSS rule in `style.css`

**Hero content positioning** (in `style.css`):
- `.hero .hc-hero-content` — controls position (`top`, `left`, `transform`)
- `.hero .hc-hero-content > div:first-child` — centers title text relative to search bar width
- `.hero .search` — controls search bar width (`max-width: 520px`)

**Community hero** uses the same pattern in `templates/community_post_list_page.hbs` and `templates/community_topic_list_page.hbs` referencing `{{asset 'community_background_image.jpg'}}`.

### 2) Image Assets (All Code-Managed)

All decorative images are managed in the `assets/` folder — **no uploads needed in Zendesk Admin**.

| Image | File | Used In |
|-------|------|---------|
| Homepage hero | `assets/SKC_hero_3.jpg` | `templates/home_page.hbs` |
| Community hero | `assets/community_background_image.jpg` | Community templates |
| Content block icons (1-8) | `assets/content_block_N_image.svg` | `templates/home_page.hbs` |
| Custom block icons (1-4) | `assets/custom_block_N_image.svg` | `templates/footer.hbs` |
| Contact block icons (1-4) | `assets/contact_block_N_image.svg` | `templates/footer.hbs` |
| CTA background | `assets/cta_block_image.jpg` | `templates/footer.hbs` |

**Only `favicon` and `logo` remain as admin-uploadable settings** (defined in `manifest.json`, defaults in `settings/`).

To swap any image: replace the file in `assets/` keeping the same filename, or update the `{{asset 'filename'}}` reference in the template.

### 3) Announcement Banners

Two dismissible banner slots appear at the top of the home page: **Release Banner** and **Notification Banner**.

**Admin settings** (in Zendesk Admin → Theme Settings → Banners group):

| Setting | Type | Description |
|---------|------|-------------|
| `release_banner_enabled` | checkbox | Show/hide the release banner |
| `release_banner_icon` | list | Icon: alert_error, alert_info, alert_positive, alert_warning, notification, announcement |
| `release_banner_content` | text | Banner message text |
| `release_banner_link_url` | text | Optional "Learn more" link URL |
| `release_banner_version` | text | Version ID — changing this resets dismiss state for all users |
| `release_banner_bg_color` | list | Preset color: red, dark_gray, blue, green, orange, black, white, custom |
| `release_banner_custom_bg_color` | color | Custom color (used when bg_color is 'custom') |
| `release_banner_text_color` | color | Text color |
| `notification_banner_enabled` | checkbox | Show/hide the notification banner |
| `notification_banner_icon` | list | Same icon options as release banner |
| `notification_banner_content` | text | Banner message text |
| `notification_banner_version` | text | Version ID for dismiss reset |
| `notif_banner_bg_color` | list | Same color presets |
| `notif_banner_custom_bg_color` | color | Custom color |
| `notification_banner_text_color` | color | Text color |

**How dismiss works:**
- Each banner stores its dismiss state in `localStorage` using key `hilti.banner.{id}.dismissed.{version}`
- Changing `release_banner_version` or `notification_banner_version` resets the dismiss for all users (they'll see the banner again)
- The dismiss button removes the banner from the DOM immediately

**Implementation files:**
- Template: `templates/home_page.hbs` (banner HTML + color logic)
- Dismiss JS: `script.js` (banner dismiss handler with localStorage persistence)
- Styling: `style.css` (`.announcement-banner` classes)

### 4) Auto-Fingerprint Theme Refresh

The theme automatically detects when settings change and refreshes the page.

**How it works:**
- A `<meta name="theme-settings-fingerprint">` tag is rendered in `templates/document_head.hbs`
- `script.js` periodically checks if the fingerprint changed (via fetch + DOM comparison)
- If a new fingerprint is detected, `window.location.replace()` reloads the page with updated settings
- A `sessionStorage` guard (`theme_settings_last_reload_fingerprint`) prevents infinite reload loops

**When this triggers:** After you change theme settings in Zendesk Admin and save — visitors with the page open will auto-refresh within ~60 seconds.

### 5) Browser Language Auto-Redirect

On first visit, the theme detects the browser language and redirects to the matching locale if different from the current URL locale.

**Guard mechanisms:**
- `localStorage` key `hilti.browser.lang.applied` prevents repeated redirects
- URL parameter `__lang_redirected=1` acts as a fallback loop guard
- If `localStorage.setItem` fails (private browsing), the redirect is skipped entirely
- Manual country selection via `hilti.country.selection` localStorage key overrides auto-detection

### 6) Custom autocomplete (search)

Where enabled:

- `templates/search_results.hbs` on the main search bar
- `templates/community_topic_page.hbs` when header search is disabled

Activation contract:

- Wrapper must include `data-custom-autocomplete="articles"`
- Minimum query length comes from `data-autocomplete-min-chars` (default `2`)

Implementation details in `script.js`:

- Fetches article suggestions from `/api/v2/help_center/articles/search.json`
- Fetches categories and sections maps for breadcrumb context
- Caches query results in memory for faster repeated lookups
- Keyboard accessible navigation (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`)
- Pointer interaction and focus management with ARIA attributes
- Graceful fallback when suggestion API fails (`Suggestions unavailable. Press Enter to search.`)

Styling:

- Dedicated classes in `style.css` under `.hc-autocomplete-*`

### 7) View more/view less list toggle behavior

Implementation in `script.js`:

- Applies to large list-style blocks and opt-in lists with `ul[data-view-toggle]`
- Collapses lists above threshold and provides an accessible toggle button
- Uses smooth scroll compensation for sticky/fixed header behavior
- Supports late-rendered/async content via mutation observers

Styling hooks in `style.css`:

- `.view-toggle-btn`
- `.cards-wrapper`

### 8) Search results enhancements

`templates/search_results.hbs` currently implements:

- Redesigned search layout
- Filter sidebar sections (types, categories, sections)
- Result count display and cleaner result card/list presentation

---

## Branching, Commits, and Daily Workflow

### Branching

Always branch from latest default branch state:

```bash
git checkout main
git pull
git checkout -b feature/short-description
```

### Commit convention

Use conventional commits because version automation depends on commit subjects.

```text
fix: correct empty state icon reference
feat: add custom autocomplete keyboard navigation
chore: update onboarding documentation
```

Version impact:

- `feat:` -> minor bump
- `fix:` -> patch bump
- `!` or `BREAKING CHANGE:` -> major bump

### Daily workflow sequence

1. Pull latest default branch.
2. Create branch.
3. Implement change.
4. Validate in local preview.
5. Commit with conventional message.
6. Push and open merge request.
7. Review CI results.
8. Merge after approvals.

---

## Versioning and Release

Versioning is driven by `tooling/scripts/version-theme.mjs` and package scripts.

### Available commands

```bash
npm run version:theme:dry
npm run version:theme
npm run version:theme:patch
npm run version:theme:minor
npm run version:theme:major
```

### Rules

- Major: commit subject contains `!:` or body contains `BREAKING CHANGE:`
- Minor: any `feat:` commit since last tag
- Patch: any other commit since last tag

Tags use prefix `theme-v`.

### Manual release flow example

```bash
npm ci
npm run version:theme
git add manifest.json
git commit -m "chore: bump theme version"
git push
```

---

## Deployment Runbook

This section is the final operational sequence from branch preview to production deployment.

### Pipeline stages

1. `release`
2. `backup`
3. `deploy`

### Job map

- `theme_version_release` (manual on default branch)
- `theme_backup_production` (manual on default branch)
- `theme_deploy_production` (manual on default branch, requires confirmation)
- `theme_deploy_branch` (manual for non-default branch, or trigger pipeline path)
- `theme_rollback_production` (manual on default branch, requires confirmation)

### Required CI variables

Required for deploy and rollback:

- `ZD_SUBDOMAIN`
- `ZD_EMAIL`
- `ZD_API_TOKEN`

Confirmations:

- Production deploy: `DEPLOY_CONFIRM=DEPLOY_TO_PROD`
- Branch deploy: `DEPLOY_CONFIRM_BRANCH=DEPLOY_TO_BRANCH`
- Production rollback: `ROLLBACK_CONFIRM=ROLLBACK_TO_PROD`

### Branch deploy (preview)

Use either manual GitLab job or VS Code task:

- `Zendesk: Trigger GitLab Branch Deploy (Interactive)`

Interactive deployment modes:

- `new`: create new preview theme name
- `update`: deploy to existing theme id

Local variable required for interactive trigger script:

- `GITLAB_TRIGGER_TOKEN`

Optional:

- `GITLAB_PROJECT_PATH`
- `GITLAB_API_URL` (default `https://git.hilti.com/api/v4`)

### Production deploy (default branch)

1. Ensure merge is complete and pipeline is on default branch.
2. Run `theme_backup_production`.
3. Set required variables and `DEPLOY_CONFIRM=DEPLOY_TO_PROD`.
4. Run `theme_deploy_production`.
5. Validate Help Center after deployment.

### Production rollback

1. Confirm backup artifact exists.
2. Set required variables and `ROLLBACK_CONFIRM=ROLLBACK_TO_PROD`.
3. Run `theme_rollback_production`.
4. Publish rollback outcome in release channel/ticket.

---

## Troubleshooting

### Preview URL does not load

Common cause is DNS/network resolution for custom Help Center domain.

Quick checks:

```bash
nslookup help.profisengineering.hilti.com
nslookup hiltiprofisengineering.zendesk.com
```

If custom domain fails to resolve:

- switch DNS to public resolver
- flush DNS cache
- check VPN/firewall routing requirements

Flush cache on macOS:

```bash
sudo dscacheutil -flushcache
```

### ZCLI auth problems

```bash
zcli logout
zcli login -i
zcli themes:list
```

### CI deploy blocked

Check missing or invalid confirmation variables first. Pipeline is intentionally strict and blocks unsafe deploy/rollback execution.

---

## Governance and Handover Boundaries

To keep this repository theme-focused and audit-safe:

1. Keep production approval workflow outside this repo.
2. Keep Jira/Confluence release reporting in external validation pipelines.
3. Use protected production environments and controlled approver groups in GitLab.
4. Preserve release audit evidence (commit SHA, approvals, logs, rollback evidence).
5. Do not reintroduce external orchestration logic into this theme repository.

Reference governance pages (internal):

- BFS Release Management Approval Process
- BFS Release Approver Management
- EAS Hilti IT System Operations Standard
- Digital Onboarding Technical Release Management

---

## Maintenance Notes

- Keep this file updated whenever theme behavior, settings, scripts, or CI jobs change.
- For feature work, update both implementation and documentation in the same merge request.
