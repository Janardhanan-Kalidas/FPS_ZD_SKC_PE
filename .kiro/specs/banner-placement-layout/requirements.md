# Requirements Document

## Introduction

This feature defines the placement and layout behaviour of two announcement banners (Release Banner and Notification Banner) within the Hilti PROFIS Engineering Zendesk Help Center theme. The banners must render between the existing Header and the Hero/Search section, following a strict visual stacking order. The implementation must ensure zero layout shift or empty space when banners are hidden or dismissed, and maintain full responsiveness across all viewports.

## Glossary

- **Header**: The existing Zendesk Help Center page header element rendered by `header.hbs`, containing the logo, navigation links, and user menu.
- **Hero_Section**: The full-width homepage hero area (`.hero` div in `home_page.hbs`) containing background imagery, heading text, and the search bar.
- **Release_Banner**: A configurable announcement banner used to communicate software release information, rendered immediately below the Header when enabled.
- **Notification_Banner**: A configurable announcement banner used for general notifications or alerts, rendered below the Release_Banner (or below the Header if the Release_Banner is disabled) when enabled.
- **Banner_Container**: The wrapping HTML section element (`.announcement-banners`) that holds both banners in the correct stacking order between the Header and the Hero_Section.
- **Dismiss_Button**: The close (X) button within each banner that allows users to hide a specific banner for the current session.
- **Theme_Settings**: The Zendesk Guide theme settings (defined in `manifest.json`) that control banner visibility, content, and styling.
- **Layout_Shift**: Any unexpected visual movement of page content caused by elements appearing, disappearing, or changing size during or after page load.

## Requirements

### Requirement 1: Banner Placement Position

**User Story:** As a Help Center visitor, I want announcements to appear below the header and above the search area, so that I can see important information without it interfering with the site navigation.

#### Acceptance Criteria

1. WHEN any Help Center page loads, THE Banner_Container SHALL render as a direct sibling element immediately after the closing `</header>` tag and immediately before the Hero_Section opening tag in the DOM tree, with no intermediate visible elements between them.
2. THE Banner_Container SHALL NOT render as a child element or preceding sibling of the Header element.
3. THE Banner_Container SHALL NOT render as a child element or subsequent sibling of the Hero_Section element.
4. IF no active banner content is configured, THEN THE Banner_Container SHALL NOT render any visible element in the DOM.

### Requirement 2: Banner Stacking Order

**User Story:** As a Help Center administrator, I want banners to follow a consistent visual hierarchy, so that release information is always prioritised above general notifications.

#### Acceptance Criteria

1. WHEN both the Release_Banner and the Notification_Banner are enabled, THE Banner_Container SHALL render the Release_Banner as the first child element (top in visual and DOM order) and the Notification_Banner as the second child element (bottom in visual and DOM order).
2. WHEN only the Release_Banner is enabled, THE Banner_Container SHALL render the Release_Banner as the sole child element with no sibling elements.
3. WHEN only the Notification_Banner is enabled, THE Banner_Container SHALL render the Notification_Banner as the sole child element with no sibling elements.

### Requirement 3: Layout Without Banners

**User Story:** As a Help Center visitor, I want the page layout to flow naturally when no banners are active, so that I see no empty gaps between the header and the search area.

#### Acceptance Criteria

1. WHILE both banner toggles are set to disabled in Theme_Settings, THE Hero_Section SHALL align directly below the Header with zero additional spacing, margins, or placeholder elements introduced by the Banner_Container between them, preserving only the existing fixed-header or sticky-header offset defined in Theme_Settings.
2. WHILE both banner toggles are set to disabled in Theme_Settings, THE Banner_Container SHALL not render in the DOM, resulting in 0px computed height, 0px padding, and 0px margin contribution to the page layout.
3. WHILE both banner toggles are set to disabled in Theme_Settings, THE Banner_Container SHALL NOT produce any DOM element, whitespace, or reserved placeholder space that contributes a computed height greater than 0px between the Header and the Hero_Section.
4. IF both banners are enabled but both have been dismissed via the Dismiss_Button during the current session, THEN THE Banner_Container SHALL behave identically to the disabled state, contributing 0px total height to the layout between the Header and the Hero_Section.

### Requirement 4: Dynamic Layout Shift on Banner Visibility

**User Story:** As a Help Center visitor, I want the page content to adjust seamlessly when banners appear or disappear, so that I experience no visual jumps or blank spaces.

#### Acceptance Criteria

