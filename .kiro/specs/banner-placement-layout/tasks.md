# Implementation Plan: Banner Placement Layout

## Overview

This implementation plan maps each task 1:1 to a requirement from the requirements document, enabling branch-per-task traceability with the FPSKB ticket structure. Tasks follow the logical implementation order: settings first, then template structure, placement, stacking, CSS/responsive, JS/dismissal, and validation.

> **⚠️ EXECUTION RULES:**
> - Each task must be **manually started** by the user — do NOT auto-proceed to the next task.
> - Once a task is completed, **STOP** and wait for the user to explicitly start the next task.
> - Do NOT chain tasks or continue to the next task without user instruction.

## Tasks

- [ ] 1. FPSKB-233 — Banner Configuration via Theme Settings
  - **Branch:** `git checkout -b FPSKB-233-theme-settings`
  - [x] 1.1 Add banner enable/content settings to manifest.json
    - Add a new settings group `"banner_group_label"` to `manifest.json`
    - Add `release_banner_enabled` (checkbox, default: false)
    - Add `release_banner_content` (text, default: "")
    - Add `notification_banner_enabled` (checkbox, default: false)
    - Add `notification_banner_content` (text, default: "")
    - Ensure these are namespaced separately from existing `notification_location` and `notification_content` settings
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7_
  - [x] 1.2 Add banner colour settings to manifest.json
    - Add `release_banner_background_color` (color, default: `#AB0115`) — displayed at 20% opacity as the banner background
    - Add `release_banner_text_color` (color, default: `#524F53`)
    - Add `notification_banner_background_color` (color, default: `#524F53`) — displayed at 20% opacity as the banner background
    - Add `notification_banner_text_color` (color, default: `#524F53`)
    - The colour picker presets SHALL include: `#AB0115`, `#524F53`, `#19AF37`, `#FFAF00`
    - The stored colour value is at full opacity; the 20% opacity is applied via CSS at render time
    - The border-left colour is auto-derived from the background colour at 100% opacity (4px solid, left side, inside)
    - _Requirements: 8.8, 8.9, 8.10, 8.11, 8.12_
  - [x] 1.3 Add banner icon settings to manifest.json
    - Add `release_banner_icon` (list, options: "none", "alert_error", "alert_info", "alert_positive", "alert_warning", "notification", "custom". Default: "none")
    - Add `notification_banner_icon` (list, options: "none", "alert_error", "alert_info", "alert_positive", "alert_warning", "notification", "custom". Default: "none")
    - Add `release_banner_custom_icon` (file upload, accepts SVG/PNG) — used only when icon dropdown is "custom"
    - Add `notification_banner_custom_icon` (file upload, accepts SVG/PNG) — used only when icon dropdown is "custom"
    - Built-in icon assets referenced: `assets/alert_error.svg`, `assets/alert_info.svg`, `assets/alert_positive.svg`, `assets/alert_warning.svg`, `assets/notification.svg`
    - _Requirements: 8.13, 8.14, 8.15, 8.16, 8.17, 8.18, 8.19_
  - [ ] 1.4 Verify settings independence from existing notification settings
    - Confirm `notification_location` and `notification_content` continue to function when banner settings are toggled
    - Validate that enabling/disabling banners does not interfere with existing notification rendering
    - _Requirements: 8.7_

- [ ] 2. FPSKB-234 — Template Insertion Point
  - **Branch:** `git checkout -b FPSKB-234-template-structure`
  - [ ] 2.1 Add Banner_Container section to home_page.hbs
    - Insert the `<section class="announcement-banners">` element at the top of `home_page.hbs`, directly above the `<div class="hero ...">` opening tag
    - Wrap the entire section in a Handlebars `{{#if}}` conditional using `(or ...)` helper to gate rendering when both banners are disabled/empty
    - Place Release_Banner in its own `{{#if settings.release_banner_enabled}}{{#if settings.release_banner_content}}` block
    - Place Notification_Banner in its own `{{#if settings.notification_banner_enabled}}{{#if settings.notification_banner_content}}` block
    - Add `aria-label="Announcements"` to the section element
    - Add `role="alert"`, `data-banner-id`, and dismiss button markup per the design document
    - _Requirements: 9.1, 9.2, 9.3, 9.5_
  - [ ] 2.2 Add icon rendering logic to banner template
    - For each banner, add Handlebars `{{#is settings.xxx_banner_icon 'alert_error'}}` / `'alert_info'` / `'alert_positive'` / `'alert_warning'` / `'notification'` blocks that render the corresponding SVG from `assets/` via `{{asset 'alert_error.svg'}}` etc.
    - Add `{{#is settings.xxx_banner_icon 'custom'}}` block that renders `<img src="{{settings.xxx_banner_custom_icon}}">` 
    - Icons render before the banner content text, constrained to 20px × 20px with class `announcement-banner__icon`
    - When icon is "none", no icon element renders
    - _Requirements: 8.17, 8.18, 8.19_
  - [ ] 2.3 Add inline colour styles to banner template
    - Apply `style="background-color: rgba(R,G,B,0.2); border-left: 4px solid {{settings.xxx_banner_background_color}}; color: {{settings.xxx_banner_text_color}};"` to each banner div using the settings variables
    - The background colour uses the setting value at 20% opacity (converted to rgba inline or via a CSS custom property)
    - The border-left colour uses the setting value at 100% opacity
    - _Requirements: 8.8, 8.9, 8.10, 8.11, 8.12_
  - [ ] 2.4 Confirm no modifications to header.hbs
    - Verify that `header.hbs` is untouched — no new markup, Handlebars logic, or script changes
    - _Requirements: 9.4_

