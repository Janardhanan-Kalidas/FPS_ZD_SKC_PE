/* ============================================================
  JANA Hilti Help Center – script.js (clean, production-ready)
   Notes:
   - Self-contained blocks (IIFEs) + leading semicolon to avoid leakage
   - Works even if content is injected late (CSR/SPA)
   - View More/Less is selector-agnostic and ARIA-friendly
   - Keeps all original features from your file
============================================================ */

/* ============================================================
   SEARCH SUGGESTIONS – Hilti Brand Colors
   Removed redundant inline styling IIFE (now handled by CSS)
   Colors are applied via CSS rules:
   - [id^="search-result-"] > *:first-child → Hilti Steel
   - [id^="search-result-"] em → Hilti Red on yellow
   - [id^="search-result-"] [role="directory"] → breadcrumb styling
============================================================ */

/* ============================================================
   INSTANT SEARCH TRIGGER – Show suggestions immediately at 4 chars
   Calls Zendesk's autocomplete API directly (0 debounce) the
   moment value.length reaches 4, then re-styles injected items.
   For < 4 chars the dropdown is cleared so nothing shows early.
============================================================ */
;(function () {
  'use strict';

  var MIN_CHARS = 4;
  var activeQuery = '';

  /** Resolve /hc/{locale} prefix from the current URL */
  function hcBase() {
    var m = location.pathname.match(/^(\/hc\/[^/]+)/);
    return m ? m[1] : '/hc/en-us';
  }

  /** Escape special regex characters inside a user query */
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Wrap all case-insensitive matches of `query` in <em> */
  function highlightMatch(text, query) {
    if (!query) return text;
    return text.replace(new RegExp('(' + escapeRe(query) + ')', 'gi'), '<em>$1</em>');
  }

  /** Build breadcrumb string from API result object */
  function buildCrumb(item) {
    var parts = [];
    if (item.category_title) parts.push(item.category_title);
    if (item.section_title) parts.push(item.section_title);
    return parts.join(' > ');
  }

  /** Populate zd-autocomplete with API results and re-style them */
  function renderResults(zdAuto, results, query) {
    // Clear whatever Zendesk (or a previous call) put in the dropdown
    while (zdAuto.firstChild) zdAuto.removeChild(zdAuto.firstChild);

    if (!results.length) return;

    results.slice(0, 6).forEach(function (item, i) {
      var li = document.createElement('li');
      li.id = 'search-result-' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');

      var titleSpan = document.createElement('span');
      titleSpan.innerHTML = highlightMatch(item.title || '', query);

      var crumbDiv = document.createElement('div');
      crumbDiv.setAttribute('role', 'directory');
      crumbDiv.textContent = buildCrumb(item);

      li.appendChild(titleSpan);
      li.appendChild(crumbDiv);

      // Use mousedown so the click fires before the input loses focus
      li.addEventListener('mousedown', function (e) {
        e.preventDefault();
        window.location.href = item.html_url;
      });

      zdAuto.appendChild(li);
    });
  }

  /** Fetch from Zendesk's autocomplete endpoint and render */
  function doSearch(query) {
    var url = hcBase() + '/search/autocomplete.json?query=' + encodeURIComponent(query);
    fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        // Discard stale responses
        if (!data || query !== activeQuery) return;
        var zdAuto = document.querySelector('zd-autocomplete');
        if (zdAuto) renderResults(zdAuto, data.results || [], query);
      })
      .catch(function () {/* network error – silently ignore */});
  }

  /** Bind input handler to the search field (idempotent) */
  function bindInput() {
    var input = document.querySelector('input[name="query"], input[type="search"]');
    if (!input || input._hkInstantBound) return;
    input._hkInstantBound = true;

    input.addEventListener('input', function () {
      activeQuery = this.value.trim();
      var zdAuto = document.querySelector('zd-autocomplete');

      if (activeQuery.length < MIN_CHARS) {
        // Clear dropdown – don't show anything for 1-3 chars
        if (zdAuto) {
          while (zdAuto.firstChild) zdAuto.removeChild(zdAuto.firstChild);
        }
      } else {
        // Trigger API call immediately (no debounce)
        doSearch(activeQuery);
      }
    });
  }

  function init() {
    bindInput();
    // Re-bind after SPA navigation or dynamic DOM changes
    new MutationObserver(bindInput)
      .observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ---------- Small helpers (local, non-destructive) ---------- */
(function () {
  'use strict';

  // Local `onReady` (doesn't depend on theme's `ready`)
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  // Local `each` (safe even if the theme also has `each`)
  function each(selector, cb) {
    document.querySelectorAll(selector).forEach(cb);
  }

  onReady(function () {
    /* ---------------------------------------------------------
       Focus restoration (used when coming back to page)
    --------------------------------------------------------- */
    var returnFocusTo = null;
    try {
      returnFocusTo = sessionStorage.getItem('returnFocusTo');
      if (returnFocusTo) {
        sessionStorage.removeItem('returnFocusTo');
        var el = document.querySelector(returnFocusTo);
        if (el && typeof el.focus === 'function') el.focus();
      }
    } catch (e) {}

    /* ---------------------------------------------------------
       Render inline micro-templates if theme `Util` exists
    --------------------------------------------------------- */
    if (window.Util && typeof window.Util.renderTemplate === 'function') {
      each('[data-element="template"]', function (el) {
        if (el.hasAttribute('data-template')) {
          window.Util.renderTemplate(el, el.getAttribute('data-template'));
        }
      });

      // Supported helpers → assemble data for Util.renderTemplate
      var supportedHelpers = ['breadcrumbs', 'recent-articles', 'related-articles', 'recent-activity', 'share'];
      supportedHelpers.forEach(function (helper) {
        each('[data-element="' + helper + '"]', function (el) {
          if (!el.hasAttribute('data-template')) return;

          // Convert links in a container into objects {title, html_url, ...}
          var linkObjs = Array.prototype.map.call(el.querySelectorAll('a'), function (a) {
            return { title: a.innerText, html_url: a.href };
          });

          var data = {};
          if (helper === 'breadcrumbs') {
            data = { breadcrumbs: linkObjs };
          } else if (helper === 'recent-articles' || helper === 'related-articles') {
            data = { articles: linkObjs };
          } else if (helper === 'recent-activity') {
            data = { items: linkObjs };
          } else if (helper === 'share') {
            var links = Array.prototype.map.call(el.querySelectorAll('a'), function (a) {
              var svg = a.querySelector('svg');
              return {
                title: a.getAttribute('aria-label'),
                description: svg ? svg.getAttribute('aria-label') : '',
                html_url: a.href
              };
            });
            data = { links: links };
          }

          window.Util.renderTemplate(el, el.getAttribute('data-template'), data);
        });
      });
    }

    /* ---------------------------------------------------------
       Social share links → open in small popup
    --------------------------------------------------------- */
    each('.share a', function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        window.open(this.href, '', 'height=500,width=500');
      });
    });

    /* ---------------------------------------------------------
       Search input focus styling (fallback if Util is absent)
    --------------------------------------------------------- */
    var focusClass = (window.Util && window.Util.classNames && window.Util.classNames.FOCUS) || 'is-focused';
    each('.form-field [type="search"]', function (el) {
      el.addEventListener('focus', function () { el.parentNode.classList.add(focusClass); });
      el.addEventListener('focusout', function () { el.parentNode.classList.remove(focusClass); });
    });

    /* ---------------------------------------------------------
       Replace [data-inline-svg] images with inline SVG (if Util exists)
    --------------------------------------------------------- */
    if (window.Util && typeof window.Util.replaceWithSVG === 'function') {
      Array.prototype.forEach.call(document.querySelectorAll('[data-inline-svg]'), window.Util.replaceWithSVG);
    }

    /* ---------------------------------------------------------
       Smooth scroll to #hash with optional offset (if Util exists)
    --------------------------------------------------------- */
    (function () {
      if (!window.Util) return;
      function maybeScroll() {
        var smooth = window.Util.getURLParameter('smooth-scroll', window.location);
        if (smooth === 'true' && window.location.hash) {
          var offset = window.Util.getURLParameter('offset', window.location);
          var id = window.location.hash.substring(1).split('?')[0];
          var target = document.getElementById(id);
          if (target) window.Util.scrollIntoView(target, offset);
        }
      }
      window.addEventListener('hashchange', maybeScroll, false);
      maybeScroll();
    })();

    /* ---------------------------------------------------------
       Collapsible navigation (mobile/limited height)
    --------------------------------------------------------- */
    function CollapsibleNav(el) {
      this.el = el;
      el.addEventListener('click', this.onClick.bind(this));
    }
    CollapsibleNav.prototype.onClick = function (e) {
      var maxHeight = window.getComputedStyle(this.el).maxHeight;
      if (maxHeight === 'none') return;

      var isExpanded = this.el.getAttribute('aria-expanded') === 'true';
      var navLink = e.target;

      if (isExpanded) {
        if (navLink.getAttribute('aria-selected') === 'true') {
          this.el.setAttribute('aria-expanded', 'false');
          this.el.classList.remove('is-expanded');
          navLink.setAttribute('aria-selected', 'false');
          e.preventDefault();
        }
      } else {
        this.el.setAttribute('aria-expanded', 'true');
        this.el.classList.add('is-expanded');
        navLink.setAttribute('aria-selected', 'true');
        e.preventDefault();
      }
    };
    each('.collapsible-nav', function (nav) { new CollapsibleNav(nav); });
    window.CollapsibleNav = CollapsibleNav;
  });
})();

