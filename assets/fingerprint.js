/**
 * Banner Auto-Fingerprint — Canonical Utility Functions
 *
 * This file is the canonical reference implementation of the fingerprint
 * utility functions. They are inlined into both document_head.hbs (early
 * dismissal script) and script.js (main banner IIFE) because the Zendesk
 * theme has no module bundler.
 *
 * Browser support: Chrome 90+, Firefox 90+, Safari 14+, Edge 90+
 */

/**
 * Normalizes banner content for fingerprinting.
 * 1. Strips all HTML tags
 * 2. Collapses consecutive whitespace to a single space
 * 3. Trims leading and trailing whitespace
 *
 * @param {string} raw - Raw banner content (may contain HTML)
 * @returns {string} Normalized plain text, or empty string for non-string/empty input
 */
function normalizeContent(raw) {
  if (typeof raw !== 'string') return '';
  var text = raw.replace(/<[^>]*>/g, '');      // Strip HTML tags
  text = text.replace(/\s+/g, ' ');            // Collapse whitespace
  text = text.trim();                          // Trim edges
  return text;
}

/**
 * Computes an FNV-1a 32-bit hash of the input string and returns
 * a base-36 alphanumeric fingerprint (≤7 characters).
 *
 * Algorithm: FNV-1a 32-bit
 * - Offset basis: 0x811c9dc5
 * - Prime: 0x01000193
 * - Output: base-36 string using [0-9a-z], always ≤10 chars
 *
 * @param {string} text - Normalized content string (already trimmed)
 * @returns {string} Alphanumeric fingerprint, or '' if input is empty/falsy
 */
function computeFingerprint(text) {
  if (!text) return '';
  var FNV_OFFSET = 0x811c9dc5;
  var FNV_PRIME = 0x01000193;
  var hash = FNV_OFFSET;
  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;  // Unsigned 32-bit multiply
  }
  return hash.toString(36);                    // base-36: [0-9a-z], ≤7 chars
}

/**
 * Constructs the sessionStorage key for banner dismiss state.
 * Format: banner_dismissed_{id}_{fingerprint}_{version}
 *
 * @param {string} bannerId    - 'release' or 'notification'
 * @param {string} fingerprint - Computed content hash
 * @param {string} version     - Force-reset version (defaults to '1' if empty/whitespace)
 * @returns {string} Storage key
 */
function buildStorageKey(bannerId, fingerprint, version) {
  var ver = (version && version.trim()) ? version.trim() : '1';
  return 'banner_dismissed_' + bannerId + '_' + fingerprint + '_' + ver;
}

/**
 * Extracts the user-visible text content from a banner element,
 * excluding link text (.announcement-banner__link) and button text.
 *
 * @param {Element} bannerElement - The .announcement-banner DOM element
 * @returns {string} Raw text content for normalization
 */
function extractBannerContent(bannerElement) {
  var contentEl = bannerElement.querySelector('.announcement-banner__content');
  if (!contentEl) return '';

  // Clone to avoid mutating live DOM
  var clone = contentEl.cloneNode(true);

  // Remove link elements from the clone
  var links = clone.querySelectorAll('.announcement-banner__link');
  for (var i = 0; i < links.length; i++) {
    links[i].parentNode.removeChild(links[i]);
  }

  return clone.textContent || '';
}

// Export for testing (ESM — project uses "type": "module")
export { normalizeContent, computeFingerprint, buildStorageKey, extractBannerContent };
