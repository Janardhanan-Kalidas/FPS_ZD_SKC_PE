# Implementation Plan: Banner Placement Layout

## Overview

This plan implements two configurable announcement banners (Release Banner and Notification Banner) in the Hilti PROFIS Engineering Zendesk Help Center theme. The banners render between the header and hero section using Handlebars conditionals, CSS layout styles, vanilla JavaScript dismissal logic with sessionStorage persistence, and an early-hide inline script to prevent flash of dismissed content.

## Tasks

- [ ] 1. Add banner settings to manifest.json
  - [ ] 1.1 Add banner group settings variables to manifest.json
    - Add a new settings group with label `"banner_group_label"` containing four variables: `release_banner_enabled` (checkbox, default false), `release_banner_content` (text, default ""), `notification_banner_enabled` (checkbox, default false), `notification_banner_content` (text, default "")
    - Place the new group after the existing `"general_page_group_label"` group to maintain logical ordering
    - Ensure the new settings are namespaced separately from existing `notification_location` and `notification_content` settings
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7_

- [ ] 2. Create banner container template in home_page.hbs
  - [ ] 2.1 Add the announcement-banners section markup to home_page.hbs
    - Insert the Banner_Container `<section class="announcement-banners">` as the first element in `home_page.hbs`, directly above the opening `<div class="hero ...">` element
    - Wrap the entire section in an outer `{{#if}}` conditional using Handlebars `or`/`and` logic so the section only renders when at least one banner is both enabled and has non-empty content
    - Inside the section, wrap the Release Banner div in nested `{{#if settings.release_banner_enabled}}{{#if settings.release_banner_content}}` conditionals (renders first/top)
    - Wrap the Notification Banner div in its own separate `{{#if settings.notification_banner_enabled}}{{#if settings.notification_banner_content}}` conditionals (renders second/bottom)
    - Each banner div uses `data-banner-id` attribute, `role="alert"`, a content div, and a dismiss button with `data-dismiss-banner` attribute and accessible `aria-label`
    - Include the inline SVG close icon within each dismiss button
    - _Requirements: 1.1, 1.4, 2.1, 2.2, 2.3, 8.5, 8.6, 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 3. Add banner CSS styles to style.css
  - [ ] 3.1 Add announcement banner layout and responsive styles to style.css
    - Add the `.announcement-banners` container styles: `position: relative`, `z-index: 50`, `width: 100%`
    - Add `.announcement-banner` base styles: flex layout, padding `0.75rem 2rem`, font-size `0.875rem`, line-height `1.5`
    - Add `.announcement-banner--release` styles: `background-color: #d2051e`, `color: #fff`
    - Add `.announcement-banner--notification` styles: `background-color: #f5f5f4`, `color: #524f53`, `border-bottom: 1px solid #e0e0e0`
    - Add `.announcement-banner__content` styles: `flex: 1`, `max-width: 1280px`, `margin: 0 auto`
    - Add `.announcement-banner__dismiss` button styles: flex centering, `28px` square, transparent background, `border: none`, opacity transition, focus-visible outline
    - Add responsive media queries: at `min-width: 992px` constrain content to `max-width: 1280px` centered; at `max-width: 767px` apply `flex-wrap: wrap` and `word-wrap: break-word`
    - Add early-hide CSS rules: `.banner-release-dismissed [data-banner-id="release"]` and `.banner-notification-dismissed [data-banner-id="notification"]` with `display: none !important`
    - _Requirements: 3.1, 3.2, 3.3, 4.6, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 4. Implement banner dismissal JavaScript in script.js
  - [ ] 4.1 Add the banner dismissal IIFE module to script.js
    - Add the self-contained IIFE at the end of `script.js` with the `STORAGE_PREFIX = 'hilti_banner_dismissed_'`
    - Implement `isSessionDismissed(bannerId)` — reads from sessionStorage wrapped in try/catch
    - Implement `setSessionDismissed(bannerId)` — writes to sessionStorage wrapped in try/catch
    - Implement `removeBannerFromFlow(bannerEl)` — sets `display: none` and `aria-hidden="true"`
    - Implement `cleanupContainer()` — hides the container section if no visible banners remain
    - Implement `processBatchedDismissals()` — processes queued dismissals in a single frame
    - Implement `dismissBanner(bannerId)` — sets storage, queues the banner element, uses `requestAnimationFrame` for batched removal
    - Implement `init()` — on DOMContentLoaded, hides previously-dismissed banners and attaches a delegated click listener on `[data-dismiss-banner]` buttons
    - _Requirements: 4.2, 4.3, 4.5, 5.1, 5.2, 5.3, 5.4, 5.6_