/**
 * ---------------------------------------------------------
 * File Name  : scripts.js
 * Feature    : Category Icon Mapping (Zendesk Guide)
 * ---------------------------------------------------------
 * Description:
 * Applies category icons on Help Center category listings
 * by mapping Zendesk Category IDs to icon URLs injected
 * via document_head.hbs.
 *
 * This implementation:
 * - Uses pre-resolved theme asset URLs
 * - Preserves existing icon replacement logic
 * - Avoids direct use of {{asset}} helpers in JS
 * - Ensures no UI or UX regressions
 *
 * Dependency:
 * - window.CATEGORY_ICON_MAP
 * - window.DEFAULT_CATEGORY_ICON
 *   (Injected via document_head.hbs)
 *
 * Updated by : Kalidas, Janardhanan
 * Updated on : 13 Apr 2026, 18:07 IST
 * Jira Ref   : FPSKB-128
 * ---------------------------------------------------------
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {

    /* =====================================================
       SAFETY CHECK
       ===================================================== */
    if (
      !window.CATEGORY_ICON_MAP ||
      typeof window.CATEGORY_ICON_MAP !== 'object'
    ) {
      console.warn(
        '[Category Icons] Asset Map not found. ' +
        'Check document_head.hbs'
      );
      return;
    }

    var CATEGORY_ICON_MAP = window.CATEGORY_ICON_MAP;
    var DEFAULT_CATEGORY_ICON = window.DEFAULT_CATEGORY_ICON || '';

    /* =====================================================
       CATEGORY LIST
       ===================================================== */
    var ul = document.querySelector('ul.list-unstyled');
    if (!ul) return;

    var listItems = ul.querySelectorAll(':scope > li');

    listItems.forEach(function (li) {

      /* Find category link */
      var link = li.querySelector('a[href*="/categories/"]');
      if (!link) return;

      /* Extract category ID */
      var match = link.href.match(/\/categories\/(\d+)/);
      if (!match) return;

      var categoryId = match[1];

      /* Resolve icon */
      var iconUrl =
        CATEGORY_ICON_MAP[categoryId] || DEFAULT_CATEGORY_ICON;

      if (!iconUrl) return;

      /* Remove existing icons */
      li.querySelectorAll('img, svg').forEach(function (el) {
        el.remove();
      });

      /* Inject icon */
      var img = document.createElement('img');
      img.className = 'js-category-icon';
      img.src = iconUrl;
      img.alt = 'Category icon ' + categoryId;
      img.loading = 'lazy';

      img.onerror = function () {
        console.warn('[Category Icons] Failed to load:', iconUrl);
        img.remove();
      };

      var card = li.querySelector('.card') || li;
      card.insertBefore(img, card.firstChild);
    });
  });
})();

/* ============================================================
   View More / View Less (prod-hardened, selector-agnostic)
   - Works even if .list-unstyled is not present in prod
   - SPA/CSR safe, idempotent
   - Smooth scroll to header/top on "View less"
============================================================ */
; (function () {
  'use strict';

  var MAX_VISIBLE   = 8;
  var TEXT_MORE     = 'View more';
  var TEXT_LESS     = 'View less';
  var TRANSITION_MS = 900;
  var reduceMotion  = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || false;

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }
  function uid(prefix) { return (prefix || 'vt') + '-' + Math.random().toString(36).slice(2, 9); }

  // Smooth-scroll to header/top (compensate for fixed headers)
  function smoothScrollToHeader() {
    var targetY = 0; // absolute top by default
    var header = document.querySelector('header, .header, .site-header, .sticky-header, .navbar, .topbar');
    if (header) {
      var rect = header.getBoundingClientRect();
      targetY = rect.top + window.pageYOffset;
      var cs = window.getComputedStyle(header);
      var isFixed = (cs.position === 'fixed' || cs.position === 'sticky');
      if (isFixed) {
        targetY = Math.max(0, targetY - header.offsetHeight);
      }
    }
    var prefersReduce = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    window.scrollTo({ top: targetY, behavior: prefersReduce ? 'auto' : 'smooth' });
  }

  function findLikelyULs() {
    var marked = Array.prototype.slice.call(document.querySelectorAll('ul[data-view-toggle]'));
    if (marked.length) return marked;

    var scope = document.querySelector('main') || document.body;
    var allULs = Array.prototype.slice.call(scope.querySelectorAll('ul'));
    var out = [];

    for (var i = 0; i < allULs.length; i++) {
      var ul = allULs[i];
      if (ul.closest && ul.closest('header, nav, footer, .breadcrumbs, .pagination')) continue;
      var liCount = 0;
      for (var c = 0; c < ul.children.length; c++) if (ul.children[c].tagName === 'LI') liCount++;
      if (liCount >= (MAX_VISIBLE + 1)) out.push({ ul: ul, liCount: liCount });
    }
    out.sort(function (a, b) { return b.liCount - a.liCount; });
    return out.map(function (x) { return x.ul; });
  }

  function initForUL(ul) {
    try {
      if (!ul) return;
      if (ul.getAttribute('data-view-toggle-ready') === '1') return;

      function getItems() {
        var items = [];
        for (var i = 0; i < ul.children.length; i++) {
          if (ul.children[i].tagName === 'LI') items.push(ul.children[i]);
        }
        return items;
      }

      function initialize() {
        var count = getItems().length;
        if (count <= MAX_VISIBLE) { ul.setAttribute('data-view-toggle-ready', '1'); return; }

        // Ensure wrapper
        var wrapper = ul.parentElement;
        if (!wrapper || !wrapper.classList || !wrapper.classList.contains('cards-wrapper')) {
          wrapper = document.createElement('div');
          wrapper.className = 'cards-wrapper';
          ul.parentNode.insertBefore(wrapper, ul);
          wrapper.appendChild(ul);
        }

        // Collapsed by default (CSS hides 9+)
        ul.classList.add('is-collapsed');

        // Button after wrapper
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'view-toggle-btn';
        btn.textContent = TEXT_MORE;

        if (!ul.id) ul.id = uid('list');
        btn.setAttribute('aria-controls', ul.id);
        btn.setAttribute('aria-expanded', 'false');

        wrapper.parentNode.insertBefore(btn, wrapper.nextSibling);

        var expanded = false;

        function expand() {
          var collapsedHeight = wrapper.scrollHeight;
          ul.classList.remove('is-collapsed');
          var fullHeight = wrapper.scrollHeight;

          if (reduceMotion) {
            wrapper.style.maxHeight = 'none';
          } else {
            wrapper.style.transition = 'none';
            wrapper.style.maxHeight = collapsedHeight + 'px';
            requestAnimationFrame(function () {
              wrapper.style.transition = '';
              wrapper.style.maxHeight = fullHeight + 'px';
            });
          }

          btn.textContent = TEXT_LESS;
          btn.setAttribute('aria-expanded', 'true');
          expanded = true;
        }

        function collapse() {
          // Smooth scroll immediately as we start collapsing
          smoothScrollToHeader();

          if (reduceMotion) {
            ul.classList.add('is-collapsed');
            wrapper.style.maxHeight = '';
          } else {
            wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
            requestAnimationFrame(function () {
              ul.classList.add('is-collapsed');
              requestAnimationFrame(function () {
                wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
              });
            });
            setTimeout(function () { wrapper.style.maxHeight = ''; }, TRANSITION_MS + 50);
          }

          btn.textContent = TEXT_MORE;
          btn.setAttribute('aria-expanded', 'false');
          expanded = false;
        }

        btn.addEventListener('click', function () { if (expanded) collapse(); else expand(); });

        wrapper.addEventListener('transitionend', function (e) {
          if (e && e.propertyName === 'max-height' && expanded && !reduceMotion) {
            wrapper.style.maxHeight = 'none';
          }
        });

        window.addEventListener('resize', function () {
          if (expanded) wrapper.style.maxHeight = 'none';
        });

        var itemsObserver = new MutationObserver(function () {
          var current = getItems().length;
          if (current <= MAX_VISIBLE) {
            if (expanded) collapse();
            btn.style.display = 'none';
            ul.classList.remove('is-collapsed');
            wrapper.style.maxHeight = 'none';
          } else {
            btn.style.display = '';
            if (!expanded) ul.classList.add('is-collapsed');
          }
        });
        itemsObserver.observe(ul, { childList: true });

        ul.setAttribute('data-view-toggle-ready', '1');
      }

      function hasItems() { return getItems().length > 0; }

      if (hasItems()) {
        initialize();
      } else {
        var tries = 0, MAX_RETRIES = 20;
        var t = setInterval(function () {
          if (hasItems() || ++tries >= MAX_RETRIES) {
            clearInterval(t);
            if (hasItems()) initialize();

            var waitMo = new MutationObserver(function () {
              if (hasItems() && ul.getAttribute('data-view-toggle-ready') !== '1') {
                waitMo.disconnect(); initialize();
              }
            });
            waitMo.observe(ul, { childList: true });
          }
        }, 100);
      }
    } catch (err) {
      if (window.console) console.error('[ViewToggle] init failed:', err);
    }
  }

  onReady(function () {
    var uls = findLikelyULs();
    for (var i = 0; i < uls.length; i++) initForUL(uls[i]);

    // Watch for late content (SPA/lazy load)
    var rootMo = new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var added = mutations[m].addedNodes;
        for (var a = 0; a < added.length; a++) {
          var n = added[a];
          if (!n || n.nodeType !== 1) continue;

          // Explicit opt-in
          var explicit = n.matches && n.matches('ul[data-view-toggle]') ? [n] :
                         (n.querySelectorAll ? n.querySelectorAll('ul[data-view-toggle]') : []);
          if (explicit && explicit.length) {
            for (var e = 0; e < explicit.length; e++) initForUL(explicit[e]);
          }

          // Heuristic fallback
          var scopeULs = (n.matches && n.matches('ul')) ? [n] :
                         (n.querySelectorAll ? n.querySelectorAll('ul') : []);
          for (var s = 0; s < scopeULs.length; s++) {
            var ul = scopeULs[s];
            if (ul.closest && ul.closest('header, nav, footer, .breadcrumbs, .pagination')) continue;
            var liCount = 0;
            for (var c = 0; c < ul.children.length; c++) if (ul.children[c].tagName === 'LI') liCount++;
            if (liCount >= (MAX_VISIBLE + 1)) initForUL(ul);
          }
        }
      }
    });
    rootMo.observe(document.body, { childList: true, subtree: true });
  });
})();

