/* ============================================================
  JANA Hilti Help Center – script.js (clean, production-ready)
   Notes:
   - Self-contained blocks (IIFEs) + leading semicolon to avoid leakage
   - Works even if content is injected late (CSR/SPA)
   - View More/Less is selector-agnostic and ARIA-friendly
   - Keeps all original features from your file
============================================================ */

/* ============================================================
   CUSTOM AUTOCOMPLETE
   Progressive enhancement over Zendesk's native search helper
============================================================ */
;(function () {
  'use strict';

  var wrappers = document.querySelectorAll('.search[data-custom-autocomplete]');
  if (!wrappers.length) return;

  var localeMatch = window.location.pathname.match(/\/hc\/([^/]+)\//);
  var locale = localeMatch ? localeMatch[1] : (window.Theme && window.Theme.locale) || 'en-us';
  var apiOrigin = window.location.origin;
  var mapPromise = null;
  var queryCache = Object.create(null);

  function escapeHtml(text) {
    var map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, function (char) {
      return map[char];
    });
  }

  function stripHtml(text) {
    return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function highlightText(text, query) {
    var safeText = escapeHtml(text || '');
    var terms = String(query || '').trim().split(/\s+/).filter(Boolean).slice(0, 5);
    if (!terms.length) return safeText;

    var pattern = new RegExp('(' + terms.map(function (term) {
      return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('|') + ')', 'gi');

    return safeText.replace(pattern, '<mark class="hc-autocomplete-mark">$1</mark>');
  }

  function fetchJson(url, signal) {
    return fetch(url, {
      credentials: 'same-origin',
      signal: signal,
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    }).then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    });
  }

  function getMaps(signal) {
    if (!mapPromise) {
      mapPromise = Promise.all([
        fetchJson(apiOrigin + '/api/v2/help_center/categories.json?per_page=100', signal),
        fetchJson(apiOrigin + '/api/v2/help_center/sections.json?per_page=100', signal)
      ]).then(function (results) {
        var categories = Object.create(null);
        var sections = Object.create(null);

        (results[0].categories || []).forEach(function (category) {
          if (category && category.id != null) categories[String(category.id)] = category.name || '';
        });

        (results[1].sections || []).forEach(function (section) {
          if (!section || section.id == null) return;
          sections[String(section.id)] = {
            name: section.name || '',
            categoryId: section.category_id != null ? String(section.category_id) : ''
          };
        });

        return { categories: categories, sections: sections };
      }).catch(function () {
        mapPromise = null;
        return { categories: Object.create(null), sections: Object.create(null) };
      });
    }

    return mapPromise;
  }

  function fetchSuggestions(query, signal) {
    var cacheKey = String(query || '').trim().toLowerCase();
    if (queryCache[cacheKey]) return Promise.resolve(queryCache[cacheKey]);

    var url = apiOrigin + '/api/v2/help_center/articles/search.json?locale='
      + encodeURIComponent(locale)
      + '&per_page=5&query='
      + encodeURIComponent(query);

    return Promise.all([fetchJson(url, signal), getMaps(signal)]).then(function (results) {
      var data = results[0] || {};
      var maps = results[1] || { categories: Object.create(null), sections: Object.create(null) };

      var suggestions = (data.results || []).slice(0, 5).map(function (article) {
        var section = article.section_id != null ? maps.sections[String(article.section_id)] : null;
        var categoryName = section && section.categoryId ? maps.categories[section.categoryId] || '' : '';
        var sectionName = section ? section.name || '' : '';

        return {
          title: article.title || '',
          url: article.html_url || '',
          excerpt: stripHtml(article.snippet || article.body || '').slice(0, 180),
          category: categoryName,
          section: sectionName
        };
      });

      queryCache[cacheKey] = suggestions;
      return suggestions;
    });
  }

  function buildSearchResultsUrl(form, query) {
    var action = (form && form.action) ? form.action : (window.location.origin + '/hc/' + locale + '/search');
    var url = new URL(action, window.location.origin);
    url.searchParams.set('utf8', '✓');
    url.searchParams.set('query', query);
    return url.toString();
  }

  function buildBreadcrumb(item) {
    var parts = ['Home'];
    if (item.category) parts.push(item.category);
    if (item.section) parts.push(item.section);

    return '<div class="hc-autocomplete-breadcrumb" title="' + escapeHtml(parts.join(' > ')) + '">' + parts.map(function (part, index) {
      return '<span class="hc-autocomplete-breadcrumb-part">' + escapeHtml(part) + '</span>'
        + (index < parts.length - 1 ? '<span class="hc-autocomplete-separator">/</span>' : '');
    }).join('') + '</div>';
  }

  function renderList(state, query, suggestions, errorState) {
    var optionIdPrefix = state.list.id + '-option-';
    var searchResultsUrl = buildSearchResultsUrl(state.form, query);
    var items = [];

    suggestions.forEach(function (item, index) {
      items.push(
        '<li id="' + optionIdPrefix + index + '" class="hc-autocomplete-option hc-autocomplete-option--card" role="option" aria-selected="false" data-index="' + index + '" data-url="' + escapeHtml(item.url) + '">' +
          '<a class="hc-autocomplete-link" href="' + escapeHtml(item.url) + '">' +
            '<span class="hc-autocomplete-title">' + highlightText(item.title, query) + '</span>' +
            (item.excerpt ? '<span class="hc-autocomplete-excerpt">' + highlightText(item.excerpt, query) + '</span>' : '') +
          '</a>' +
        '</li>'
      );
    });

    if (!suggestions.length) {
      items.push(
        '<li class="hc-autocomplete-option hc-autocomplete-option--static" role="presentation">' +
          '<div class="hc-autocomplete-empty' + (errorState ? '' : ' hc-autocomplete-empty--no-results') + '">' + escapeHtml(errorState ? 'Suggestions unavailable. Press Enter to search.' : 'No suggestions found yet.') + '</div>' +
        '</li>'
      );
    }

    if (suggestions.length || errorState) {
      items.push(
        '<li id="' + optionIdPrefix + suggestions.length + '" class="hc-autocomplete-option hc-autocomplete-option--footer" role="option" aria-selected="false" data-index="' + suggestions.length + '" data-url="' + escapeHtml(searchResultsUrl) + '">' +
          '<a class="hc-autocomplete-link hc-autocomplete-link--footer view-toggle-btn" href="' + escapeHtml(searchResultsUrl) + '">View all results</a>' +
        '</li>'
      );
    }

    state.list.innerHTML = items.join('');
    state.options = Array.prototype.slice.call(state.list.querySelectorAll('.hc-autocomplete-option[role="option"]'));
    state.activeIndex = -1;
    state.input.removeAttribute('aria-activedescendant');
    positionPanel(state);
    state.panel.hidden = false;
    state.input.setAttribute('aria-expanded', 'true');
  }

  function setActiveOption(state, nextIndex) {
    if (!state.options.length) return;

    if (nextIndex < 0) nextIndex = state.options.length - 1;
    if (nextIndex >= state.options.length) nextIndex = 0;

    state.activeIndex = nextIndex;
    state.options.forEach(function (option, index) {
      var isActive = index === nextIndex;
      option.setAttribute('aria-selected', isActive ? 'true' : 'false');
      option.classList.toggle('is-active', isActive);
      if (isActive) {
        state.input.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function clearActiveOption(state) {
    if (!state || !state.options.length) {
      if (state) {
        state.activeIndex = -1;
        state.input.removeAttribute('aria-activedescendant');
      }
      return;
    }

    state.activeIndex = -1;
    state.options.forEach(function (option) {
      option.setAttribute('aria-selected', 'false');
      option.classList.remove('is-active');
    });
    state.input.removeAttribute('aria-activedescendant');
  }

  function closePanel(state) {
    state.panel.hidden = true;
    state.list.innerHTML = '';
    state.options = [];
    state.activeIndex = -1;
    state.input.setAttribute('aria-expanded', 'false');
    state.input.removeAttribute('aria-activedescendant');
  }

  function renderLoading(state) {
    state.list.innerHTML = '<li class="hc-autocomplete-option hc-autocomplete-option--static" role="presentation"><div class="hc-autocomplete-loading">Loading suggestions...</div></li>';
    state.options = [];
    state.activeIndex = -1;
    positionPanel(state);
    state.panel.hidden = false;
    state.input.setAttribute('aria-expanded', 'true');
    state.input.removeAttribute('aria-activedescendant');
  }

  function positionPanel(state) {
    if (!state || !state.input || !state.panel) return;

    var rect = state.input.getBoundingClientRect();
    var viewportPadding = 8;
    var left = Math.max(viewportPadding, rect.left);
    var width = rect.width;
    var maxWidth = window.innerWidth - (viewportPadding * 2);

    if (left + width > window.innerWidth - viewportPadding) {
      width = Math.max(260, window.innerWidth - left - viewportPadding);
    }

    state.panel.style.position = 'fixed';
    state.panel.style.top = (rect.bottom + 4) + 'px';
    state.panel.style.left = left + 'px';
    state.panel.style.width = Math.min(width, maxWidth) + 'px';
  }

  function createState(wrapper, index) {
    var form = wrapper.querySelector('form[role="search"]');
    var input = form ? form.querySelector('input[name="query"][type="search"]') : null;
    if (!form || !input) return null;
    if (wrapper.getAttribute('data-custom-autocomplete-ready') === 'true') return null;

    wrapper.setAttribute('data-custom-autocomplete-ready', 'true');

    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-expanded', 'false');

    var panel = document.createElement('div');
    panel.className = 'hc-autocomplete-panel';
    panel.hidden = true;

    var list = document.createElement('ul');
    list.className = 'hc-autocomplete-list';
    list.id = 'hc-autocomplete-list-' + index;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Search suggestions');

    panel.appendChild(list);
    document.body.appendChild(panel);
    input.setAttribute('aria-controls', list.id);

    return {
      wrapper: wrapper,
      form: form,
      input: input,
      panel: panel,
      list: list,
      options: [],
      activeIndex: -1,
      minChars: parseInt(wrapper.getAttribute('data-autocomplete-min-chars') || '2', 10),
      timer: null,
      abortController: null,
      requestId: 0,
      lastQuery: '',
      interactionMode: 'pointer'
    };
  }

  function loadSuggestions(state) {
    var query = state.input.value.trim();
    state.lastQuery = query;

    if (query.length < state.minChars) {
      if (state.abortController) state.abortController.abort();
      closePanel(state);
      return;
    }

    if (state.abortController) state.abortController.abort();
    state.abortController = new AbortController();
    state.requestId += 1;
    var currentRequestId = state.requestId;

    renderLoading(state);

    fetchSuggestions(query, state.abortController.signal).then(function (suggestions) {
      if (currentRequestId !== state.requestId || state.input.value.trim() !== query) return;
      renderList(state, query, suggestions, false);
    }).catch(function (error) {
      if (error && error.name === 'AbortError') return;
      if (currentRequestId !== state.requestId) return;
      renderList(state, query, [], true);
    });
  }

  wrappers.forEach(function (wrapper, index) {
    var state = createState(wrapper, index);
    if (!state) return;

    state.input.addEventListener('input', function () {
      clearTimeout(state.timer);
      state.timer = window.setTimeout(function () {
        loadSuggestions(state);
      }, 180);
    });

    state.input.addEventListener('focus', function () {
      if (state.options.length && state.lastQuery === state.input.value.trim()) {
        positionPanel(state);
        state.panel.hidden = false;
        state.input.setAttribute('aria-expanded', 'true');
      }
    });

    state.input.addEventListener('keydown', function (event) {
      if (state.panel.hidden && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        if (state.input.value.trim().length >= state.minChars) {
          loadSuggestions(state);
        }
        return;
      }

      if (state.panel.hidden) {
        if (event.key === 'Escape') closePanel(state);
        return;
      }

      if (event.key === 'ArrowDown') {
        state.interactionMode = 'keyboard';
        event.preventDefault();
        setActiveOption(state, state.activeIndex + 1);
      } else if (event.key === 'ArrowUp') {
        state.interactionMode = 'keyboard';
        event.preventDefault();
        setActiveOption(state, state.activeIndex - 1);
      } else if (event.key === 'Enter') {
        if (state.activeIndex >= 0 && state.options[state.activeIndex]) {
          event.preventDefault();
          window.location.href = state.options[state.activeIndex].getAttribute('data-url');
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closePanel(state);
      }
    });

    state.panel.addEventListener('mousemove', function (event) {
      state.interactionMode = 'pointer';
      var option = event.target.closest('.hc-autocomplete-option[role="option"]');
      if (!option) {
        clearActiveOption(state);
        return;
      }

      if (option.classList.contains('hc-autocomplete-option--footer') && !event.target.closest('.hc-autocomplete-link--footer')) {
        clearActiveOption(state);
        return;
      }

      setActiveOption(state, parseInt(option.getAttribute('data-index') || '-1', 10));
    });

    state.panel.addEventListener('mouseleave', function () {
      if (state.interactionMode === 'pointer') clearActiveOption(state);
    });

    state.panel.addEventListener('mousedown', function (event) {
      var option = event.target.closest('.hc-autocomplete-option[role="option"]');
      if (!option) return;

      // For the footer option, only navigate when clicking the actual button link
      if (option.classList.contains('hc-autocomplete-option--footer')) {
        if (!event.target.closest('.hc-autocomplete-link--footer')) return;
      }

      event.preventDefault();
      window.location.href = option.getAttribute('data-url');
    });

    window.addEventListener('resize', function () {
      if (!state.panel.hidden) positionPanel(state);
    });

    window.addEventListener('scroll', function () {
      if (!state.panel.hidden) positionPanel(state);
    }, true);

    document.addEventListener('click', function (event) {
      if (!state.wrapper.contains(event.target) && !state.panel.contains(event.target)) closePanel(state);
    });
  });
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
      if (ul.closest && ul.closest('.article-content, [itemprop="articleBody"]')) continue;
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
    var observeRoot = document.querySelector('main') || document.body;
    rootMo.observe(observeRoot, { childList: true, subtree: true });
    setTimeout(function () { rootMo.disconnect(); }, 10000);
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
      if (el) {
        el.style.display = 'none';
        hideObserver.disconnect();
      }
    }
    hideIssueTypeSelector();
    var hideObserver = new MutationObserver(hideIssueTypeSelector);
    hideObserver.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { hideObserver.disconnect(); }, 10000);

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
            observer.disconnect();
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { observer.disconnect(); }, 10000);

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
      var ob = new MutationObserver(function () {
        process();
        ob.disconnect();
      });
      ob.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { ob.disconnect(); }, 10000);
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
   BROWSER LANGUAGE AUTO-DETECTION
   DISABLED — was causing redirect loops in production.
   The Help Center default locale (en-us) handles this via
   Zendesk's built-in locale routing. The language switcher
   modal (below) provides manual locale selection.
   ============================================================ */

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
    var cancelBtn = document.getElementById('hiltiLangCancel');
    var saveBtn = document.getElementById('hiltiLangSave');
    var countrySelect = document.getElementById('hiltiCountrySelect');
    var languageSelect = document.getElementById('hiltiLanguageSelect');
    var langLabel = trigger ? trigger.querySelector('.hilti-lang-label') : null;

    if (!trigger || !overlay) return;

    var COUNTRY_LANGUAGE_MAP = {
      us: {
        country: 'United States',
        languages: [{ label: 'English (United States)', locale: 'en-us' }]
      },
      in: {
        country: 'India',
        languages: [{ label: 'English (United Kingdom)', locale: 'en-gb' }]
      }
    };
    /*
     * HOW TO EXTEND THIS MAP
     * ----------------------
     * Each key is a short country code (lowercase). The value object needs:
     *   country   – Display name shown in the Country dropdown.
     *   languages – Array of one or more language objects. Each has:
     *               label  – Display name shown in the Language dropdown.
     *               locale – Zendesk locale code used in the /hc/{locale}/ URL.
     *
     * ADDING A NEW COUNTRY (single language):
     *   de: {
     *     country: 'Germany',
     *     languages: [{ label: 'Deutsch', locale: 'de' }]
     *   },
     *
     * ADDING A COUNTRY WITH MULTIPLE LANGUAGES:
     *   ch: {
     *     country: 'Switzerland',
     *     languages: [
     *       { label: 'Deutsch (Schweiz)',   locale: 'de' },
     *       { label: 'Français (Suisse)',   locale: 'fr' },
     *       { label: 'Italiano (Svizzera)', locale: 'it' }
     *     ]
     *   },
     *
     * When a country has more than one language the Language dropdown will
     * show all options and the user must choose one before Save is enabled.
     * When only one language exists it is auto-selected immediately.
     *
     * Locale codes must match an active locale in your Zendesk Help Center.
     * Check Guide Admin → Language Settings for the full list of enabled locales.
     */
    var STORAGE_KEY = 'hilti.country.selection';

    function getCurrentLocale() {
      return ((window.location.pathname.match(/\/hc\/([a-z]{2}(?:-[a-z0-9]+)?)(?:\/|$)/i) || [])[1] || 'en-us').toLowerCase();
    }

    function updateHeaderLocaleLabel(locale, countryCode) {
      if (!langLabel) return;
      // Prefer explicit country code from COUNTRY_LANGUAGE_MAP key
      // so India shows "IN" even though its locale is en-gb
      if (countryCode) {
        langLabel.textContent = countryCode.toUpperCase();
        return;
      }
      // Resolve country from the actual page locale
      var resolved = resolveCountryFromLocale(locale || getCurrentLocale());
      langLabel.textContent = resolved.toUpperCase();
    }

    // Extract article ID from URL
    function extractArticleIdFromUrl(url) {
      if (!url) return null;
      var m = String(url).match(/\/articles\/(\d+)(?:[-/?#]|$)/);
      return m ? m[1] : null;
    }

    // Fetch article's correct URL from Zendesk API for target locale
    // Strategy:
    // 1. Search for the article by slug in the target locale (using locale query param)
    // 2. If found, navigate to the article URL
    // 3. If not found, show a user-friendly message
    function fetchArticleUrlForLocale(articleId, locale) {
      var apiOrigin = window.location.origin;
      var slug = extractSlugFromUrl(window.location.href);
      
      if (!slug) {
        // No slug in URL — fallback to simple locale swap
        return Promise.resolve(buildLocaleUrl(locale));
      }

      // Use the locale query parameter format (not path-based) — Zendesk returns 404 for path-based locale
      var searchTerms = slug.split(' ').slice(0, 8).join(' ');
      var searchUrl = apiOrigin + '/api/v2/help_center/articles/search.json?query=' + encodeURIComponent(searchTerms) + '&locale=' + encodeURIComponent(locale) + '&per_page=10';

      return fetch(searchUrl, { credentials: 'same-origin' })
        .then(function(response) {
          if (!response.ok) {
            return null;
          }
          return response.json();
        })
        .then(function(data) {
          if (!data || !data.results || data.results.length === 0) return null;
          
          // Find a result whose slug matches the current article
          var slugLower = slug.toLowerCase();
          for (var i = 0; i < data.results.length; i++) {
            var result = data.results[i];
            if (result.html_url) {
              var resultSlug = extractSlugFromUrl(result.html_url);
              if (resultSlug && resultSlug.toLowerCase() === slugLower) {
                // Ensure URL uses current origin (API may return mapped domain)
                return normalizeArticleUrl(result.html_url, apiOrigin, locale);
              }
            }
          }
          
          // No exact slug match found
          return null;
        })
        .catch(function(error) {
          console.warn('Locale switch search failed:', error);
          return null;
        });
    }

    // Normalize article URL to use the current origin
    // Zendesk API may return URLs with a different host (e.g. help.profisengineering.hilti.com)
    // when a host mapping is configured
    function normalizeArticleUrl(apiUrl, currentOrigin, locale) {
      try {
        var parsed = new URL(apiUrl);
        var currentHost = new URL(currentOrigin);
        // If hosts differ, rebuild with current origin
        if (parsed.host !== currentHost.host) {
          return currentOrigin + parsed.pathname + parsed.search + parsed.hash;
        }
        return apiUrl;
      } catch (e) {
        return apiUrl;
      }
    }

    // Extract the slug portion from an article URL
    // e.g., /articles/12345-How-to-do-something → "How to do something"
    function extractSlugFromUrl(url) {
      var m = String(url).match(/\/articles\/\d+-(.*?)(?:\?|#|$)/);
      if (!m) return null;
      // Convert URL slug back to search-friendly text (hyphens → spaces)
      return decodeURIComponent(m[1]).replace(/-/g, ' ');
    }

    // Build the redirect URL for a given locale code
    function buildLocaleUrl(locale) {
      return window.location.href.replace(
        /(\/hc\/)[a-z]{2}(-[a-z0-9]+)?(?=\/|$|\?|#)/i,
        '$1' + locale
      );
    }

    // ─── Inline error helpers ───────────────────────────────────────────
    function showInlineError() {
      var errorEl = document.getElementById('hiltiLangError');
      if (!errorEl) {
        console.warn('showInlineError: #hiltiLangError element not found');
        return;
      }
      errorEl.removeAttribute('hidden');
      errorEl.classList.add('is-visible');
    }

    function hideInlineError() {
      var errorEl = document.getElementById('hiltiLangError');
      if (!errorEl) return;
      errorEl.setAttribute('hidden', '');
      errorEl.classList.remove('is-visible');
    }

    // ─── Article page detection ─────────────────────────────────────────
    function isArticlePage() {
      return /\/articles\/\d+/.test(window.location.pathname);
    }

    // ─── Article availability check ─────────────────────────────────────
    function checkArticleAvailability(articleId, locale) {
      var slug = extractSlugFromUrl(window.location.href);
      if (!slug) {
        return Promise.resolve(null);
      }

      var searchTerms = slug.split(' ').slice(0, 8).join(' ');
      var url = '/api/v2/help_center/articles/search.json?query=' + encodeURIComponent(searchTerms) + '&locale=' + encodeURIComponent(locale) + '&per_page=10';

      var controller = new AbortController();
      var timeoutId = setTimeout(function () { controller.abort(); }, 10000);

      return fetch(url, { signal: controller.signal, credentials: 'same-origin' })
        .then(function (response) {
          if (!response.ok) {
            throw new Error('HTTP error ' + response.status);
          }
          return response.json();
        })
        .then(function (data) {
          if (!data || !data.results || data.results.length === 0) return null;

          var slugLower = slug.toLowerCase();
          for (var i = 0; i < data.results.length; i++) {
            var result = data.results[i];
            if (result.html_url) {
              var resultSlug = extractSlugFromUrl(result.html_url);
              if (resultSlug && resultSlug.toLowerCase() === slugLower) {
                return normalizeArticleUrl(result.html_url, window.location.origin, locale);
              }
            }
          }
          return null;
        })
        .finally(function () {
          clearTimeout(timeoutId);
        });
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

    function setSaveState() {
      if (!saveBtn || !countrySelect || !languageSelect) return;
      var errorEl = document.getElementById('hiltiLangError');
      var hasError = errorEl && errorEl.classList.contains('is-visible');
      saveBtn.disabled = hasError || !(countrySelect.value && languageSelect.value);
    }

    function clearSelect(selectEl, placeholder) {
      if (!selectEl) return;
      selectEl.innerHTML = '';
      var base = document.createElement('option');
      base.value = '';
      base.textContent = placeholder;
      selectEl.appendChild(base);
    }

    function populateCountries() {
      if (!countrySelect) return;
      clearSelect(countrySelect, 'Select Country');
      Object.keys(COUNTRY_LANGUAGE_MAP).forEach(function (code) {
        var option = document.createElement('option');
        option.value = code;
        option.textContent = COUNTRY_LANGUAGE_MAP[code].country;
        countrySelect.appendChild(option);
      });
    }

    function populateLanguages(countryCode) {
      if (!languageSelect) return;
      clearSelect(languageSelect, 'Select Language');

      var countryEntry = COUNTRY_LANGUAGE_MAP[countryCode];
      if (!countryEntry || !countryEntry.languages || !countryEntry.languages.length) {
        languageSelect.disabled = true;
        setSaveState();
        return;
      }

      countryEntry.languages.forEach(function (lang) {
        var option = document.createElement('option');
        option.value = lang.locale;
        option.textContent = lang.label;
        languageSelect.appendChild(option);
      });

      languageSelect.disabled = false;

      if (countryEntry.languages.length === 1) {
        languageSelect.value = countryEntry.languages[0].locale;
      }

      setSaveState();
    }

    function resolveCountryFromLocale(locale) {
      var normalized = (locale || '').toLowerCase();
      var match = Object.keys(COUNTRY_LANGUAGE_MAP).find(function (countryCode) {
        return COUNTRY_LANGUAGE_MAP[countryCode].languages.some(function (lang) {
          return lang.locale === normalized;
        });
      });
      return match || 'us';
    }

    // Prefetch configured locales as soon as the user hovers the trigger
    trigger.addEventListener('mouseenter', function () {
      Object.keys(COUNTRY_LANGUAGE_MAP).forEach(function (countryCode) {
        COUNTRY_LANGUAGE_MAP[countryCode].languages.forEach(function (lang) {
          prefetchLocale(lang.locale);
        });
      });
    }, { once: true });

    function openModal() {
      // Remove any legacy body-level toast elements
      var legacyToasts = document.querySelectorAll('.hilti-locale-unavailable-toast');
      legacyToasts.forEach(function(toast) { toast.remove(); });

      Object.keys(COUNTRY_LANGUAGE_MAP).forEach(function (countryCode) {
        COUNTRY_LANGUAGE_MAP[countryCode].languages.forEach(function (lang) {
          prefetchLocale(lang.locale);
        });
      });

      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      if (countrySelect && languageSelect) {
        populateCountries();
        var currentLocale = getCurrentLocale();
        var initialCountry = resolveCountryFromLocale(currentLocale);

        countrySelect.value = initialCountry;
        populateLanguages(initialCountry);

        if (languageSelect.querySelector('option[value="' + currentLocale + '"]')) {
          languageSelect.value = currentLocale;
        }

        setSaveState();
        countrySelect.focus();
      }
    }

    function closeModal() {
      hideInlineError();
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

    if (cancelBtn) {
      cancelBtn.addEventListener('click', closeModal);
    }

    if (countrySelect) {
      countrySelect.addEventListener('change', function () {
        hideInlineError();
        var selectedCountry = countrySelect.value;
        populateLanguages(selectedCountry);
      });
    }

    if (languageSelect) {
      languageSelect.addEventListener('change', function () {
        hideInlineError();
        setSaveState();
      });
    }

    function handleSave() {
      var locale = languageSelect.value;

      if (!isArticlePage()) {
        // Non-article page: close modal and navigate via locale URL replacement
        closeModal();

        localStorage.setItem(STORAGE_KEY, countrySelect.value);

        var bar = document.createElement('div');
        bar.className = 'hilti-page-loading-bar';
        document.body.appendChild(bar);
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { bar.classList.add('is-animating'); });
        });

        updateHeaderLocaleLabel(locale, countrySelect.value);
        window.location.href = buildLocaleUrl(locale);
        return;
      }

      // Article page: check availability before navigating
      saveBtn.disabled = true;

      var articleId = extractArticleIdFromUrl(window.location.href);
      var languageName = languageSelect.options[languageSelect.selectedIndex].text;

      checkArticleAvailability(articleId, locale)
        .then(function (url) {
          if (url) {
            // Article available — close modal and navigate
            closeModal();

            localStorage.setItem(STORAGE_KEY, countrySelect.value);

            var bar = document.createElement('div');
            bar.className = 'hilti-page-loading-bar';
            document.body.appendChild(bar);
            requestAnimationFrame(function () {
              requestAnimationFrame(function () { bar.classList.add('is-animating'); });
            });

            updateHeaderLocaleLabel(locale, countrySelect.value);
            window.location.href = url;
          } else {
            // Article not available in the selected locale
            showInlineError();
          }
        })
        .catch(function () {
          // Network error or timeout
          showInlineError();
        })
        .finally(function () {
          setSaveState();
        });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        if (!countrySelect || !languageSelect) return;
        if (!countrySelect.value || !languageSelect.value) return;
        handleSave();
      });
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

    updateHeaderLocaleLabel(getCurrentLocale());

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

    function isSameSearchReferrer() {
      if (!cleanedQuery) return false;
      if (!document.referrer) return false;
      try {
        var refUrl = new URL(document.referrer, window.location.origin);
        if (refUrl.origin !== window.location.origin) return false;
        if (!/\/search(?:\/)?$/.test(refUrl.pathname)) return false;
        var refQuery = cleanQuery(refUrl.searchParams.get('query') || '');
        return refQuery === cleanedQuery;
      } catch (e) {
        return false;
      }
    }

    // Shared metadata for pagination and counts.
    // For unfiltered results, native Zendesk pagination is the source of truth.
    var searchMeta = { perPage: null, totalPages: null, totalResults: null };

    function toPositiveInt(value) {
      var n = parseInt(value, 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }

    function readResultsCountFromTitle() {
      var strongEl = document.querySelector('.hc-results-title strong');
      if (!strongEl) return null;
      return toPositiveInt((strongEl.textContent || '').replace(/[^0-9]/g, ''));
    }

    function readNativePaginationTotalPages() {
      var wrapper = document.querySelector('.hc-pagination-wrapper');
      if (!wrapper) return null;

      // Zendesk renders the initial pagination server-side; parse it before custom UI overwrite.
      var maxPage = 1;
      var hasNumericPage = false;

      function registerPage(value) {
        var n = toPositiveInt(value);
        if (!n) return;
        hasNumericPage = true;
        if (n > maxPage) maxPage = n;
      }

      wrapper.querySelectorAll('a[href]').forEach(function(link) {
        var byHref = null;
        try {
          var url = new URL(link.getAttribute('href') || '', window.location.origin);
          byHref = toPositiveInt(url.searchParams.get('page'));
        } catch (e) {}

        var byText = null;
        var text = (link.textContent || '').trim();
        if (/^\d+$/.test(text)) byText = toPositiveInt(text);

        registerPage(byHref || byText);
      });

      // Parse generic pagination nodes as a fallback for non-link current page markup.
      wrapper.querySelectorAll('li, span, strong, b, em, button').forEach(function(node) {
        var text = (node.textContent || '').trim();
        if (!text || text === '...') return;

        var tokens = text.match(/\d+|\.{3}/g) || [];
        tokens.forEach(function(token) {
          if (token === '...') return;
          if (!/^\d+$/.test(token)) return;
          registerPage(token);
        });
      });

      // Lower-bound fallback: include current URL page to avoid boundary clamping regressions.
      registerPage(new URLSearchParams(window.location.search).get('page'));

      return hasNumericPage ? maxPage : null;
    }

    document.querySelectorAll('.hc-clean-query').forEach(function(el) {
      el.textContent = cleanedQuery;
    });

    // Seed metadata from server-rendered page so the first custom render is accurate.
    searchMeta.totalResults = readResultsCountFromTitle();
    searchMeta.totalPages = readNativePaginationTotalPages();
    if (searchMeta.totalResults && searchMeta.totalPages) {
      searchMeta.perPage = Math.max(1, Math.ceil(searchMeta.totalResults / searchMeta.totalPages));
    }

    // Set by buildFilters(); lets sort changes re-render filtered results from source data.
    var rerenderFilteredResults = null;

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
      var sortDropdown = sortSelect.closest('.hc-sort-dropdown');
      var resultsList = document.querySelector('.hc-results-list');
      var initialOrder = resultsList ? Array.from(resultsList.querySelectorAll('.hc-result-card')) : [];

      function setSortDropdownOpen(isOpen) {
        if (!sortDropdown) return;
        sortDropdown.classList.toggle('is-open', !!isOpen);
      }

      function syncSortUrl(sortValue) {
        var url = new URL(window.location.href);
        if (sortValue === 'recent') {
          url.searchParams.set('sort', 'recent');
        } else {
          url.searchParams.delete('sort');
        }
        window.history.replaceState(null, '', url.toString());
      }

      function applySort(sortValue) {
        if (!resultsList) return;

        var resultCards = Array.from(resultsList.querySelectorAll('.hc-result-card'));
        if (resultCards.length === 0) return;

        if (sortValue === 'recent') {
          // Sort by most recent - extract timestamps and sort descending
          resultCards.sort(function(a, b) {
            var timeA = a.querySelector('.hc-result-meta time');
            var timeB = b.querySelector('.hc-result-meta time');
            var tsA = timeA ? Date.parse(timeA.getAttribute('datetime') || '') : NaN;
            var tsB = timeB ? Date.parse(timeB.getAttribute('datetime') || '') : NaN;

            // Keep undated/invalid cards at the end while preserving relative order among them.
            if (isNaN(tsA) && isNaN(tsB)) return 0;
            if (isNaN(tsA)) return 1;
            if (isNaN(tsB)) return -1;

            return tsB - tsA; // Descending order (most recent first)
          });

          // Re-append sorted cards to the list
          resultCards.forEach(function(card) {
            resultsList.appendChild(card);
          });
        } else {
          // Restore original server-rendered relevance order.
          initialOrder.forEach(function(card) {
            resultsList.appendChild(card);
          });
        }
      }

      // Native selects don't expose a reliable "opened" event.
      // Use pointer/key open-intent events, then close on change/blur.
      sortSelect.addEventListener('mousedown', function() {
        setSortDropdownOpen(true);
      });

      sortSelect.addEventListener('keydown', function(e) {
        var key = e.key;
        if (key === 'ArrowDown' || key === 'ArrowUp' || key === ' ' || key === 'Enter' || key === 'F4') {
          setSortDropdownOpen(true);
        }
      });

      sortSelect.addEventListener('blur', function() {
        setSortDropdownOpen(false);
      });

      sortSelect.addEventListener('change', function(e) {
        // Selection means the dropdown interaction is complete.
        setSortDropdownOpen(false);
        syncSortUrl(this.value);

        var hasActiveFilters = !!document.querySelector('#hc-category-list .hc-category-input:checked, #hc-section-list .hc-section-input:checked');
        if (hasActiveFilters && typeof rerenderFilteredResults === 'function') {
          rerenderFilteredResults();
          return;
        }

        applySort(this.value);
      });

      // Apply URL-driven initial sort state without page reload.
      var initialSort = new URLSearchParams(window.location.search).get('sort');
      if (initialSort === 'recent') {
        sortSelect.value = 'recent';
        applySort('recent');
      } else {
        syncSortUrl(sortSelect.value);
      }
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
        var title = link ? link.textContent.trim() : '';
        var snippetEl = card.querySelector('.hc-result-snippet');
        var snippet = snippetEl ? snippetEl.textContent.trim() : '';
        var catLinks = card.querySelectorAll('.hc-result-category .hc-category-link');
        var timeEl = card.querySelector('.hc-result-meta time');
        var updatedAt = timeEl ? (timeEl.getAttribute('datetime') || '') : '';
        if (!updatedAt && timeEl && timeEl.textContent) {
          var fallbackTs = Date.parse(timeEl.textContent.trim());
          if (!isNaN(fallbackTs)) updatedAt = new Date(fallbackTs).toISOString();
        }
        // Use last-2 links for category, last-1 for section to handle optional Help-Center root prefix
        var category = catLinks.length >= 2 ? catLinks[catLinks.length - 2].textContent.trim() : (catLinks.length === 1 ? catLinks[0].textContent.trim() : null);
        var section   = catLinks.length >= 2 ? catLinks[catLinks.length - 1].textContent.trim() : null;
        rows.push({
          url: url,
          title: title,
          snippet: snippet,
          updatedAt: updatedAt,
          voteSum: 0,
          commentCount: 0,
          tags: [],
          category: category,
          section: section
        });
      }
      return rows;
    }

    // Build filters from current page only (used as fallback)
    function buildFiltersFromCurrentPage() {
      var rows = parseResultsFromDoc(document);
      buildFilters(rows);
      hydrateTagsFromArticleDetailsForVisibleCards();
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
      var updatedMarkup = r.updatedAt
        ? ('<time datetime="' + esc(r.updatedAt) + '">' + esc(date) + '</time>')
        : esc(date);
      var breadcrumb = '';
      var homeUrl = helpCenterUrl || '/hc';
      if (r.category && r.section) {
        breadcrumb = '<div class="hc-result-category"><a href="' + esc(homeUrl) + '" class="hc-category-link">Home</a><span class="hc-category-separator">/</span><a class="hc-category-link">' + esc(r.category) + '</a><span class="hc-category-separator">/</span><a class="hc-category-link">' + esc(r.section) + '</a></div>';
      } else if (r.section) {
        breadcrumb = '<div class="hc-result-category"><a href="' + esc(homeUrl) + '" class="hc-category-link">Home</a><span class="hc-category-separator">/</span><a class="hc-category-link">' + esc(r.section) + '</a></div>';
      }
      var tags = '';
      if (r.tags && r.tags.length) {
        tags = '<ul class="article-tags-custom hc-result-tags">' + r.tags.map(function(tag) {
          var tagName = typeof tag === 'string' ? tag : (tag && tag.name) || '';
          if (!tagName) return '';
          var tagHref = (helpCenterUrl || '/hc') + 'search?query=' + encodeURIComponent(tagName) + '&utf8=%E2%9C%93';
          return '<li><a class="article-tag-link" title="Search results" href="' + esc(tagHref) + '">' + esc(tagName) + '</a></li>';
        }).join('') + '</ul>';
      }
      return '<article class="hc-result-card">' +
        '<h2 class="hc-result-title"><a href="' + esc(r.url) + '" class="hc-result-link">' + esc(r.title) + '</a></h2>' +
        breadcrumb +
        (r.snippet ? '<p class="hc-result-snippet">' + esc(r.snippet) + '</p>' : '') +
        tags +
        '<div class="hc-result-meta">' +
          '<span class="hc-meta-item"><svg class="hc-meta-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="14" height="14" aria-hidden="true"><circle cx="6" cy="6" r="5.5" fill="none" stroke="currentColor"/><path stroke="currentColor" stroke-linecap="round" d="M6 3v3.5L8 8"/></svg>Updated ' + updatedMarkup + '</span>' +
          (r.voteSum ? '<span class="hc-meta-item">' + r.voteSum + ' helpful</span>' : '') +
          (r.commentCount ? '<span class="hc-meta-item">' + r.commentCount + ' comments</span>' : '') +
        '</div>' +
      '</article>';
    }

    // Normalize absolute/relative result URLs to a stable key so API data and DOM links match.
    function toResultUrlKey(url) {
      if (!url) return '';
      try {
        var u = new URL(url, window.location.origin);
        return u.pathname + (u.search || '');
      } catch (e) {
        return String(url);
      }
    }

    function normalizeTextKey(text) {
      return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    // Extract tag names from multiple possible Zendesk payload shapes.
    function extractTagNames(obj) {
      var raw = (obj && (obj.label_names || obj.content_tag_names || obj.tags || obj.content_tags)) || [];
      if (!Array.isArray(raw)) return [];

      var names = raw.map(function(item) {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') return item.name || item.title || '';
        return '';
      }).filter(Boolean);

      var seen = {};
      return names.filter(function(name) {
        if (seen[name]) return false;
        seen[name] = true;
        return true;
      });
    }

    // Add tags to currently rendered server-side cards using API data keyed by URL.
    // This keeps template validation strict while still showing labels on initial load.
    function insertTagsIntoCard(card, tags) {
      if (!card || !tags || !tags.length || card.querySelector('.hc-result-tags')) return;

      var tagsEl = document.createElement('ul');
      tagsEl.className = 'article-tags-custom hc-result-tags';

      tags.forEach(function(tag) {
        var tagName = typeof tag === 'string' ? tag : (tag && tag.name) || '';
        if (!tagName) return;

        var li = document.createElement('li');
        var a = document.createElement('a');
        a.className = 'article-tag-link';
        a.title = 'Search results';
        a.href = (helpCenterUrl || '/hc') + 'search?query=' + encodeURIComponent(tagName) + '&utf8=%E2%9C%93';
        a.textContent = tagName;
        li.appendChild(a);
        tagsEl.appendChild(li);
      });

      var snippet = card.querySelector('.hc-result-snippet');
      if (snippet && snippet.parentNode) {
        snippet.insertAdjacentElement('afterend', tagsEl);
      } else {
        var meta = card.querySelector('.hc-result-meta');
        if (meta && meta.parentNode) meta.insertAdjacentElement('beforebegin', tagsEl);
      }
    }

    function hydrateVisibleResultTags(rows) {
      if (!rows || !rows.length) return;

      var byUrl = {};
      var byId = {};
      var byTitle = {};
      rows.forEach(function(r) {
        if (r.url) byUrl[toResultUrlKey(r.url)] = r;
        if (r.id != null) byId[String(r.id)] = r;
        var key = normalizeTextKey(r.title);
        if (key && !byTitle[key]) byTitle[key] = r;
      });

      var cards = document.querySelectorAll('.hc-result-card');
      cards.forEach(function(card, index) {
        if (card.querySelector('.hc-result-tags')) return;

        var link = card.querySelector('.hc-result-title a');
        if (!link) return;

        var href = link.getAttribute('href');
        var articleId = extractArticleIdFromUrl(href);
        var titleKey = normalizeTextKey(link.textContent);

        var row = null;
        if (articleId && byId[String(articleId)]) {
          row = byId[String(articleId)];
        } else if (byUrl[toResultUrlKey(href)]) {
          row = byUrl[toResultUrlKey(href)];
        } else if (titleKey && byTitle[titleKey]) {
          row = byTitle[titleKey];
        } else if (rows[index]) {
          row = rows[index];
        }

        if (!row || !row.tags || !row.tags.length) return;

        insertTagsIntoCard(card, row.tags);
      });
    }

    // Strong fallback: fetch each visible article by ID and read tags from article payload.
    // This handles tenants where search endpoint omits tag fields entirely.
    var articleTagCache = {};
    var articlePageTagCache = {};
    var contentTagNameCache = {};

    function extractArticleIdFromUrl(url) {
      if (!url) return null;
      var m = String(url).match(/\/articles\/(\d+)(?:[-/?#]|$)/);
      return m ? m[1] : null;
    }

    function fetchArticleTagsById(articleId) {
      if (!articleId) return Promise.resolve([]);
      if (Array.isArray(articleTagCache[articleId])) return Promise.resolve(articleTagCache[articleId]);
      if (articleTagCache[articleId] && typeof articleTagCache[articleId].then === 'function') return articleTagCache[articleId];

      var localeMatch = window.location.pathname.match(/\/hc\/([^/]+)\//);
      var locale = localeMatch ? localeMatch[1] : 'en-us';
      var apiOrigin = window.location.origin;
      var endpoints = [
        apiOrigin + '/api/v2/help_center/' + encodeURIComponent(locale) + '/articles/' + articleId + '.json',
        apiOrigin + '/api/v2/help_center/articles/' + articleId + '.json',
        apiOrigin + '/api/v2/help_center/' + encodeURIComponent(locale) + '/articles/' + articleId + '/labels.json',
        apiOrigin + '/api/v2/help_center/articles/' + articleId + '/labels.json'
      ];

      function dedupeNames(list) {
        var seen = {};
        return (list || []).filter(function(name) {
          if (!name) return false;
          if (seen[name]) return false;
          seen[name] = true;
          return true;
        });
      }

      function fetchContentTagNameById(tagId) {
        if (!tagId) return Promise.resolve('');
        if (typeof contentTagNameCache[tagId] === 'string') return Promise.resolve(contentTagNameCache[tagId]);
        if (contentTagNameCache[tagId] && typeof contentTagNameCache[tagId].then === 'function') return contentTagNameCache[tagId];

        var endpoint = apiOrigin + '/api/v2/guide/content_tags/' + encodeURIComponent(tagId);
        contentTagNameCache[tagId] = fetch(endpoint, {
          credentials: 'same-origin',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        }).then(function(r) {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        }).then(function(data) {
          var ct = data && (data.content_tag || data);
          var name = (ct && ct.name) ? String(ct.name).trim() : '';
          contentTagNameCache[tagId] = name;
          return name;
        }).catch(function() {
          contentTagNameCache[tagId] = '';
          return '';
        });

        return contentTagNameCache[tagId];
      }

      function resolveContentTagIdsToNames(ids) {
        if (!Array.isArray(ids) || !ids.length) return Promise.resolve([]);
        return Promise.all(ids.map(fetchContentTagNameById)).then(function(names) {
          return dedupeNames(names.filter(Boolean));
        });
      }

      function parseTagResponse(data) {
        // Article payload shapes
        var article = data && (data.article || data);
        var names = extractTagNames(article || {});
        if (names.length) return Promise.resolve(dedupeNames(names));

        // Some plans return content_tag_ids (IDs) without names; resolve via Content Tags API.
        if (article && Array.isArray(article.content_tag_ids) && article.content_tag_ids.length) {
          return resolveContentTagIdsToNames(article.content_tag_ids);
        }

        // Labels endpoint payload shapes
        var labels = (data && (data.labels || data.article_labels || data.results)) || null;
        if (Array.isArray(labels)) {
          return Promise.resolve(dedupeNames(labels.map(function(item) {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') return item.name || item.label || item.title || '';
            return '';
          }).filter(Boolean)));
        }

        return Promise.resolve([]);
      }

      function tryFetch(index) {
        if (index >= endpoints.length) return Promise.resolve([]);

        return fetch(endpoints[index], {
          credentials: 'same-origin',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        }).then(function(r) {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        }).then(function(data) {
          return parseTagResponse(data);
        }).catch(function() {
          return tryFetch(index + 1);
        });
      }

      articleTagCache[articleId] = tryFetch(0).then(function(tags) {
        articleTagCache[articleId] = tags || [];
        return articleTagCache[articleId];
      });

      return articleTagCache[articleId];
    }

    // Final fallback: fetch article HTML and extract rendered tag chips.
    function fetchArticleTagsFromPage(url) {
      var key = toResultUrlKey(url);
      if (!key) return Promise.resolve([]);
      if (Array.isArray(articlePageTagCache[key])) return Promise.resolve(articlePageTagCache[key]);
      if (articlePageTagCache[key] && typeof articlePageTagCache[key].then === 'function') return articlePageTagCache[key];

      // Search result links may redirect cross-origin (/search/click?...), which is blocked by CORS.
      // Skip HTML fetch for those links to avoid noisy failures.
      try {
        var parsed = new URL(url, window.location.origin);
        if (parsed.origin !== window.location.origin || parsed.pathname.indexOf('/search/click') > -1) {
          return Promise.resolve([]);
        }
      } catch (e) {
        return Promise.resolve([]);
      }

      articlePageTagCache[key] = fetch(url, {
        credentials: 'same-origin',
        headers: { 'Accept': 'text/html' }
      }).then(function(r) {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      }).then(function(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var nodes = doc.querySelectorAll('.article-tags-custom a, .article-tag-link');
        var tags = Array.from(nodes).map(function(n) {
          return (n.textContent || '').trim();
        }).filter(Boolean);

        // Last-resort metadata fallback
        if (!tags.length) {
          var keywords = doc.querySelector('meta[name="keywords"]');
          if (keywords && keywords.content) {
            tags = keywords.content.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          }
        }

        // Deduplicate while preserving order
        var seen = {};
        tags = tags.filter(function(tag) {
          if (seen[tag]) return false;
          seen[tag] = true;
          return true;
        });

        articlePageTagCache[key] = tags;
        return tags;
      }).catch(function() {
        articlePageTagCache[key] = [];
        return [];
      });

      return articlePageTagCache[key];
    }

    function hydrateTagsFromArticleDetailsForVisibleCards(rows) {
      var byTitle = {};
      if (Array.isArray(rows)) {
        rows.forEach(function(r) {
          var key = normalizeTextKey(r && r.title);
          if (key && !byTitle[key]) byTitle[key] = r;
        });
      }

      var cards = document.querySelectorAll('.hc-result-card');
      cards.forEach(function(card, index) {
        if (card.querySelector('.hc-result-tags')) return;

        var link = card.querySelector('.hc-result-title a');
        if (!link) return;

        var href = link.getAttribute('href');
        var articleId = extractArticleIdFromUrl(href);

        if (!articleId && Array.isArray(rows) && rows.length) {
          var titleKey = normalizeTextKey(link.textContent);
          var matched = (titleKey && byTitle[titleKey]) ? byTitle[titleKey] : rows[index];
          if (matched && matched.id != null) articleId = String(matched.id);
          if (!articleId && matched && matched.url) articleId = extractArticleIdFromUrl(matched.url);
        }

        if (!articleId) return;

        var tagPromise = fetchArticleTagsById(articleId);

        tagPromise.then(function(tags) {
          insertTagsIntoCard(card, tags);
        }).catch(function() {});
      });
    }

    // Local-preview fallback: populate tags from search API for currently visible cards.
    // This keeps tags working even when full API filtering is intentionally skipped.
    function hydrateTagsOnlyFromSearchAPI() {
      var localeMatch = window.location.pathname.match(/\/hc\/([^/]+)\//);
      var locale = localeMatch ? localeMatch[1] : 'en-us';
      var apiOrigin = window.location.origin;
      var baseUrl = apiOrigin + '/api/v2/help_center/articles/search.json?locale='
                  + encodeURIComponent(locale) + '&per_page=100&query=' + encodeURIComponent(cleanedQuery);

      fetch(baseUrl + '&page=1', {
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }).then(function(r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      }).then(function(data) {
        var rows = (data.results || []).map(function(article) {
          return {
            id: article.id || null,
            url: article.html_url || null,
            title: article.title || '',
            tags: extractTagNames(article)
          };
        });
        hydrateVisibleResultTags(rows);
        hydrateTagsFromArticleDetailsForVisibleCards(rows);
      }).catch(function() {
        // Local-preview fallback when search endpoint is unavailable.
        hydrateTagsFromArticleDetailsForVisibleCards();
      });
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
        (results[0].categories || []).forEach(function(c) {
          if (!c || c.id == null) return;
          categoryMap[c.id] = c.name || '';
        });
        (results[1].sections || []).forEach(function(s) {
          if (!s || s.id == null) return;
          sectionMap[s.id] = { name: s.name || '', categoryId: s.category_id };
        });

        // Fetch all search result pages via API (up to 100 results per request)
        var allRows = {};
        var searchBase = apiOrigin + '/api/v2/help_center/articles/search.json?locale='
                       + encodeURIComponent(locale) + '&per_page=100&query=' + encodeURIComponent(cleanedQuery);

        function mapArticle(article) {
          var sec = sectionMap[article.section_id] || null;
          // Strip HTML tags from snippet/body for safe text rendering
          function plainText(str) { return str ? str.replace(/<[^>]+>/g, '') : ''; }
          return {
            id:           article.id || null,
            url:          article.html_url || null,
            title:        article.title    || '',
            snippet:      plainText(article.snippet || article.body || '').slice(0, 300),
            updatedAt:    article.updated_at || article.created_at || '',
            voteSum:      article.vote_sum      || 0,
            commentCount: article.comment_count || 0,
            tags:         extractTagNames(article),
            category:     sec ? (categoryMap[sec.categoryId] || null) : null,
            section:      sec ? sec.name : null
          };
        }

        fetchJson(searchBase + '&page=1').then(function(data) {
          if (data && data.results && data.results.length) {
            try {
              console.debug('[SearchTags] sample fields', {
                label_names: data.results[0].label_names,
                content_tag_names: data.results[0].content_tag_names,
                tags: data.results[0].tags,
                content_tags: data.results[0].content_tags
              });
            } catch (e) {}
          }
          (data.results || []).forEach(function(a) { if (a.html_url) allRows[a.html_url] = mapArticle(a); });

          // Keep API count, but preserve native page-count truth for unfiltered pagination.
          searchMeta.totalResults = toPositiveInt(data.count) || searchMeta.totalResults;
          if (searchMeta.totalResults && searchMeta.totalPages) {
            searchMeta.perPage = Math.max(1, Math.ceil(searchMeta.totalResults / searchMeta.totalPages));
          }
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
            hydrateVisibleResultTags(allApiRows);
            hydrateTagsFromArticleDetailsForVisibleCards(allApiRows);
            // Counts must reflect the current page only (what's visible after filtering)
            // so the badge numbers always match what appears when a filter is clicked.
            var currentPageRows = parseResultsFromDoc(document);
            if (allApiRows.length) {
              buildFilters(allApiRows, currentPageRows);
            } else {
              buildFiltersFromCurrentPage();
            }
          });
        }).catch(function() {
          buildFiltersFromCurrentPage();
          hydrateTagsFromArticleDetailsForVisibleCards();
        });

      }).catch(function() {
        // API unavailable — fall back to current page HTML
        buildFiltersFromCurrentPage();
        hydrateTagsFromArticleDetailsForVisibleCards();
      });
    }

    // Build filter UI.
    // rows      = full list (all pages via API) — used to discover all category/section names.
    // pageRows  = current page results — used for count badges so numbers match after filtering.
    //             If omitted, rows is used for both.
    function buildFilters(rows, pageRows) {
      var storageKey = 'search_filters:' + cleanedQuery;
      var storedSelections = {};
      if (isSameSearchReferrer()) {
        try { storedSelections = JSON.parse(sessionStorage.getItem(storageKey)) || {}; } catch (e) { storedSelections = {}; }
      } else {
        try { sessionStorage.removeItem(storageKey); } catch (ex) {}
      }
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

          function rowTimestamp(row) {
            if (!row || !row.updatedAt) return NaN;
            var ts = Date.parse(row.updatedAt);
            return isNaN(ts) ? NaN : ts;
          }

          function sortRowsByRecent(a, b) {
            var tsA = rowTimestamp(a);
            var tsB = rowTimestamp(b);
            if (isNaN(tsA) && isNaN(tsB)) return 0;
            if (isNaN(tsA)) return 1;
            if (isNaN(tsB)) return -1;
            return tsB - tsA;
          }

          var sortedMatching = matching;
          if (sortSelect && sortSelect.value === 'recent') {
            sortedMatching = matching.slice().sort(sortRowsByRecent);
          }

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
                hydrateTagsFromArticleDetailsForVisibleCards(slice);
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

          renderFilteredPage(sortedMatching, 1);
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

      rerenderFilteredResults = updateDependentLists;

      // Wire change handlers
      if (catList) catList.addEventListener('change', updateDependentLists);
      if (secList) secList.addEventListener('change', updateDependentLists);

      // Apply any restored selections immediately
      updateDependentLists();
    } // end buildFilters

    // 5. Build numbered pagination UI
    // For unfiltered results, page count follows Zendesk's native pagination metadata.
    function buildPaginationUI() {
      var wrapper = document.querySelector('.hc-pagination-wrapper');
      if (!wrapper) return;

      var urlParams   = new URLSearchParams(window.location.search);
      var currentPage = parseInt(urlParams.get('page') || '1', 10);
      if (!Number.isFinite(currentPage) || currentPage < 1) currentPage = 1;

      var currentCardCount = document.querySelectorAll('.hc-result-card').length;

      // --- Determine totalResults ---
      var totalResults = searchMeta.totalResults || readResultsCountFromTitle() || 0;
      if (totalResults && !searchMeta.totalResults) searchMeta.totalResults = totalResults;

      // --- Determine totalPages ---
      var totalPages = toPositiveInt(searchMeta.totalPages);
      if (!totalPages && totalResults) {
        var fallbackPerPage = toPositiveInt(searchMeta.perPage);
        if (!fallbackPerPage) {
          // Last-resort fallback when native metadata is unavailable.
          fallbackPerPage = (currentPage === 1 && currentCardCount > 0) ? currentCardCount : 25;
        }
        totalPages = Math.ceil(totalResults / fallbackPerPage);
      }

      // Hide pagination when all results fit on one page
      if (!totalResults || !totalPages || totalPages <= 1) {
        wrapper.innerHTML = '';
        return;
      }

      // Clamp current page to known page bounds.
      currentPage = Math.max(1, Math.min(currentPage, totalPages));

      if (!searchMeta.perPage && totalResults && totalPages) {
        searchMeta.perPage = Math.max(1, Math.ceil(totalResults / totalPages));
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
        hydrateTagsOnlyFromSearchAPI();
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

/* ----------------------------------------------------------
   Auto-refresh when published setting fingerprint changes
   - Watches server-rendered fingerprint in <meta>
   - Checks on focus, tab-visibility, and periodic polling
   - Uses sessionStorage guard to avoid reload loops
---------------------------------------------------------- */
;(function () {
  'use strict';

  var FINGERPRINT_META_SELECTOR = 'meta[name="theme-settings-fingerprint"]';
  var LAST_RELOAD_KEY = 'theme_settings_last_reload_fingerprint';
  var POLL_INTERVAL_MS = 60 * 1000;
  var CHECK_DEBOUNCE_MS = 500;

  var checkTimer = null;
  var checkInFlight = false;
  var suppressReload = false;

  /**
   * Returns true when the current page load is a back/forward navigation.
   * On Back/Forward, the browser is restoring a prior history entry and we
   * must NOT auto-reload — doing so traps the user on the page they tried
   * to leave. Covers both the Navigation Timing API and legacy fallbacks.
   */
  function isBackForwardNavigation() {
    try {
      var navEntries = window.performance
        && typeof window.performance.getEntriesByType === 'function'
        ? window.performance.getEntriesByType('navigation')
        : null;
      if (navEntries && navEntries.length) {
        return navEntries[0].type === 'back_forward';
      }
      // Legacy fallback (deprecated but still present in some browsers)
      if (window.performance && window.performance.navigation) {
        return window.performance.navigation.type === 2; // TYPE_BACK_FORWARD
      }
    } catch (e) {
      // If we cannot determine the nav type, err on the safe side below.
    }
    return false;
  }

  function getCurrentFingerprint(doc) {
    var targetDoc = doc || document;
    var node = targetDoc.querySelector(FINGERPRINT_META_SELECTOR);
    if (!node) return '';
    return (node.getAttribute('content') || '').trim();
  }

  function getReloadedFingerprint() {
    try {
      return sessionStorage.getItem(LAST_RELOAD_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setReloadedFingerprint(value) {
    try {
      sessionStorage.setItem(LAST_RELOAD_KEY, value);
    } catch (e) {
      // Ignore storage failures.
    }
  }

  function extractFingerprintFromHtml(html) {
    var parser = new DOMParser();
    var parsedDoc = parser.parseFromString(html, 'text/html');
    return getCurrentFingerprint(parsedDoc);
  }

  function buildRefreshUrl() {
    var url = new URL(window.location.href);
    url.searchParams.set('__theme_refresh', String(Date.now()));
    return url.toString();
  }

  function fetchLatestFingerprint() {
    var probeUrl = new URL(window.location.href);
    probeUrl.searchParams.set('__theme_probe', String(Date.now()));

    return fetch(probeUrl.toString(), {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'text/html'
      }
    })
      .then(function (response) {
        if (!response.ok) return '';
        return response.text();
      })
      .then(function (html) {
        if (!html) return '';
        return extractFingerprintFromHtml(html);
      })
      .catch(function () {
        return '';
      });
  }

  function maybeReloadForFingerprintChange() {
    if (checkInFlight) return;
    if (suppressReload) return;
    if (isPreviewOrAdminContext()) return;
    checkInFlight = true;

    var currentFingerprint = getCurrentFingerprint();
    if (!currentFingerprint) {
      checkInFlight = false;
      return;
    }

    fetchLatestFingerprint()
      .then(function (latestFingerprint) {
        if (!latestFingerprint || latestFingerprint === currentFingerprint) return;

        if (getReloadedFingerprint() === latestFingerprint) return;

        setReloadedFingerprint(latestFingerprint);
        window.location.replace(buildRefreshUrl());
      })
      .finally(function () {
        checkInFlight = false;
      });
  }

  function scheduleCheck(delayMs) {
    if (checkTimer) window.clearTimeout(checkTimer);
    checkTimer = window.setTimeout(maybeReloadForFingerprintChange, delayMs);
  }

  /**
   * Detects whether the page is running inside Zendesk's theme preview
   * or admin settings context. In these modes, the fingerprint probe
   * returns inconsistent values causing infinite redirect loops.
   */
  function isPreviewOrAdminContext() {
    try {
      var href = window.location.href;
      // Theme preview uses preview_theme_id param or /theming/ path
      if (/[?&]preview_theme_id=/.test(href)) return true;
      if (/\/theming\//.test(href)) return true;
      // Admin guide settings paths
      if (/\/admin\/guide\//.test(href)) return true;
      if (/\/knowledge\/theme_editor/.test(href)) return true;
      // Theme editor embeds the preview in an iframe
      if (window.self !== window.top) return true;
    } catch (e) {
      // Cross-origin iframe access throws — treat as preview context
      return true;
    }
    return false;
  }

  function initSettingsRefreshWatcher() {
    if (!getCurrentFingerprint()) return;
    if (isPreviewOrAdminContext()) return;

    // If the user arrived here via Back/Forward, suppress the very next
    // auto-reload so they land on the page they navigated to.
    if (isBackForwardNavigation()) {
      suppressReload = true;
    }

    // A bfcache restore fires pageshow with persisted=true. Suppress the
    // reload for that cycle and cancel any pending check so Back works.
    window.addEventListener('pageshow', function (event) {
      if (event.persisted || isBackForwardNavigation()) {
        suppressReload = true;
        if (checkTimer) {
          window.clearTimeout(checkTimer);
          checkTimer = null;
        }
        // Clear the suppression after this cycle so normal polling resumes.
        window.setTimeout(function () {
          suppressReload = false;
        }, POLL_INTERVAL_MS);
      }
    });

    window.addEventListener('focus', function () {
      if (suppressReload) return;
      scheduleCheck(CHECK_DEBOUNCE_MS);
    });

    document.addEventListener('visibilitychange', function () {
      if (suppressReload) return;
      if (document.visibilityState === 'visible') {
        scheduleCheck(CHECK_DEBOUNCE_MS);
      }
    });

    window.setInterval(function () {
      maybeReloadForFingerprintChange();
    }, POLL_INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsRefreshWatcher, { once: true });
  } else {
    initSettingsRefreshWatcher();
  }
})();


/* === ANNOUNCEMENT BANNERS === */
;(function() {
  'use strict';

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

  /**
   * Computes the fingerprint-based sessionStorage key for a given banner.
   * Queries the DOM for the banner element, extracts and normalizes content,
   * computes the fingerprint, and builds the storage key.
   *
   * @param {string} bannerId - The banner's data-banner-id value
   * @returns {string|null} The storage key, or null if banner not found or content is empty
   */
  function getStorageKey(bannerId) {
    var banner = document.querySelector(
      '.announcement-banner[data-banner-id="' + bannerId + '"]'
    );
    if (!banner) return null;

    var version = banner.getAttribute('data-banner-version') || '';
    var raw = extractBannerContent(banner);
    var normalized = normalizeContent(raw);
    if (!normalized) return null;

    var fp = computeFingerprint(normalized);
    if (!fp) return null;

    return buildStorageKey(bannerId, fp, version);
  }

  /**
   * Checks whether a banner has been dismissed in the current session.
   * Fail-open: returns false if sessionStorage is unavailable or throws.
   * @param {string} bannerId
   * @returns {boolean}
   */
  function isDismissed(bannerId) {
    try {
      var key = getStorageKey(bannerId);
      if (!key) return false;
      return sessionStorage.getItem(key) === 'true';
    } catch (e) {
      return false;
    }
  }

  /**
   * Dismisses a banner: hides it, persists state, and manages focus.
   * @param {string} bannerId
   */
  function dismissBanner(bannerId) {
    var banner = document.querySelector('.announcement-banner[data-banner-id="' + bannerId + '"]');
    if (!banner) return;

    // Hide the banner
    banner.setAttribute('hidden', '');
    banner.setAttribute('aria-hidden', 'true');

    // Persist to sessionStorage (fail-silent on error)
    try {
      var key = getStorageKey(bannerId);
      if (key) sessionStorage.setItem(key, 'true');
    } catch (e) {
      // Suppress storage errors — banner is already visually hidden
    }

    // Focus management: next visible banner's dismiss button → .hero → document.body
    var nextBanner = document.querySelector('.announcement-banner:not([hidden])');
    if (nextBanner) {
      var nextDismissBtn = nextBanner.querySelector('[data-dismiss-banner]');
      if (nextDismissBtn) {
        nextDismissBtn.focus();
        return;
      }
    }

    var hero = document.querySelector('.hero');
    if (hero) {
      hero.setAttribute('tabindex', '-1');
      hero.focus();
    } else {
      document.body.focus();
    }
  }

  /**
   * Click/keyboard event handler for dismiss buttons.
   * @param {Event} event
   */
  function handleDismissClick(event) {
    var button = event.currentTarget;
    var bannerId = button.getAttribute('data-dismiss-banner');
    if (!bannerId) return;
    dismissBanner(bannerId);
  }

  /**
   * Initializes banner dismissal listeners on DOMContentLoaded.
   */
  function init() {
    var buttons = document.querySelectorAll('[data-dismiss-banner]');
    if (!buttons.length) return;

    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];

      // Hide already-dismissed banners on init
      var bannerId = btn.getAttribute('data-dismiss-banner');
      if (bannerId && isDismissed(bannerId)) {
        var banner = document.querySelector('.announcement-banner[data-banner-id="' + bannerId + '"]');
        if (banner) {
          banner.setAttribute('hidden', '');
          banner.setAttribute('aria-hidden', 'true');
        }
      }

      // Attach click listener
      btn.addEventListener('click', handleDismissClick);

      // Attach keydown listener for Enter and Space
      btn.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleDismissClick(event);
        }
      });
    }
  }

  // Attach on DOMContentLoaded or immediately if DOM is already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

/* === Article View Count === */
(function() {
  var el = document.getElementById('article-view-count');
  if (!el) return;
  var id = el.getAttribute('data-article-id');
  if (!id) return;
  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 10000);
  fetch('/api/v2/help_center/articles/' + id + '.json', { signal: controller.signal })
    .then(function(r) {
      if (!r.ok) throw new Error();
      return r.json();
    })
    .then(function(d) {
      if (d && d.article && Number.isFinite(d.article.view_count)) {
        el.textContent = d.article.view_count;
      } else {
        el.textContent = '0';
      }
    })
    .catch(function() { el.textContent = '0'; })
    .finally(function() { clearTimeout(timeoutId); });
})();

/* === Reading Progress Bar === */
(function() {
  if (!document.querySelector('.article-page')) return;

  var articleContentEl = document.querySelector('.article-content');
  if (!articleContentEl) return;

  var bar = document.createElement('div');
  bar.id = 'reading-progress-bar';
  bar.className = 'reading-progress-bar';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuenow', '0');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  bar.setAttribute('aria-label', 'Reading progress');
  document.body.appendChild(bar);

  var ticking = false;

  function updateProgress() {
    var articleTop = articleContentEl.getBoundingClientRect().top + window.scrollY;
    var articleHeight = articleContentEl.offsetHeight;
    var scrollY = window.scrollY;

    var percentage = 0;
    if (articleHeight > 0) {
      percentage = ((scrollY - articleTop) / articleHeight) * 100;
      percentage = Math.max(0, Math.min(100, percentage));
    }

    bar.style.width = percentage + '%';
    bar.setAttribute('aria-valuenow', String(Math.round(percentage)));
    ticking = false;
  }

  window.addEventListener('scroll', function() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(updateProgress);
    }
  });

  updateProgress();
})();