1. WHEN one or more banners are enabled, THE Hero_Section SHALL shift downward by exactly the combined rendered height of all visible banners.
2. WHEN a banner is dismissed using the Dismiss_Button, THE Hero_Section SHALL shift upward to occupy the space previously held by the dismissed banner within one animation frame (16ms).
3. WHEN a banner is dismissed using the Dismiss_Button, THE Banner_Container SHALL remove the dismissed banner from the document flow within one animation frame (16ms).
4. WHILE banners are enabled, THE Banner_Container SHALL reserve the full rendered height of all visible banners before the first contentful paint so that the Hero_Section does not reposition after initial render.
5. IF multiple banners are dismissed within 100ms of each other, THEN THE Banner_Container SHALL batch the removal so that the Hero_Section repositions only once.
6. WHEN the page loads with one or more banners enabled, THE Theme SHALL produce zero Cumulative Layout Shift (CLS contribution of 0) attributable to banner rendering.

### Requirement 5: Banner Dismissal Behaviour

**User Story:** As a Help Center visitor, I want to dismiss a banner and have it stay hidden for the remainder of my session, so that I am not repeatedly shown information I have already acknowledged.

#### Acceptance Criteria

1. WHEN a visitor clicks the Dismiss_Button on the Release_Banner, THE Release_Banner SHALL be removed from the document flow and SHALL remain hidden on all subsequent page loads within the same browser tab session (until the tab is closed).
2. WHEN a visitor clicks the Dismiss_Button on the Notification_Banner, THE Notification_Banner SHALL be removed from the document flow and SHALL remain hidden on all subsequent page loads within the same browser tab session (until the tab is closed).
3. WHEN a banner is dismissed and another banner remains visible, THE remaining banner and the Header SHALL not change position or size as a result of the dismissal.
4. IF sessionStorage is unavailable, THEN THE Dismiss_Button SHALL still remove the banner from the document flow for the current page view only.
5. WHEN a page loads and a banner was previously dismissed in the current session, THE dismissed banner SHALL not render visibly at any point during page load (no flash of dismissed content).
6. THE dismissal state of the Release_Banner and the Notification_Banner SHALL be stored and evaluated independently, so that dismissing one banner does not affect the visibility of the other.

### Requirement 6: Non-Interference with Existing Components

**User Story:** As a Help Center administrator, I want banner rendering to have no side effects on existing page components, so that the site continues to function correctly regardless of banner configuration.

#### Acceptance Criteria

1. THE Banner_Container SHALL NOT alter the computed height, computed width, background-image source, or background-position of the Hero_Section element.
2. THE Banner_Container SHALL NOT alter the position, visibility, or input-focus capability of the search box within the Hero_Section.
3. THE Banner_Container SHALL NOT alter the computed height, computed width, or position properties (top, left, right) of the Header element.
4. THE Banner_Container SHALL NOT alter breadcrumb rendering, navigation link click targets, or header content alignment.
5. WHILE the Header is configured as fixed or sticky in Theme_Settings, THE Banner_Container SHALL NOT modify the Header's position property, z-index value, or top offset, and the Header SHALL continue to remain above all page content during scroll.
6. THE Banner_Container SHALL use a z-index value lower than the Header's z-index, ensuring the Header always renders visually above the Banner_Container when they overlap during scroll.

### Requirement 7: Responsive Layout

**User Story:** As a Help Center visitor using a mobile or tablet device, I want banners and the surrounding layout to display correctly at all screen sizes, so that my experience is consistent across devices.

#### Acceptance Criteria

1. THE Banner_Container SHALL render without horizontal overflow or clipping on viewports at or above 320px width.
2. WHILE the viewport width is below the `md` breakpoint (768px), THE Banner_Container SHALL use full-width styling with 2rem horizontal padding on each side.
3. WHILE the viewport width is at or above the `lg` breakpoint (992px), THE Banner_Container SHALL constrain its content width to match the page container max-width of 1280px, centered horizontally.
4. THE layout stacking order (Header → Banners → Hero_Section) SHALL remain consistent across desktop, tablet, and mobile viewports.
5. WHILE the viewport width is below the `md` breakpoint (768px), THE Banner_Container SHALL wrap banner text content to additional lines rather than truncating or causing horizontal scrolling.

### Requirement 8: Banner Configuration via Theme Settings

**User Story:** As a Help Center administrator, I want to enable or disable each banner independently through theme settings, so that I can control what information is displayed without modifying code.

#### Acceptance Criteria