/* ============================================================
   NEW REQUEST PAGE – misc UX (hide default, search in multiselect,
   remove "-" option, move Cancel, group fields into sections)
============================================================ */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {

    /* ---- 1) Hide system "issue type" dropdown ---- */
    function hideIssueTypeSelector() {
      var el = document.querySelector('.request_ticket_form_id');
      if (el) el.style.display = 'none';
    }
    hideIssueTypeSelector();
    var hideObserver = new MutationObserver(hideIssueTypeSelector);
    hideObserver.observe(document.body, { childList: true, subtree: true });

    /* ---- 2) Multiselect search logic ---- */
    var targetId = 'request_custom_fields_37069904162321';
    var initialized = new WeakSet();

    function initSearchForSpecificMenu(menuContainer) {
      if (!menuContainer || initialized.has(menuContainer)) return;
      if (menuContainer.querySelector('.hc-search-wrapper')) {
        initialized.add(menuContainer);
        return;
      }

      var ul = menuContainer.querySelector('ul');
      if (!ul) return;

      var items = Array.from(ul.querySelectorAll('li'));

      var searchWrapper = document.createElement('div');
      searchWrapper.classList.add('hc-search-wrapper');

      var searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Search...';
      searchInput.classList.add('hc-search-input');

      var clearBtn = document.createElement('span');
      clearBtn.innerHTML = '×';
      clearBtn.classList.add('hc-clear-btn');

      searchWrapper.appendChild(searchInput);
      searchWrapper.appendChild(clearBtn);
      menuContainer.insertBefore(searchWrapper, ul);

      function resetList() {
        ul.innerHTML = '';
        items.forEach(function (li) { ul.appendChild(li); });
      }

      searchInput.addEventListener('input', function () {
        var query = this.value.trim().toLowerCase();
        clearBtn.style.display = query ? 'block' : 'none';
        if (!query) { resetList(); return; }

        var baseQuery = query.replace(/s\b/, '').replace(/[^a-z0-9\s]/gi, '');
        var allMatches = items.filter(function (li) { return li.textContent.toLowerCase().includes(baseQuery); });
        var startsWith = allMatches.filter(function (li) { return li.textContent.toLowerCase().startsWith(query); });

        var matched = startsWith.concat(allMatches.filter(function (li) { return startsWith.indexOf(li) === -1; }));
        ul.innerHTML = '';
        matched.concat(items.filter(function (li) { return matched.indexOf(li) === -1; }))
              .forEach(function (li) { ul.appendChild(li); });
      });

      clearBtn.addEventListener('click', function () {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        resetList();
        searchInput.focus();
      });

      initialized.add(menuContainer);
    }

    function waitForMenuAndInit(menuContainer, maxMs) {
      maxMs = maxMs || 2000;
      var start = performance.now();
      (function check() {
        if (!menuContainer) return;
        var ul = menuContainer.querySelector('ul');
        if (ul) { initSearchForSpecificMenu(menuContainer); return; }
        if (performance.now() - start > maxMs) { initSearchForSpecificMenu(menuContainer); return; }
        requestAnimationFrame(check);
      })();
    }

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (rec) {
        rec.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          var toggle = document.getElementById(targetId);
          if (!toggle) return;
          var menu = toggle.parentElement && toggle.parentElement.querySelector('.hc-multiselect-menu');
          if (menu) {
            initSearchForSpecificMenu(menu);
            waitForMenuAndInit(menu);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    /* ---- 3) Remove "-" from any tagger dropdown ---- */
    function removeDashFromDropdown(fieldId, replacementText) {
      replacementText = replacementText || 'Select an option';
      function process() {
        var input = document.getElementById(fieldId);
        if (!input) return;

        // Fix visible label (.nesty-input)
        var nesty = input.parentElement && input.parentElement.querySelector('.nesty-input');
        if (nesty && nesty.textContent.trim() === '-') nesty.textContent = replacementText;

        // Fix hidden data-tagger JSON
        try {
          var tagger = JSON.parse(input.dataset.tagger || '[]');
          if (tagger.length && tagger[0].label === '-') {
            tagger.shift();
            input.dataset.tagger = JSON.stringify(tagger);
          }
        } catch (e) {}

        // Remove "-" from open dropdown
        document.addEventListener('click', function () {
          var menu = document.querySelector('ul.nesty-panel');
          if (!menu) return;
          var dashItem = Array.prototype.slice.call(menu.querySelectorAll('li'))
            .find(function (li) { return li.textContent.trim() === '-'; });
          if (dashItem) dashItem.remove();
        });
      }
      process();
      var ob = new MutationObserver(process);
      ob.observe(document.body, { childList: true, subtree: true });
    }
    // Call for your dropdown field
    removeDashFromDropdown('request_custom_fields_44160434738577', 'Select a Hilti SW Product');

    /* ---- 4) Move Cancel next to Submit ---- */
    setTimeout(function () {
      var cancelBtn = document.getElementById('cancelBtn');
      var submitBtn = document.querySelector('input[type="submit"]');
      if (!submitBtn || !cancelBtn) return;

      var actionsRow =
        submitBtn.closest('.request-form-controls') ||
        submitBtn.closest('.form-actions') ||
        submitBtn.closest('footer') ||
        submitBtn.parentElement;

      var wrapper = actionsRow.closest('.zf-actions-wrapper');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'zf-actions-wrapper';
        actionsRow.parentNode.insertBefore(wrapper, actionsRow);
        wrapper.appendChild(actionsRow);
      }
      actionsRow.classList.add('zf-actions-row');
      submitBtn.insertAdjacentElement('afterend', cancelBtn);
    }, 300);

    // Modal helpers (if present in DOM)
    window.openCancelModal = function () {
      var m = document.getElementById('cancelModal');
      if (m) m.setAttribute('aria-hidden', 'false');
    };
    window.closeCancelModal = function () {
      var m = document.getElementById('cancelModal');
      if (m) m.setAttribute('aria-hidden', 'true');
    };
    var yesBtn = document.getElementById('modalYesBtn');
    var noBtn  = document.getElementById('modalNoBtn');
    if (yesBtn) yesBtn.addEventListener('click', function () { window.history.back(); });
    if (noBtn)  noBtn.addEventListener('click', function () { window.closeCancelModal(); });

    /* ---- 5) Group fields into sections (Requester/Product/Issue) ---- */
    (function () {
      function waitForForm(cb) {
        var tries = 0, max = 30;
        var timer = setInterval(function () {
          var form = document.querySelector('form#new_request, form[action*="requests"]');
          var anyField = document.querySelector('.form-field, .form-group, #request_subject');
          if (form && anyField) { clearInterval(timer); cb(form); }
          else if (++tries >= max) { clearInterval(timer); }
        }, 150);
      }

      function getField(selector, form) { return form.querySelector(selector); }
      function findContainer(el) { return (el.closest('.form-field') || el.closest('.form-group') || el); }

      function buildSections(form) {
        var REQUESTER_FIELDS = [
          '#request_custom_fields_44573414693009',
          '#request_custom_fields_44573410982801'
        ];
        var PRODUCT_FIELDS = [
          '#request_custom_fields_44573575976721',
          '#request_custom_fields_44573817309457'
        ];
        var ISSUE_FIELDS = [
          '#request_custom_fields_22449314',
          '#request_custom_fields_22449324'
        ];

        var firstField = form.querySelector('.form-field, .form-group, #request_subject');
        if (!firstField) return;

        var container = document.createElement('div');
        container.className = 'nr-sections';
        firstField.parentNode.insertBefore(container, firstField);

        function createSection(title) {
          var sec = document.createElement('section');
          sec.className = 'nr-section';
          var t = document.createElement('h2');
          t.className = 'nr-section__title';
          t.textContent = title;
          var body = document.createElement('div');
          body.className = 'nr-section__body';
          sec.appendChild(t); sec.appendChild(body);
          container.appendChild(sec);
          return body;
        }

        var requesterBody = createSection('Contact Details');
        var productBody   = createSection('Product Details');
        var issueBody     = createSection('Issue Details');

        function moveField(sel, targetBody) {
          var node = getField(sel, form);
          if (!node) return;
          var block = findContainer(node);
          if (block && !targetBody.contains(block)) targetBody.appendChild(block);
        }

        REQUESTER_FIELDS.forEach(function (id) { moveField(id, requesterBody); });
        PRODUCT_FIELDS.forEach(function (id) { moveField(id, productBody); });
        ISSUE_FIELDS.forEach(function (id) { moveField(id, issueBody); });

        var allFields = form.querySelectorAll('.form-field, .form-group, .upload-dropzone, .upload-area, .upload-dropzone-container');
        allFields.forEach(function (field) { if (!container.contains(field)) issueBody.appendChild(field); });
      }

      if (document.documentElement.classList.contains('new-request-page')) {
        waitForForm(buildSections);
      }
    })();
  });
})();