- [ ] 3. FPSKB-220 — Banner Placement Position
  - **Branch:** `git checkout -b FPSKB-220-banner-placement`
  - [ ] 3.1 Validate DOM position of Banner_Container
    - Confirm that the rendered DOM has Banner_Container as a direct sibling immediately after `</header>` and immediately before the Hero_Section
    - Ensure no intermediate visible elements exist between header and banner container
    - Ensure Banner_Container is NOT a child or preceding sibling of the Header
    - Ensure Banner_Container is NOT a child or subsequent sibling of the Hero_Section
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ] 3.2 Handle empty state — no visible element when no banners configured
    - When no active banner content is configured, ensure the `<section>` is not rendered (Handlebars outer `{{#if}}` conditional handles this)
    - _Requirements: 1.4_

- [ ] 4. FPSKB-227 — Banner Stacking Order
  - **Branch:** `git checkout -b FPSKB-227-banner-stacking`
  - [ ] 4.1 Implement correct DOM ordering in template
    - Ensure Release_Banner `<div>` comes first (top) in the section
    - Ensure Notification_Banner `<div>` comes second (bottom) in the section
    - When only one banner is enabled, it renders as the sole child with no sibling placeholder
    - _Requirements: 2.1, 2.2, 2.3_

- [ ] 5. FPSKB-232 — Responsive Layout
  - **Branch:** `git checkout -b FPSKB-232-responsive`
  - [ ] 5.1 Add banner CSS styles to style.css
    - Add `.announcement-banners` base styles: `position: relative; z-index: 50; width: 100%;`
    - Add `.announcement-banner` flex layout: `display: flex; align-items: center; gap: 1rem;`
    - Add `.announcement-banner` border style: `border-left: 4px solid` (colour applied inline from settings)
    - Add `.announcement-banner__icon` styles: `width: 20px; height: 20px; flex-shrink: 0;`
    - Add `.announcement-banner__content` styles: `flex: 1; max-width: 1280px; margin: 0 auto;`
    - Add `.announcement-banner__dismiss` button styles per design
    - Remove hardcoded `.announcement-banner--release` and `.announcement-banner--notification` background/colour rules (now handled via inline styles from settings)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.8, 8.9, 8.10, 8.11, 8.12_
  - [ ] 5.2 Add responsive media queries
    - Below `md` breakpoint (768px): full-width with `padding: 0.75rem 2rem`, word-wrap enabled, no truncation
    - At/above `lg` breakpoint (992px): constrain content to `max-width: 1280px`, centered
    - Ensure no horizontal overflow or clipping at viewports ≥ 320px
    - _Requirements: 7.1, 7.2, 7.3, 7.5_
  - [ ] 5.3 Write property test for horizontal overflow (Property 4)
    - **Property 4: No horizontal overflow at any supported viewport width**
    - For any viewport width ≥ 320px and any banner content string up to 500 characters, verify no horizontal scrollbar appears
    - **Validates: Requirements 7.1, 7.5**

- [ ] 6. Checkpoint — Verify template and styles render correctly
  - Ensure banner section renders in correct position, with proper stacking order and responsive styles. Ask the user if questions arise.

- [ ] 7. FPSKB-229 — Dynamic Layout Shift
  - **Branch:** `git checkout -b FPSKB-229-layout-shift`
  - [ ] 7.1 Implement zero-CLS rendering approach
    - Banners are server-rendered via Handlebars (no JS injection), ensuring position on first contentful paint
    - Banner_Container participates in normal document flow — no absolute positioning needed
    - Confirm Hero_Section shifts down by exactly the combined rendered height of visible banners
    - _Requirements: 4.1, 4.4, 4.6_
  - [ ] 7.2 Add early-hide script to document_head.hbs
    - Add inline `<script>` that checks sessionStorage for dismissed state and adds CSS classes to `<html>` element before banner paint
    - Add CSS rules: `.banner-release-dismissed [data-banner-id="release"] { display: none !important; }` and equivalent for notification
    - This prevents flash of dismissed content and maintains zero CLS on return navigation
    - _Requirements: 4.6, 5.5_
  - [ ]* 7.3 Write property test for layout offset (Property 3)
    - **Property 3: Layout offset equals combined banner height**
    - For any combination of banner content strings, verify offset between header bottom and hero top equals sum of visible banner heights
    - **Validates: Requirements 4.1**