- [ ] 5. Add early-hide inline script to document_head.hbs
  - [ ] 5.1 Add the synchronous early-hide script block to document_head.hbs
    - Insert a `<script>` block at the end of `document_head.hbs` (before closing)
    - The script synchronously reads `sessionStorage` for both banner dismissed keys
    - If a banner was dismissed, add the corresponding CSS class (`banner-release-dismissed` or `banner-notification-dismissed`) to `document.documentElement`
    - Wrap all sessionStorage access in try/catch for graceful degradation
    - This prevents any flash of dismissed banner content on page load
    - _Requirements: 4.4, 4.6, 5.5_

- [ ] 6. Checkpoint - Validate integration
  - Ensure all theme files are syntactically valid (valid JSON in manifest.json, valid Handlebars in templates, valid CSS, valid JavaScript)
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Set up property-based testing with fast-check
  - [ ] 7.1 Initialize test infrastructure and install fast-check
    - Add `vitest` and `fast-check` as devDependencies in `package.json`
    - Add a `"test"` script (`vitest --run`) to `package.json`
    - Create a `vitest.config.js` at the project root with a minimal configuration for the test environment (jsdom)
    - Create a `tests/` directory for banner property tests
    - _Requirements: N/A (testing infrastructure)_

  - [ ] 7.2 Write property test for dismissal session persistence round-trip
    - **Property 1: Dismissal session persistence round-trip**
    - **Validates: Requirements 5.1, 5.2, 5.6**
    - Create `tests/banner-dismissal.property.test.js`
    - Use fast-check to generate arbitrary banner IDs from `['release', 'notification']` and arbitrary non-empty content strings
    - For each generated scenario: simulate enabling the banner, dismissing it, then verify on simulated re-init that the banner has `display: none` while the other banner (if enabled) remains visible

  - [ ] 7.3 Write property test for dismissal independence
    - **Property 2: Dismissal independence — remaining elements unaffected**
    - **Validates: Requirements 5.3, 5.6**
    - In `tests/banner-dismissal.property.test.js`
    - Use fast-check to generate pairs of non-empty content strings for both banners
    - Dismiss one banner and verify the other banner's display, width, and height properties are unchanged; verify the header mock element is also unchanged

  - [ ] 7.4 Write property test for layout offset equals combined banner height
    - **Property 3: Layout offset equals combined banner height**
    - **Validates: Requirements 4.1**
    - Create `tests/banner-layout.property.test.js`
    - Use fast-check to generate combinations of enabled/disabled states and content strings of varying lengths (1–500 chars)
    - For each combination, render the banner container and verify the vertical space between header bottom and hero top equals the sum of all visible banner heights

  - [ ] 7.5 Write property test for no horizontal overflow
    - **Property 4: No horizontal overflow at any supported viewport width**
    - **Validates: Requirements 7.1, 7.5**
    - In `tests/banner-layout.property.test.js`
    - Use fast-check to generate viewport widths in range [320, 1920] and banner content strings up to 500 characters
    - For each generated viewport/content pair, verify `document.body.scrollWidth <= document.body.clientWidth`

- [ ] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The implementation uses vanilla JavaScript (no frameworks), CSS, and Handlebars as specified by the Zendesk Guide theming constraints
- The `z-index: 50` for banners is intentionally lower than the header's `z-index: 96/97` to satisfy non-interference requirements
- The early-hide script in `document_head.hbs` is critical for zero CLS — it must run synchronously before first paint

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "7.1"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["4.1", "5.1"] },
    { "id": 3, "tasks": ["7.2", "7.3", "7.4", "7.5"] }
  ]
}
```