/* ------------------- Highlight the current/active page or section into Bold - Jana------------ */ 
document.addEventListener('DOMContentLoaded', function () {
  // 1) Try to get the category ID from breadcrumb (works on category/section/article)
  var breadcrumbCategoryLink = document.querySelector('.breadcrumbs a[href*="/categories/"]');
  var currentCategoryId = null;

  if (breadcrumbCategoryLink) {
    var match = breadcrumbCategoryLink.getAttribute('href').match(/\/categories\/(\d+)/);
    if (match) currentCategoryId = match[1];
  }

  // 2) Fallback: detect category from URL (works on category pages)
  if (!currentCategoryId) {
    var match2 = window.location.pathname.match(/\/categories\/(\d+)/);
    if (match2) currentCategoryId = match2[1];
  }

  if (!currentCategoryId) return; // no category found → stop

  // 3) Find the navigation block
  var nav = document.querySelector('[data-element="navigation"][data-template="category-list"]');
  if (!nav) return;

  // 4) Reset all nav links first
  nav.querySelectorAll('a').forEach(function (a) {
    a.classList.remove('font-bold');
    a.removeAttribute('aria-current');
  });

  // 5) Highlight the active category
  var activeLink = nav.querySelector('a[href*="/categories/' + currentCategoryId + '"]');
  if (activeLink) {
    activeLink.classList.add('font-bold');
    activeLink.classList.remove('underline');
    activeLink.setAttribute('aria-current', 'page');
  }
});

/**
 * ============================================================================
 *  FINAL VERSION — Added by Jana — 09 Mar 2026
 *
 *  Behavior on ARTICLE pages:
 *    ✔ Show ONLY the parent category
 *    ✔ Show ONLY its SECTIONS
 *    ✔ Keep the FIRST 5 sections
 *    ✔ Add a "See more" link → category page
 *    ✔ Remove all article lists ("Articles in this section")
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", function () {

  if (!/\/articles\//.test(location.pathname)) return;

  // ----- Detect current category ID -----
  let currentCategoryId = null;
  const breadcrumbCat = document.querySelector('.breadcrumbs a[href*="/categories/"]');

  if (breadcrumbCat) {
    const m = breadcrumbCat.href.match(/\/categories\/(\d+)/);
    if (m) currentCategoryId = m[1];
  }
  if (!currentCategoryId) return;

  // Category URL for “See more”
  const categoryUrl = breadcrumbCat ? breadcrumbCat.href : null;

  // ----- Locate left-sidebar container -----
  const listContainer = document.querySelector(
    '[data-element="navigation"][data-template="section-list"] .list-unstyled.m-0'
  );
  if (!listContainer) return;

  // Remove previous “Articles in this section” blocks (avoid duplicates)
  listContainer.querySelectorAll('.mb-6.p-4.bg-gray-100.border.rounded').forEach(el => el.remove());
  listContainer.querySelectorAll('[data-jana="articles-in-section"]').forEach(el => el.remove());

  // ----- Process category blocks -----
  const categoryBlocks = listContainer.querySelectorAll(':scope > div');
  let activeCategoryBlock = null;

  categoryBlocks.forEach(block => {
    const link = block.querySelector('h3 a[href*="/categories/"]');
    if (!link) return;

    const m = link.href.match(/\/categories\/(\d+)/);
    const id = m ? m[1] : null;

    if (id === currentCategoryId) {
      activeCategoryBlock = block;
      block.style.display = "block";
    } else {
      block.style.display = "none"; // Hide non-active categories
    }
  });

  if (!activeCategoryBlock) return;

  // ----- Get original SECTIONS UL -----
  const sectionUl = activeCategoryBlock.querySelector(':scope > ul');
  if (!sectionUl) return;

  // Make sure UL is visible
  sectionUl.style.removeProperty('display');
  sectionUl.removeAttribute('style');

  // ----- Remove existing category “See more” -----
  sectionUl.querySelectorAll('a[href*="/categories"]').forEach(a => a.closest('li')?.remove());

  // ----- Trim to first 5 sections -----
  const allSectionItems = Array.from(sectionUl.querySelectorAll(':scope > li'));

  if (allSectionItems.length > 5) {
    // Remove items after #5
    allSectionItems.slice(5).forEach(li => li.remove());
  }

  // ----- Add our custom “See more →” -----
  if (categoryUrl && allSectionItems.length > 5) {
    const seeMore = document.createElement('li');
    const a = document.createElement('a');
    a.href = categoryUrl;
    a.textContent = "See more";
    a.className = 'block py-1 hilti-red';
    seeMore.appendChild(a);
    sectionUl.appendChild(seeMore);
  }

  // ----- Apply Hilti red style -----
  sectionUl.classList.add('hilti-section-list');
  sectionUl.querySelectorAll('a').forEach(a => a.classList.add('block', 'py-1'));

});

/* ============================================================================
 *  GLOBAL EMPTY STATE HANDLER (FINAL WORKING VERSION)
 *  Author: Janardhanan Kalidas
 *  Date: 11-Mar-2026
 * ============================================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const emptyStateIcon =
    (window.Theme && window.Theme.assets && window.Theme.assets.emptyStateIcon) || "";

  /* 1. Detect all occurrences of the literal "empty" text printed by Zendesk */
  const emptyElements = document.querySelectorAll(
    "p, div, span, li, .section-empty, .no-articles"
  );

  emptyElements.forEach(el => {

    if (el.textContent.trim() !== "empty") return;

    /* 2. Remove the raw "empty" text */
    el.textContent = "";

    /* 3. Create the replacement empty-state block */
    const container = document.createElement("div");
    container.className = "empty-state";

    container.innerHTML = [
      emptyStateIcon
        ? `<img src="${emptyStateIcon}" class="empty-state__icon" alt="No articles icon">`
        : "",
      '<div class="empty-state__text">No articles yet</div>'
    ].join("");

    /* 4. Insert right below the section heading (H1 or H2) if present */
    const parentSection = el.closest(".col-12, .col-12.mb-4, .section, .article-list, main, body");

    const header = parentSection?.querySelector("h1, h2, h3");

    if (header) {
      header.insertAdjacentElement("afterend", container);
    } else {
      el.insertAdjacentElement("afterend", container);
    }

    /* 5. Hide any empty UL within the same section */
    const ul = parentSection?.querySelector("ul");
    if (ul && ul.children.length === 0) {
      ul.style.display = "none";
    }

  });

});

/* ============================================================
   Category Sidebar – Correct Show All / Show Less Logic
   ------------------------------------------------------------
   Fixes:
   - Show only first 5 items initially
   - "Show all categories" appears after 5th item
   - On expand → ALL categories visible
   - "Show less" moves to END of list
   - On collapse → link moves back after 5th item

   Author: Kalidas Janardhanan
   Created: 09-Apr-2026 12:05 IST (GMT+05:30)
   ============================================================ */