- [ ] 8. FPSKB-230 — Banner Dismissal Behaviour
  - **Branch:** `git checkout -b FPSKB-230-dismissal`
  - [ ] 8.1 Implement banner dismissal module in script.js
    - Add IIFE-wrapped dismissal module with `sessionStorage` get/set logic
    - Implement `dismissBanner(bannerId)` function: sets sessionStorage key, hides banner via `display: none` + `aria-hidden="true"`
    - Implement `requestAnimationFrame` batching for multiple rapid dismissals (within 100ms)
    - Implement `cleanupContainer()` to hide the entire section when no banners remain visible
    - Attach delegated click listener on `[data-dismiss-banner]` buttons
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 4.2, 4.3, 4.5_
  - [ ] 8.2 Implement init function for restoring dismiss state on page load
    - On DOMContentLoaded, check each `[data-banner-id]` element against sessionStorage
    - If dismissed, immediately hide (redundant safety net alongside the early-hide CSS approach)
    - Handle `sessionStorage` unavailability gracefully (try/catch, dismiss for current view only)
    - _Requirements: 5.4, 5.5_
  - [ ] 8.3 Write property test for dismissal persistence (Property 1)
    - **Property 1: Dismissal session persistence round-trip**
    - For any banner with non-empty content, if dismissed, subsequent simulated page loads in same sessionStorage context should not show it
    - **Validates: Requirements 5.1, 5.2, 5.6**
  - [ ] 8.4 Write property test for dismissal independence (Property 2)
    - **Property 2: Dismissal independence — remaining elements unaffected**
    - For any pair of enabled banners, dismissing one should not alter display/width/height of the other or the header
    - **Validates: Requirements 5.3, 5.6**

- [ ] 9. FPSKB-228 — Layout Without Banners
  - **Branch:** `git checkout -b FPSKB-228-layout-without-banners`
  - [ ] 9.1 Verify zero-gap layout when banners disabled
    - When both banner toggles are disabled, confirm Hero_Section aligns directly below Header with zero additional spacing
    - Confirm Banner_Container does not render in the DOM (0px height, 0px padding, 0px margin)
    - Confirm no whitespace or placeholder elements between Header and Hero_Section
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ] 9.2 Verify dismissed state matches disabled state
    - When both banners are dismissed via dismiss button, confirm layout behaves identically to disabled state (0px total height contribution)
    - _Requirements: 3.4_

- [ ] 10. FPSKB-231 — Non-Interference with Existing Components
  - **Branch:** `git checkout -b FPSKB-231-non-interference`
  - [ ] 10.1 Verify Hero_Section properties are unaffected
    - Confirm Banner_Container does not alter computed height, width, background-image, or background-position of `.hero`
    - Confirm search box within Hero_Section retains position, visibility, and input-focus capability
    - _Requirements: 6.1, 6.2_
  - [ ] 10.2 Verify Header properties are unaffected
    - Confirm Banner_Container does not alter computed height, width, or position properties of `<header>`
    - Confirm breadcrumb rendering, nav link click targets, and header content alignment remain unchanged
    - _Requirements: 6.3, 6.4_
  - [ ] 10.3 Verify z-index layering and fixed/sticky header behavior
    - Banner_Container uses `z-index: 50`, below Header's `z-index: 96/97`
    - Confirm Header remains above all page content during scroll when fixed/sticky
    - Confirm Banner_Container does not modify Header's position, z-index, or top offset
    - _Requirements: 6.5, 6.6_

- [ ] 11. Final Checkpoint — Integration Testing
  - Ensure all tests pass, verify cross-browser behavior, and ask the user if questions arise.
  - Visual inspection in Zendesk Guide theme preview
  - Confirm zero CLS in Chrome DevTools Performance panel
  - Test at viewports: 320px, 375px, 768px, 992px, 1280px
  - Keyboard navigation to dismiss buttons
  - Screen reader announcement verification (`role="alert"`)

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for faster MVP
- Each top-level task maps 1:1 to a requirement and FPSKB ticket for branch traceability
- Implementation uses Handlebars (templates), CSS (style.css), and vanilla JavaScript (script.js) within Zendesk Guide theming constraints
- No modifications to `header.hbs` are permitted
- The early-hide script in `document_head.hbs` is critical for preventing flash of dismissed content
- Property tests validate universal correctness properties using fast-check library
- Checkpoints ensure incremental validation at logical breakpoints

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "3.2", "4.1"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "7.1", "7.2"] },
    { "id": 5, "tasks": ["7.3", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 7, "tasks": ["9.1", "9.2"] },
    { "id": 8, "tasks": ["10.1", "10.2", "10.3"] }
  ]
}
```