1. THE Theme_Settings SHALL provide a checkbox setting to independently enable or disable the Release_Banner, with a default value of disabled (unchecked).
2. THE Theme_Settings SHALL provide a checkbox setting to independently enable or disable the Notification_Banner, with a default value of disabled (unchecked).
3. THE Theme_Settings SHALL provide a text field setting for the Release_Banner content, with a default value of empty string.
4. THE Theme_Settings SHALL provide a text field setting for the Notification_Banner content, with a default value of empty string.
5. WHEN a banner toggle is disabled, THE corresponding banner SHALL NOT render in the DOM.
6. IF a banner toggle is enabled and its corresponding text field is empty, THEN THE corresponding banner SHALL NOT render in the DOM.
7. THE banner Theme_Settings SHALL operate independently from the existing `notification_location` and `notification_content` settings, with no mutual interference in rendering behaviour.
8. THE Theme_Settings SHALL provide a color picker setting for the Release_Banner background colour. The picker SHALL offer the following preset colours at 20% opacity: `#AB0115` (20% opacity → rgba(171,1,21,0.2)), `#524F53` (20% opacity → rgba(82,79,83,0.2)), `#19AF37` (20% opacity → rgba(25,175,55,0.2)), `#FFAF00` (20% opacity → rgba(255,175,0,0.2)). Default: `#AB0115` at 20% opacity.
9. THE Theme_Settings SHALL provide a color picker setting for the Release_Banner text colour, with a default value of `#524F53`.
10. THE Theme_Settings SHALL provide a color picker setting for the Notification_Banner background colour, with the same preset colours at 20% opacity as criterion 8. Default: `#524F53` at 20% opacity.
11. THE Theme_Settings SHALL provide a color picker setting for the Notification_Banner text colour, with a default value of `#524F53`.
12. WHEN a banner background colour is selected from the picker, THE corresponding banner SHALL automatically apply a left border with the following properties: position = left side, border-left-width = 4px, border-left-style = solid, and border-left-color = the full-opacity (100%) version of the selected background colour (i.e., `#AB0115`, `#524F53`, `#19AF37`, or `#FFAF00`).
13. THE Theme_Settings SHALL provide a list (dropdown) setting for the Release_Banner icon, with options: "none", "alert_error", "alert_info", "alert_positive", "alert_warning", "notification", "custom". Default: "none".
14. THE Theme_Settings SHALL provide a list (dropdown) setting for the Notification_Banner icon, with options: "none", "alert_error", "alert_info", "alert_positive", "alert_warning", "notification", "custom". Default: "none".
15. THE Theme_Settings SHALL provide a file upload setting for the Release_Banner custom icon, accepting image files (SVG, PNG). This setting is used only when the Release_Banner icon dropdown is set to "custom".
16. THE Theme_Settings SHALL provide a file upload setting for the Notification_Banner custom icon, accepting image files (SVG, PNG). This setting is used only when the Notification_Banner icon dropdown is set to "custom".
17. WHEN a banner icon is set to a built-in option (alert_error, alert_info, alert_positive, alert_warning, notification), THE corresponding banner SHALL render the matching bundled SVG from the `assets/` folder (e.g., `assets/alert_error.svg`) inline before the banner content text, constrained to 20px × 20px.
18. WHEN a banner icon is set to "custom" and a custom icon file is uploaded, THE corresponding banner SHALL render the uploaded image before the banner content text, constrained to 20px × 20px.
19. WHEN a banner icon is set to "none", THE corresponding banner SHALL NOT render any icon element.

### Requirement 9: Template Insertion Point

**User Story:** As a theme developer, I want the banner insertion point to be clearly defined in the Handlebars templates, so that future maintenance and updates are straightforward.

#### Acceptance Criteria

1. THE Banner_Container markup SHALL be placed in the `home_page.hbs` template as the first element in the file, directly above the opening `<div class="hero ...">` element, with no intervening HTML elements between the Banner_Container closing tag and the hero div opening tag.
2. THE Banner_Container SHALL use a dedicated HTML `<section>` element with the class `announcement-banners`.
3. THE Banner_Container SHALL follow the structure: `<section class="announcement-banners">` containing the Release_Banner wrapped in a Handlebars `{{#if}}` conditional block and the Notification_Banner wrapped in its own separate Handlebars `{{#if}}` conditional block, each gated by its respective settings variable.
4. THE implementation SHALL NOT modify any existing markup, Handlebars logic, or micro-template scripts within `header.hbs`.
5. IF both the Release_Banner and Notification_Banner settings variables evaluate to false, THEN THE Banner_Container `<section>` element SHALL NOT be rendered in the page output.