/* ============================================================
   Sidebar Expand / Collapse – Category + Section Pages
   ------------------------------------------------------------
   Behaviour:
   - Show first 5 items initially
   - Animate expand / collapse
   - Auto-expand if active item is hidden
   - Same logic for category & section pages
   - No Zendesk View more button
   - No redirects, no templates

   Author: Kalidas Janardhanan
   Date: 09-Apr-2026 (GMT+05:30)
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  const isCategoryPage =
    document.documentElement.classList.contains('category-page');
  const isSectionPage =
    document.documentElement.classList.contains('section-page');

  if (!isCategoryPage && !isSectionPage) return;

  const observer = new MutationObserver(() => {
    const list = document.querySelector('.cards-wrapper ul');
    if (!list || list.dataset.expandReady) return;

    const items = Array.from(list.querySelectorAll('li'));
    if (items.length <= 5) return;

    list.dataset.expandReady = 'true';

    /* Find active item (category or section) */
    const activeLink =
      list.querySelector('a[aria-current="page"]') ||
      list.querySelector('.font-bold');

    const activeIndex = activeLink
      ? items.findIndex(li => li.contains(activeLink))
      : -1;

    /* Measure heights */
    const collapsedHeight = items
      .slice(0, 5)
      .reduce((h, li) => h + li.offsetHeight, 0);

    const expandedHeight = items.reduce(
      (h, li) => h + li.offsetHeight,
      0
    );

    /* Create toggle link */
    const toggle = document.createElement('a');
    toggle.href = '#';
    toggle.className = 'category-toggle-link';
    toggle.setAttribute('aria-expanded', 'false');

    list.parentNode.appendChild(toggle);

    /* Auto-expand if active item is hidden */
    const autoExpand = activeIndex >= 5;

    if (autoExpand) {
      list.style.height = expandedHeight + 'px';
      toggle.textContent = 'Show less';
      toggle.setAttribute('aria-expanded', 'true');
    } else {
      list.style.height = collapsedHeight + 'px';
      toggle.textContent = 'See all categories';
    }

    /* Toggle click */
    toggle.addEventListener('click', function (e) {
      e.preventDefault();

      const expanded =
        toggle.getAttribute('aria-expanded') === 'true';

      // Force reflow to ensure animation
      list.style.height = expanded
        ? expandedHeight + 'px'
        : collapsedHeight + 'px';
      list.offsetHeight;

      requestAnimationFrame(() => {
        list.style.height = expanded
          ? collapsedHeight + 'px'
          : expandedHeight + 'px';
      });

      toggle.textContent = expanded
        ? 'See all categories'
        : 'Show less';

      toggle.setAttribute('aria-expanded', String(!expanded));
    });

    observer.disconnect();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
});

/* ============================================================
   HILTI LANGUAGE SWITCHER MODAL
   - Opens on globe icon click in header
   - Closes on X, overlay click, or ESC
   - Focus trap for accessibility
   ============================================================ */
;(function () {
  'use strict';

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  onReady(function () {
    var trigger = document.getElementById('hiltiLangTrigger');
    var overlay = document.getElementById('hiltiLangOverlay');
    var closeBtn = document.getElementById('hiltiLangClose');

    if (!trigger || !overlay) return;

    // Set header label to region keyword based on current locale URL
    var langLabel = trigger.querySelector('.hilti-lang-label');
    if (langLabel) {
      langLabel.textContent = /\/hc\/en-gb(?:\/|$)/i.test(window.location.pathname) ? 'EU' : 'ACI';
    }

    // Build the redirect URL for a given locale code
    function buildLocaleUrl(locale) {
      return window.location.href.replace(
        /(\/hc\/)[a-z]{2}(-[a-z0-9]+)?(?=\/|$|\?|#)/i,
        '$1' + locale
      );
    }

    // Inject a <link rel="prefetch"> so the browser fetches the target page
    // in the background before the user clicks — reduces perceived load time
    function prefetchLocale(locale) {
      var url = buildLocaleUrl(locale);
      if (!url || url === window.location.href) return;
      var id = 'hilti-prefetch-' + locale;
      if (document.getElementById(id)) return; // already queued
      var link = document.createElement('link');
      link.id   = id;
      link.rel  = 'prefetch';
      link.href = url;
      document.head.appendChild(link);
    }

    // Prefetch both locales as soon as the user hovers the globe button
    trigger.addEventListener('mouseenter', function () {
      prefetchLocale('en-us');
      prefetchLocale('en-gb');
    }, { once: true });

    function openModal() {
      // Prefetch all available locale options when the modal opens (backup)
      overlay.querySelectorAll('[data-locale]').forEach(function (el) {
        prefetchLocale(el.getAttribute('data-locale'));
      });

      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      // Mark the currently active keyword
      var currentLocale = ((window.location.pathname.match(/\/hc\/([a-z]{2}(?:-[a-z0-9]+)?)(?:\/|$)/i) || [])[1] || 'en-us').toLowerCase();
      overlay.querySelectorAll('.hilti-region-toggle[data-locale]').forEach(function (a) {
        a.classList.toggle('is-active', a.getAttribute('data-locale') === currentLocale);
      });

      // Focus the active keyword, or the first one
      var focusTarget = overlay.querySelector('.hilti-region-toggle.is-active') ||
                        overlay.querySelector('.hilti-region-toggle');
      if (focusTarget) focusTarget.focus();
    }

    function closeModal() {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      trigger.focus();
    }

    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      openModal();
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    // Close on backdrop click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    // Close on ESC
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
        closeModal();
      }
    });

    // Keyword click → show loading bar + redirect
    // ─────────────────────────────────────────────────────────────────────
    // FUTURE: When sub-languages are added under ACI or EU (see header.hbs),
    // swap each keyword <a data-locale="..."> for a toggle button +
    // <ul class="hilti-region-suboptions"> with one <a data-locale="...">
    // per language. This handler already targets any [data-locale] element
    // — no JS changes needed when adding sub-languages.
    //
    // Suggested future locales:
    //   ACI: 'es-419' (Spanish LatAm), 'pt-br' (Portuguese BR)
    //   EU : 'de' (German), 'fr' (French), 'es-es' (Spanish ES)
    // ─────────────────────────────────────────────────────────────────────
    overlay.addEventListener('click', function (e) {
      var option = e.target.closest('[data-locale]');
      if (!option) return;
      e.preventDefault();
      var locale = option.getAttribute('data-locale');
      if (!locale) return;

      // Close modal immediately for instant feedback
      closeModal();

      // Show a red progress bar at the top of the page for visual feedback
      var bar = document.createElement('div');
      bar.className = 'hilti-page-loading-bar';
      document.body.appendChild(bar);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { bar.classList.add('is-animating'); });
      });

      window.location.href = buildLocaleUrl(locale);
    });

    /* ---------------------------------------------------------
       Remove sidebar category limit (show all categories)
    --------------------------------------------------------- */
    (function expandAllSidebarItems() {
      var sidebarNav = document.querySelector('[data-element="navigation"]');
      if (!sidebarNav) return;

      // Remove the is-collapsed class and inline height from the list
      var collapsedList = sidebarNav.querySelector('ul.is-collapsed, ul[style*="height"]');
      if (collapsedList) {
        collapsedList.classList.remove('is-collapsed');
        collapsedList.style.height = 'auto';
        collapsedList.style.maxHeight = 'none';
        collapsedList.style.overflow = 'visible';
      }

      // Hide the Show more/Show less toggle link
      var toggleLink = sidebarNav.querySelector('.category-toggle-link');
      if (toggleLink) {
        toggleLink.style.display = 'none';
      }
    })();
  });
})();

/* ---------------------------------------------------------
   Sidebar expand – runs after Zendesk injects navigation
   (navigation is rendered dynamically, after DOMContentLoaded)
--------------------------------------------------------- */
;(function () {
  function expandSidebar() {
    var sidebarNav = document.querySelector('[data-element="navigation"]');
    if (!sidebarNav) return;

    var collapsedList = sidebarNav.querySelector('ul.is-collapsed, ul[style*="height"]');
    if (collapsedList) {
      collapsedList.classList.remove('is-collapsed');
      collapsedList.style.cssText += '; height: auto !important; max-height: none !important; overflow: visible !important;';
    }

    var toggleLink = sidebarNav.querySelector('.category-toggle-link');
    if (toggleLink) {
      toggleLink.style.display = 'none';
    }
  }

  // Run at 300ms and 800ms to catch Zendesk's async navigation render
  setTimeout(expandSidebar, 300);
  setTimeout(expandSidebar, 800);
})();

