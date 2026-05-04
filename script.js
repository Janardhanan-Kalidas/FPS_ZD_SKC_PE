/* ============================================================
  JANA Hilti Help Center – script.js (clean, production-ready)
   Notes:
   - Self-contained blocks (IIFEs) + leading semicolon to avoid leakage
   - Works even if content is injected late (CSR/SPA)
   - View More/Less is selector-agnostic and ARIA-friendly
   - Keeps all original features from your file
============================================================ */

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