/* ============================================================
   SEARCH RESULTS PAGE - Functionality
   Clean query display, keyword highlighting, sorting, filtering
============================================================ */
;(function() {
  'use strict';

  function initSearchResults() {
    // Run exactly once — the DOMContentLoaded path and the setTimeout fallbacks all
    // call this function; the flag stops the 2nd and 3rd calls from doing anything.
    if (initSearchResults._ran) return;

    // Only run on search results page
    var searchContainer = document.querySelector('[data-search-query]');
    if (!searchContainer) return;

    initSearchResults._ran = true;

    var rawQuery = searchContainer.getAttribute('data-search-query') || '';
    var helpCenterUrl = searchContainer.getAttribute('data-help-center-url') || '';
    
    // Clean query by removing sort keywords
    function cleanQuery(query) {
      return query
        .replace(/\s*order_by:\w+/g, '')
        .replace(/\s*sort:(asc|desc)/g, '')
        .trim();
    }

    // 1. Clean the query display in title and search bar
    var cleanedQuery = cleanQuery(rawQuery);

    // Shared metadata populated from the Zendesk search API once it responds.
    // buildPaginationUI reads this for accurate per-page and page-count values.
    var searchMeta = { perPage: null, totalPages: null, totalResults: null };

    document.querySelectorAll('.hc-clean-query').forEach(function(el) {
      el.textContent = cleanedQuery;
    });

    // 2. Highlight search keywords in results
    if (cleanedQuery) {
      var keywords = cleanedQuery.split(/\s+/).filter(function(k) { return k.length > 2; });
      if (keywords.length) {
        var pattern = new RegExp('(' + keywords.map(function(k) {
          return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('|') + ')', 'gi');
        
        document.querySelectorAll('.hc-result-title a, .hc-result-snippet').forEach(function(el) {
          var html = el.innerHTML;
          el.innerHTML = html.replace(pattern, '<mark class="hc-highlight">$1</mark>');
        });
      }
    }

    // 3. Sort dropdown - client-side sorting by timestamp
    var sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', function(e) {
        var resultsList = document.querySelector('.hc-results-list');
        if (!resultsList) return;
        
        var resultCards = Array.from(resultsList.querySelectorAll('.hc-result-card'));
        if (resultCards.length === 0) return;
        
        if (this.value === 'recent') {
          // Sort by most recent - extract timestamps and sort descending
          resultCards.sort(function(a, b) {
            var timeA = a.querySelector('.hc-result-meta time');
            var timeB = b.querySelector('.hc-result-meta time');
            
            if (!timeA || !timeB) return 0;
            
            var dateA = new Date(timeA.getAttribute('datetime'));
            var dateB = new Date(timeB.getAttribute('datetime'));
            
            return dateB - dateA; // Descending order (most recent first)
          });
          
          // Re-append sorted cards to the list
          resultCards.forEach(function(card) {
            resultsList.appendChild(card);
          });
        } else {
          // Sort by relevance - reload page with clean query
          var baseUrl = helpCenterUrl + (helpCenterUrl.endsWith('/') ? '' : '/') + 'search';
          var newUrl = baseUrl + '?utf8=%E2%9C%93&query=' + encodeURIComponent(cleanedQuery);
          window.location.href = newUrl;
        }
      });
    }

    // Reset button — clear persisted filter state then navigate to the clean query URL.
    // Clearing sessionStorage before navigation means the page that loads won't re-apply
    // any previously saved filters.
    var resetBtn = document.querySelector('.hc-sidebar-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function(e) {
        e.preventDefault();
        try { sessionStorage.removeItem('search_filters:' + cleanedQuery); } catch (ex) {}
        var base = helpCenterUrl + (helpCenterUrl.endsWith('/') ? '' : '/') + 'search';
        window.location.href = base + '?utf8=%E2%9C%93&query=' + encodeURIComponent(cleanedQuery);
      });
    }

    // 4. Build category and section filters with client-side filtering across all pages
    var catList = document.getElementById('hc-category-list');
    var catSection = document.getElementById('hc-category-filter');
    var secList = document.getElementById('hc-section-list');
    var secSection = document.getElementById('hc-section-filter');

    // Helper: parse results from a document (current or fetched)
    function parseResultsFromDoc(doc) {
      var rows = [];
      var cards = doc.querySelectorAll('.hc-result-card');
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var link = card.querySelector('.hc-result-title a');
        var url = link ? link.getAttribute('href') : (card.dataset && card.dataset.url) || null;
        var catLinks = card.querySelectorAll('.hc-result-category .hc-category-link');
        // Use last-2 links for category, last-1 for section to handle optional Help-Center root prefix
        var category = catLinks.length >= 2 ? catLinks[catLinks.length - 2].textContent.trim() : (catLinks.length === 1 ? catLinks[0].textContent.trim() : null);
        var section   = catLinks.length >= 2 ? catLinks[catLinks.length - 1].textContent.trim() : null;
        rows.push({ url: url, category: category, section: section });
      }
      return rows;
    }

    // Build filters from current page only (used as fallback)
    function buildFiltersFromCurrentPage() {
      var rows = parseResultsFromDoc(document);
      buildFilters(rows);
    }

    // Saved DOM state from immediately before the first filter was applied.
    // null means a filter has never been active — in that case the DOM is never touched.
    var savedBeforeFilter = null;

    // Re-apply keyword highlight marks after dynamic HTML injection
    function applyHighlights() {
      if (!cleanedQuery) return;
      var kw = cleanedQuery.split(/\s+/).filter(function(k){ return k.length > 2; });
      if (!kw.length) return;
      var pat = new RegExp('(' + kw.map(function(k){ return k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }).join('|') + ')', 'gi');
      // Target the <a> inside the title (not the <h2>) so the href attribute is never touched.
      // The snippet is a plain <p> with no child elements, so it is safe to replace directly.
      document.querySelectorAll('.hc-result-title a, .hc-result-snippet').forEach(function(el) {
        el.innerHTML = el.innerHTML.replace(pat, '<mark class="hc-highlight">$1</mark>');
      });
    }

    // Render a single result card from API row data
    function renderArticleCard(r) {
      function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
      var date = '';
      if (r.updatedAt) {
        try { date = new Date(r.updatedAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}); } catch(e){}
      }
      var breadcrumb = '';
      if (r.category && r.section) {
        breadcrumb = '<div class="hc-result-category"><a class="hc-category-link">' + esc(r.category) + '</a><span class="hc-category-separator">›</span><a class="hc-category-link">' + esc(r.section) + '</a></div>';
      } else if (r.section) {
        breadcrumb = '<div class="hc-result-category"><a class="hc-category-link">' + esc(r.section) + '</a></div>';
      }
      return '<article class="hc-result-card">' +
        '<h2 class="hc-result-title"><a href="' + esc(r.url) + '" class="hc-result-link">' + esc(r.title) + '</a></h2>' +
        breadcrumb +
        (r.snippet ? '<p class="hc-result-snippet">' + esc(r.snippet) + '</p>' : '') +
        '<div class="hc-result-meta">' +
          '<span class="hc-meta-item"><svg class="hc-meta-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="14" height="14" aria-hidden="true"><circle cx="6" cy="6" r="5.5" fill="none" stroke="currentColor"/><path stroke="currentColor" stroke-linecap="round" d="M6 3v3.5L8 8"/></svg>Updated ' + esc(date) + '</span>' +
          (r.voteSum ? '<span class="hc-meta-item">' + r.voteSum + ' helpful</span>' : '') +
          (r.commentCount ? '<span class="hc-meta-item">' + r.commentCount + ' comments</span>' : '') +
        '</div>' +
      '</article>';
    }

    // Compute which page numbers to show (always first, last, ±2 around current, with ... gaps).
    // Defined at initSearchResults scope so both buildPaginationUI and filtered pagination share it.
    function pageRange(cur, total) {
      var pages = [];
      var delta = 2;
      var left  = cur - delta;
      var right = cur + delta;
      var prev  = null;
      for (var i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= left && i <= right)) {
          if (prev !== null && i - prev > 1) pages.push('...');
          pages.push(i);
          prev = i;
        }
      }
      return pages;
    }

    // Fetch ALL search result articles via Zendesk JSON API, mapping section/category names.
    // Using the JSON API avoids triggering Cloudflare's bot-detection that fires on HTML fetches.
    function buildFiltersViaAPI() {
      var apiOrigin = window.location.origin;
      var localeMatch = window.location.pathname.match(/\/hc\/([^/]+)\//);
      var locale = localeMatch ? localeMatch[1] : 'en-us';

      function fetchJson(url) {
        return fetch(url, { 
          credentials: 'same-origin',
          headers: { 
            'Accept': 'application/json', 
            'X-Requested-With': 'XMLHttpRequest' 
          } 
        }).then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); });
      }

      // Fetch categories and sections in parallel to build ID→name lookup maps
      Promise.all([
        fetchJson(apiOrigin + '/api/v2/help_center/categories.json?per_page=100'),
        fetchJson(apiOrigin + '/api/v2/help_center/sections.json?per_page=100')
      ]).then(function(results) {
        var categoryMap = {};  // id → name
        var sectionMap  = {};  // id → { name, categoryId }
        (results[0].categories || []).forEach(function(c) { categoryMap[c.id] = c.name; });
        (results[1].sections   || []).forEach(function(s) { sectionMap[s.id] = { name: s.name, categoryId: s.category_id }; });

        // Fetch all search result pages via API (up to 100 results per request)
        var allRows = {};
        var searchBase = apiOrigin + '/api/v2/help_center/articles/search.json?locale='
                       + encodeURIComponent(locale) + '&per_page=100&query=' + encodeURIComponent(cleanedQuery);

        function mapArticle(article) {
          var sec = sectionMap[article.section_id] || null;
          // Strip HTML tags from snippet/body for safe text rendering
          function plainText(str) { return str ? str.replace(/<[^>]+>/g, '') : ''; }
          return {
            url:          article.html_url || null,
            title:        article.title    || '',
            snippet:      plainText(article.snippet || article.body || '').slice(0, 300),
            updatedAt:    article.updated_at || article.created_at || '',
            voteSum:      article.vote_sum      || 0,
            commentCount: article.comment_count || 0,
            category:     sec ? (categoryMap[sec.categoryId] || null) : null,
            section:      sec ? sec.name : null
          };
        }

        fetchJson(searchBase + '&page=1').then(function(data) {
          (data.results || []).forEach(function(a) { if (a.html_url) allRows[a.html_url] = mapArticle(a); });

          // Store total result count from the API.
          // Do NOT use data.per_page or data.page_count — those reflect our per_page=100
          // request, not the Zendesk front-end per_page. Let buildPaginationUI infer perPage
          // from the DOM card count so the page numbers match what Zendesk actually renders.
          searchMeta.totalResults = data.count || null;
          buildPaginationUI(); // re-render with accurate values

          var totalPages = data.page_count || 1;
          var moreFetches = [];
          for (var p = 2; p <= Math.min(totalPages, 10); p++) {
            (function(pn) {
              moreFetches.push(fetchJson(searchBase + '&page=' + pn).then(function(d) {
                (d.results || []).forEach(function(a) { if (a.html_url) allRows[a.html_url] = mapArticle(a); });
              }).catch(function() {}));
            })(p);
          }

          Promise.all(moreFetches).then(function() {
            var allApiRows = Object.values(allRows);
            // Counts must reflect the current page only (what's visible after filtering)
            // so the badge numbers always match what appears when a filter is clicked.
            var currentPageRows = parseResultsFromDoc(document);
            if (allApiRows.length) {
              buildFilters(allApiRows, currentPageRows);
            } else {
              buildFiltersFromCurrentPage();
            }
          });
        }).catch(function() { buildFiltersFromCurrentPage(); });

      }).catch(function() {
        // API unavailable — fall back to current page HTML
        buildFiltersFromCurrentPage();
      });
    }

    // Build filter UI.
    // rows      = full list (all pages via API) — used to discover all category/section names.
    // pageRows  = current page results — used for count badges so numbers match after filtering.
    //             If omitted, rows is used for both.
    function buildFilters(rows, pageRows) {
      var storageKey = 'search_filters:' + cleanedQuery;
      var storedSelections;
      try { storedSelections = JSON.parse(sessionStorage.getItem(storageKey)) || {}; } catch (e) { storedSelections = {}; }
      var storedCats = storedSelections.categories || [];
      var storedSecs = storedSelections.sections || [];

      // Counts from the full API result set so badges reflect total across all pages.
      var countSource = rows;
      var categoryCounts = {};
      var sectionCounts  = {};
      countSource.forEach(function(r) {
        if (r.category) categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
        if (r.section)  sectionCounts[r.section]   = (sectionCounts[r.section]   || 0) + 1;
      });

      function makeItem(value, count, extraClass, storedList) {
        var li    = document.createElement('li');   li.className = 'hc-filter-item';
        var label = document.createElement('label'); label.className = 'hc-filter-link';
        var input = document.createElement('input');
        input.type = 'checkbox'; input.className = 'hc-filter-input ' + extraClass; input.value = value;
        var box     = document.createElement('span'); box.className = 'hc-filter-checkbox'; box.setAttribute('aria-hidden','true');
        var nameEl  = document.createElement('span'); nameEl.className = 'hc-filter-name'; nameEl.textContent = value;
        var countEl = document.createElement('span'); countEl.className = 'hc-filter-count'; countEl.textContent = '(' + count + ')';
        label.appendChild(input); label.appendChild(box); label.appendChild(nameEl); label.appendChild(countEl);
        li.appendChild(label);
        if (storedList.indexOf(value) > -1) {
          input.checked = true;
          label.classList.add('hc-filter-active');
          box.classList.add('is-checked');
        }
        // Toggle active styling when checkbox changes
        input.addEventListener('change', function() {
          label.classList.toggle('hc-filter-active', input.checked);
          box.classList.toggle('is-checked', input.checked);
        });
        return li;
      }

      // Enumerate ALL categories/sections from the full result set (all pages via API).
      // Counts come from countSource (current page) so they match what appears after filtering.
      var allCategories = {};
      var allSections   = {};
      rows.forEach(function(r) {
        if (r.category) allCategories[r.category] = true;
        if (r.section)  allSections[r.section]   = true;
      });

      // Populate category list
      if (catList && catSection) {
        catList.innerHTML = '';
        var cats = Object.keys(allCategories).sort();
        catSection.style.display = cats.length ? '' : 'none';
        cats.forEach(function(cat) {
          catList.appendChild(makeItem(cat, categoryCounts[cat] || 0, 'hc-category-input', storedCats));
        });
      }

      // Populate section list
      if (secList && secSection) {
        secList.innerHTML = '';
        var secs = Object.keys(allSections).sort();
        secSection.style.display = secs.length ? '' : 'none';
        secs.forEach(function(sec) {
          secList.appendChild(makeItem(sec, sectionCounts[sec] || 0, 'hc-section-input', storedSecs));
        });
      }

      function updateDependentLists() {
        var selectedCats = Array.from(catList ? catList.querySelectorAll('.hc-category-input:checked') : []).map(function(i){ return i.value; });
        var selectedSecs = Array.from(secList ? secList.querySelectorAll('.hc-section-input:checked') : []).map(function(i){ return i.value; });

        var resultsList = document.querySelector('.hc-results-list');
        var paginationWrapper = document.querySelector('.hc-pagination-wrapper');

        if (!selectedCats.length && !selectedSecs.length) {
          // No filter — only restore the DOM if we previously entered filter mode.
          // If savedBeforeFilter is null a filter was never applied, so leave every
          // other theme component (pagination, highlights, sort) completely untouched.
          if (savedBeforeFilter !== null) {
            if (resultsList)       resultsList.innerHTML       = savedBeforeFilter.results;
            if (paginationWrapper) paginationWrapper.innerHTML = savedBeforeFilter.pagination;
            savedBeforeFilter = null;
            applyHighlights();
            buildPaginationUI();
          }
        } else {
          // Filter active — snapshot the live DOM the first time a filter is applied.
          if (savedBeforeFilter === null) {
            var fpCards = document.querySelectorAll('.hc-result-card').length;
            var fpTotal = searchMeta.totalResults || 0;
            savedBeforeFilter = {
              results:    resultsList        ? resultsList.innerHTML        : '',
              pagination: paginationWrapper  ? paginationWrapper.innerHTML  : '',
              perPage:    (fpTotal > fpCards && fpCards > 0) ? fpCards : 25
            };
          }

          // All matching articles from the full API result set
          var matching = rows.filter(function(r) {
            var okCat = !selectedCats.length || selectedCats.indexOf(r.category) > -1;
            var okSec = !selectedSecs.length || selectedSecs.indexOf(r.section)   > -1;
            return okCat && okSec;
          });

          // Render one page of filtered results with client-side pagination.
          function renderFilteredPage(matchArr, page) {
            var pp      = (savedBeforeFilter && savedBeforeFilter.perPage) || 25;
            var totalFP = Math.ceil(matchArr.length / pp);
            page        = Math.max(1, Math.min(page, totalFP || 1));
            var start   = (page - 1) * pp;
            var slice   = matchArr.slice(start, start + pp);

            if (resultsList) {
              if (matchArr.length) {
                resultsList.innerHTML = slice.map(renderArticleCard).join('');
                applyHighlights();
              } else {
                resultsList.innerHTML = '<div class="hc-empty-state"><h2 class="hc-empty-title">No results for this filter</h2><p class="hc-empty-text">Try removing a filter to broaden your search.</p></div>';
              }
            }

            if (!paginationWrapper) return;
            if (totalFP <= 1) { paginationWrapper.innerHTML = ''; return; }

            // Client-side pagination nav (buttons — no page reload)
            var ph = '<nav class="hc-page-nav" role="navigation" aria-label="Filtered results pagination">';
            if (page > 1) {
              ph += '<button type="button" class="hc-page-btn hc-page-prev" data-fp="' + (page - 1) + '" aria-label="Previous page">&#8592; Prev</button>';
            } else {
              ph += '<span class="hc-page-btn hc-page-prev hc-page-disabled" aria-disabled="true">&#8592; Prev</span>';
            }
            ph += '<span class="hc-page-numbers">';
            pageRange(page, totalFP).forEach(function(p) {
              if (p === '...') {
                ph += '<span class="hc-page-ellipsis">&#8230;</span>';
              } else if (p === page) {
                ph += '<span class="hc-page-btn hc-page-current" aria-current="page">' + p + '</span>';
              } else {
                ph += '<button type="button" class="hc-page-btn" data-fp="' + p + '" aria-label="Page ' + p + '">' + p + '</button>';
              }
            });
            ph += '</span>';
            if (page < totalFP) {
              ph += '<button type="button" class="hc-page-btn hc-page-next" data-fp="' + (page + 1) + '" aria-label="Next page">Next &#8594;</button>';
            } else {
              ph += '<span class="hc-page-btn hc-page-next hc-page-disabled" aria-disabled="true">Next &#8594;</span>';
            }
            ph += '</nav>';
            paginationWrapper.innerHTML = ph;

            paginationWrapper.querySelectorAll('button[data-fp]').forEach(function(btn) {
              btn.addEventListener('click', function() {
                renderFilteredPage(matchArr, parseInt(btn.getAttribute('data-fp'), 10));
                var anchor = document.querySelector('.hc-search-main') || resultsList;
                if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
              });
            });
          }

          renderFilteredPage(matching, 1);
        }

        // Update section counts based on selected categories
        if (secList) {
          if (selectedCats.length) {
            var secCountsInCats = {};
            rows.forEach(function(r) { if (selectedCats.indexOf(r.category) > -1 && r.section) secCountsInCats[r.section] = (secCountsInCats[r.section] || 0) + 1; });
            secList.querySelectorAll('.hc-filter-item').forEach(function(li) {
              var name = li.querySelector('.hc-filter-name').textContent;
              var n = secCountsInCats[name];
              li.style.display = n ? '' : 'none';
              if (n) li.querySelector('.hc-filter-count').textContent = '(' + n + ')';
            });
          } else {
            secList.querySelectorAll('.hc-filter-item').forEach(function(li) {
              var name = li.querySelector('.hc-filter-name').textContent;
              li.style.display = '';
              li.querySelector('.hc-filter-count').textContent = '(' + (sectionCounts[name] || 0) + ')';
            });
          }
        }

        // Update category counts based on selected sections
        if (catList) {
          if (selectedSecs.length) {
            var catCountsInSecs = {};
            rows.forEach(function(r) { if (selectedSecs.indexOf(r.section) > -1 && r.category) catCountsInSecs[r.category] = (catCountsInSecs[r.category] || 0) + 1; });
            catList.querySelectorAll('.hc-filter-item').forEach(function(li) {
              var name = li.querySelector('.hc-filter-name').textContent;
              var n = catCountsInSecs[name];
              li.style.display = n ? '' : 'none';
              if (n) li.querySelector('.hc-filter-count').textContent = '(' + n + ')';
            });
          } else {
            catList.querySelectorAll('.hc-filter-item').forEach(function(li) {
              var name = li.querySelector('.hc-filter-name').textContent;
              li.style.display = '';
              li.querySelector('.hc-filter-count').textContent = '(' + (categoryCounts[name] || 0) + ')';
            });
          }
        }

        // Persist selections to sessionStorage
        try {
          var saveCats = Array.from(catList ? catList.querySelectorAll('.hc-category-input:checked') : []).map(function(i){ return i.value; });
          var saveSecs = Array.from(secList ? secList.querySelectorAll('.hc-section-input:checked') : []).map(function(i){ return i.value; });
          sessionStorage.setItem(storageKey, JSON.stringify({ categories: saveCats, sections: saveSecs }));
        } catch (e) {}
      } // end updateDependentLists

      // Wire change handlers
      if (catList) catList.addEventListener('change', updateDependentLists);
      if (secList) secList.addEventListener('change', updateDependentLists);

      // Apply any restored selections immediately
      updateDependentLists();
    } // end buildFilters

    // 5. Build numbered pagination UI
    // Uses searchMeta (populated by the API call) for accurate per-page / page-count.
    // Falls back to DOM-based detection on first synchronous call.
    function buildPaginationUI() {
      var wrapper = document.querySelector('.hc-pagination-wrapper');
      if (!wrapper) return;

      var urlParams   = new URLSearchParams(window.location.search);
      var currentPage = parseInt(urlParams.get('page') || '1', 10);

      // --- Determine perPage ---
      // 1. API value (most reliable)
      // 2. Card count on page 1 (page 1 is always fully packed)
      // 3. Infer from current page + card count when not on page 1
      var currentCardCount = document.querySelectorAll('.hc-result-card').length;
      var perPage;
      if (searchMeta.perPage) {
        perPage = searchMeta.perPage;
      } else if (currentPage === 1) {
        // On page 1 the card count equals the per-page limit (unless it's the only page)
        perPage = currentCardCount || 25;
      } else {
        // On a later page we can't measure perPage from DOM alone;
        // use 25 until the API call fills in the real value.
        perPage = 25;
      }

      // --- Determine totalResults ---
      var totalResults = searchMeta.totalResults || 0;
      if (!totalResults) {
        var strongEl = document.querySelector('.hc-results-title strong');
        if (strongEl) totalResults = parseInt(strongEl.textContent.replace(/[^0-9]/g, ''), 10) || 0;
      }

      // --- Determine totalPages ---
      var totalPages = searchMeta.totalPages || (totalResults ? Math.ceil(totalResults / perPage) : 0);

      // Hide pagination when all results fit on one page
      if (!totalResults || totalResults <= perPage || totalPages <= 1) {
        wrapper.innerHTML = '';
        return;
      }

      // Build URL for a given page number
      function pageUrl(n) {
        var p = new URLSearchParams(window.location.search);
        if (n === 1) { p.delete('page'); } else { p.set('page', String(n)); }
        var qs = p.toString();
        return window.location.pathname + (qs ? '?' + qs : '') + '#results';
      }

      // pageRange is defined at initSearchResults scope (shared with filtered pagination)

      // Render
      var html = '<nav class="hc-page-nav" role="navigation" aria-label="Pagination">';
      // Prev
      if (currentPage > 1) {
        html += '<a class="hc-page-btn hc-page-prev" href="' + pageUrl(currentPage - 1) + '" aria-label="Previous page">&#8592; Prev</a>';
      } else {
        html += '<span class="hc-page-btn hc-page-prev hc-page-disabled" aria-disabled="true">&#8592; Prev</span>';
      }
      // Page numbers
      html += '<span class="hc-page-numbers">';
      pageRange(currentPage, totalPages).forEach(function(p) {
        if (p === '...') {
          html += '<span class="hc-page-ellipsis">&#8230;</span>';
        } else if (p === currentPage) {
          html += '<span class="hc-page-btn hc-page-current" aria-current="page">' + p + '</span>';
        } else {
          html += '<a class="hc-page-btn" href="' + pageUrl(p) + '" aria-label="Page ' + p + '">' + p + '</a>';
        }
      });
      html += '</span>';
      // Next
      if (currentPage < totalPages) {
        html += '<a class="hc-page-btn hc-page-next" href="' + pageUrl(currentPage + 1) + '" aria-label="Next page">Next &#8594;</a>';
      } else {
        html += '<span class="hc-page-btn hc-page-next hc-page-disabled" aria-disabled="true">Next &#8594;</span>';
      }
      html += '</nav>';

      wrapper.innerHTML = html;
    }

    buildPaginationUI();

    // Guard: buildFiltersViaAPI must run at most once per page load.
    // Both the MutationObserver and the 2-second safety timeout call triggerBuildFilters;
    // the flag ensures only the first one actually starts the fetch.
    var filtersBuildStarted = false;
    function triggerBuildFilters() {
      if (filtersBuildStarted) return;
      filtersBuildStarted = true;
      
      // Skip API calls in local preview mode to avoid triggering Cloudflare security checks
      var isLocalPreview = window.location.pathname.indexOf('/admin/local_preview/') > -1;
      if (isLocalPreview) {
        buildFiltersFromCurrentPage();
      } else {
        buildFiltersViaAPI();
      }
    }

    // Trigger filter build once result cards exist in the DOM
    if (document.querySelector('.hc-results-list .hc-result-card')) {
      triggerBuildFilters();
    } else {
      var resultsContainer = document.querySelector('.hc-results-list') || searchContainer;
      var buildObserver = new MutationObserver(function(muts, o) {
        if (document.querySelector('.hc-results-list .hc-result-card')) {
          o.disconnect();
          triggerBuildFilters();
        }
      });
      buildObserver.observe(resultsContainer, { childList: true, subtree: true });
      // Safety fallback in case cards arrive after the observer is set up
      setTimeout(triggerBuildFilters, 2000);
    }
  }

  // Run on DOMContentLoaded (or immediately if already loaded).
  // A short safety timeout handles themes that inject result cards after DOMContentLoaded.
  // The _ran guard inside initSearchResults ensures only the first successful call does work.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearchResults);
  } else {
    initSearchResults();
  }
  setTimeout(initSearchResults, 500); // safety net for late-rendered content
})();


/* ----------------------------------------------------------
   Auth-required elements: hide submit-a-request links
   for anonymous users. Uses Zendesk's HelpCenter.user API.
---------------------------------------------------------- */
;(function () {
  function applyAuthVisibility() {
    var user = window.HelpCenter && window.HelpCenter.user;
    var isSignedIn = !!(user && (user.email || user.identifier || user.id));
    if (isSignedIn) {
      document.documentElement.classList.add('is-signed-in');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAuthVisibility, { once: true });
  } else {
    applyAuthVisibility();
  }
})();

/* ----------------------------------------------------------
   Submit a request — redirect anonymous users to sign-in
   Intercepts any link to /requests/new for non-signed-in users
---------------------------------------------------------- */
;(function () {
  function interceptRequestLinks() {
    var user = window.HelpCenter && window.HelpCenter.user;
    var isSignedIn = !!(user && (user.email || user.identifier || user.id));
    if (isSignedIn) return;

    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href]');
      if (!link) return;
      if (link.href.indexOf('/requests/new') === -1) return;
      e.preventDefault();
      var returnTo = encodeURIComponent(link.href);
      window.location.href = '/access/unauthenticated?return_to=' + returnTo;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', interceptRequestLinks, { once: true });
  } else {
    interceptRequestLinks();
  }
})();

