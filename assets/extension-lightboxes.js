(function () {
  "use strict";

  // Native, no-jQuery image lightbox for `.content img`.
  // Replaces the former Fancybox/jQuery implementation. Self-contained IIFE:
  // no window.* globals, no external dependencies. Overlay CSS is injected from
  // JS via a one-time <style> element (never added to style.css).

  var ATTR = "data-hilti-lightbox";
  var CAPTION_ATTR = "data-caption";
  var STYLE_ID = "hilti-lightbox-style";
  var LOAD_TIMEOUT = 5000; // AC 3.5: navigate to full image if it neither loads nor errors in 5s

  // Only http(s) and protocol-relative/relative image URLs are allowed as
  // lightbox targets; reject javascript: and other unsafe schemes.
  function isSafeHref(href) {
    if (!href) return false;
    var trimmed = String(href).trim();
    if (/^(https?:)?\/\//i.test(trimmed)) return true; // absolute or protocol-relative
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false; // any other explicit scheme (javascript:, data:, etc.)
    return true; // relative path (e.g. /attachments/foo.png)
  }

  // --- Markup pass: wire every eligible .content img for the lightbox ---
  function wire(doc) {
    var imgs = doc.querySelectorAll(".content img");
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var parentAnchor = img.closest ? img.closest("a") : null;

      if (parentAnchor) {
        // Image already inside an anchor: decorate the anchor only when its
        // href points at a safe image URL — never double-wrap.
        var existingHref = parentAnchor.getAttribute("href");
        if (isSafeHref(existingHref)) {
          parentAnchor.setAttribute(ATTR, "");
          if (!parentAnchor.hasAttribute(CAPTION_ATTR) && img.getAttribute("alt")) {
            parentAnchor.setAttribute(CAPTION_ATTR, img.getAttribute("alt"));
          }
        }
        continue;
      }

      var src = img.getAttribute("src");
      if (!isSafeHref(src)) continue;

      var a = doc.createElement("a");
      a.setAttribute("href", src);
      a.setAttribute(ATTR, "");
      // Caption via textContent/attribute only — never innerHTML.
      if (img.getAttribute("alt")) {
        a.setAttribute(CAPTION_ATTR, img.getAttribute("alt"));
      }
      img.insertAdjacentElement("afterend", a);
      a.appendChild(img);
    }
  }

  // --- One-time overlay CSS injection ---
  function injectStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    var style = doc.createElement("style");
    style.id = STYLE_ID;
    // Centered white pop-up modal styled like the language-selector modal
    // (.hilti-lang-modal / .hilti-lang-close): dimmed backdrop, white (#fff)
    // modal box with a top-right close (X) button, image centered inside.
    style.textContent =
      ".hilti-lb-backdrop{position:fixed;inset:0;top:0;left:0;right:0;bottom:0;" +
      "width:100%;height:100%;background:rgba(0,0,0,.5);z-index:2147483000;" +
      "display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}" +
      ".hilti-lb-modal{position:relative;display:flex;flex-direction:column;" +
      "background:#fff;border-radius:2px;box-shadow:0 12px 40px rgba(0,0,0,.2);" +
      "max-width:92%;max-height:90%;box-sizing:border-box}" +
      // Header matches the lang-selector modal header: bottom divider + same padding,
      // close button aligned to the right within it.
      ".hilti-lb-modal-header{display:flex;align-items:center;justify-content:flex-end;" +
      "padding:20px 24px 16px;border-bottom:1px solid #E5E7EB;flex:0 0 auto}" +
      // Body is a row: [prev] [stage] [next]. The nav chevrons live INSIDE the modal
      // in their own column, so the modal widens to accommodate them and they never
      // overlap the image.
      ".hilti-lb-body{position:relative;display:flex;align-items:center;justify-content:center;" +
      "gap:8px;padding:20px 24px 24px;overflow:auto;min-height:0}" +
      // Light-grey stage: a visible grey (#f7f5f2) container framing the image. A fixed
      // 24px pad on all sides is the grey frame; the image sits centered inside it and is
      // sized to leave that pad intact (the pad is subtracted from the image's max box),
      // so the grey always shows regardless of the image's own background.
      ".hilti-lb-stage{display:flex;align-items:center;justify-content:center;" +
      "background:#f7f5f2;padding:24px;border:1px solid #E5E7EB;border-radius:2px;" +
      "box-sizing:border-box;min-width:0}" +
      // White backing + hairline border on the image gives a clear edge against the grey
      // stage, so the frame reads even when the image's own content is light-coloured.
      ".hilti-lb-img{display:block;margin:0 auto;max-width:100%;" +
      "max-height:64vh;object-fit:contain;background:#fff;" +
      "box-shadow:0 0 0 1px rgba(82,79,83,.12)}" +
      ".hilti-lb-caption{margin:0;padding:0 24px 20px;color:#524f53;text-align:center;" +
      "font-size:14px;line-height:1.4;flex:0 0 auto}" +
      ".hilti-lb-close{display:inline-flex;align-items:center;justify-content:center;" +
      "background:none;border:0;cursor:pointer;" +
      "padding:4px;border-radius:0;color:#524f53;line-height:0;transition:color .2s}" +
      ".hilti-lb-close:hover{color:#D2051E}" +
      // Nav chevrons are flex children of the body (their own column beside the stage),
      // vertically centered, Hilti-dark with red hover.
      ".hilti-lb-nav{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;" +
      "background:transparent;border:0;color:#524f53;cursor:pointer;line-height:0;" +
      "padding:4px;transition:color .2s}" +
      ".hilti-lb-nav svg{width:28px;height:28px;display:block}" +
      ".hilti-lb-nav:hover{color:#D2051E}" +
      // Nav buttons never show an outline box (no focus ring). The close button keeps
      // a keyboard-only focus ring for accessibility.
      ".hilti-lb-nav:focus,.hilti-lb-nav:focus-visible{outline:none}" +
      ".hilti-lb-close:focus-visible{outline:2px solid #524f53;outline-offset:2px}";
    (doc.head || doc.documentElement).appendChild(style);
  }

  // --- Overlay controller ---
  function openLightbox(doc, anchor) {
    injectStyle(doc);

    var win = doc.defaultView || window;
    var opener = anchor;

    // Build the group: anchors sharing the SAME nearest .content ancestor.
    var scope = anchor.closest ? anchor.closest(".content") : null;
    var group;
    if (scope) {
      group = Array.prototype.slice.call(scope.querySelectorAll("[" + ATTR + "]"));
    } else {
      group = [anchor];
    }
    var index = group.indexOf(anchor);
    if (index < 0) {
      group = [anchor];
      index = 0;
    }

    // Dimmed backdrop (click-to-close target) hosting a centered white modal.
    var backdrop = doc.createElement("div");
    backdrop.className = "hilti-lb-backdrop";

    var modal = doc.createElement("div");
    modal.className = "hilti-lb-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    var header = doc.createElement("div");
    header.className = "hilti-lb-modal-header";

    var body = doc.createElement("div");
    body.className = "hilti-lb-body";

    // Light-grey stage wrapping the image, inside the body.
    var stage = doc.createElement("div");
    stage.className = "hilti-lb-stage";

    var image = doc.createElement("img");
    image.className = "hilti-lb-img";
    image.setAttribute("alt", "");

    var caption = doc.createElement("div");
    caption.className = "hilti-lb-caption";

    // Close (X) button reuses the lang-selector modal's icon + style
    // (.hilti-lang-close path "M15 5L5 15M5 5L15 15").
    var closeBtn = doc.createElement("button");
    closeBtn.className = "hilti-lb-close";
    closeBtn.setAttribute("type", "button");
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">' +
      '<path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
      "</svg>";

    var prevBtn = doc.createElement("button");
    prevBtn.className = "hilti-lb-nav hilti-lb-prev";
    prevBtn.setAttribute("type", "button");
    prevBtn.setAttribute("aria-label", "Previous image");
    // Exact Figma chevron (24x24, fill:currentColor so CSS controls the color).
    prevBtn.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path fill-rule="evenodd" clip-rule="evenodd" d="M14.3863 5.45926L16.154 7.22703L11.382 11.9993L16.154 16.773L14.3863 18.5407L7.84596 11.9996L14.3863 5.45926Z" fill="currentColor"/>' +
      "</svg>";

    var nextBtn = doc.createElement("button");
    nextBtn.className = "hilti-lb-nav hilti-lb-next";
    nextBtn.setAttribute("type", "button");
    nextBtn.setAttribute("aria-label", "Next image");
    nextBtn.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path fill-rule="evenodd" clip-rule="evenodd" d="M9.61373 18.5407L7.84596 16.773L12.618 12.0007L7.84596 7.22703L9.61373 5.45926L14.3863 10.2327L16.154 12.0004L9.61373 18.5407Z" fill="currentColor"/>' +
      "</svg>";

    header.appendChild(closeBtn);
    // Image goes inside the light-grey stage; body is a row [prev] [stage] [next]
    // so the chevrons sit in their own column inside the (widened) modal.
    stage.appendChild(image);
    if (group.length > 1) {
      body.appendChild(prevBtn);
    }
    body.appendChild(stage);
    if (group.length > 1) {
      body.appendChild(nextBtn);
    }
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(caption);
    backdrop.appendChild(modal);

    var timer = null;
    var destroyed = false;

    function hrefOf(a) {
      return a.getAttribute("href");
    }

    function clearTimer() {
      if (timer !== null) {
        win.clearTimeout(timer);
        timer = null;
      }
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimer();
      doc.removeEventListener("keydown", onKeydown, true);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      doc.documentElement.style.overflow = prevOverflow;
      if (opener && opener.focus) opener.focus();
    }

    function navigateToFull() {
      var href = hrefOf(group[index]);
      destroy();
      win.location = href;
    }

    function preload(i) {
      if (i < 0 || i >= group.length) return;
      var pre = new win.Image();
      pre.src = hrefOf(group[i]);
    }

    function show(i) {
      clearTimer();
      index = ((i % group.length) + group.length) % group.length; // wrap-around
      var current = group[index];
      var href = hrefOf(current);
      var cap = current.getAttribute(CAPTION_ATTR) || "";
      caption.textContent = cap;
      caption.style.display = cap ? "" : "none";

      image.onerror = function () {
        navigateToFull();
      };
      image.src = href;

      // AC 3.5: if the image neither loads nor errors within 5s, bail to the URL.
      timer = win.setTimeout(function () {
        navigateToFull();
      }, LOAD_TIMEOUT);
      image.onload = function () {
        clearTimer();
      };

      preload(index + 1);
      preload(index - 1);
    }

    function onKeydown(e) {
      if (e.key === "Escape" || e.keyCode === 27) {
        e.preventDefault();
        destroy();
      } else if (group.length > 1 && (e.key === "ArrowRight" || e.keyCode === 39)) {
        e.preventDefault();
        show(index + 1);
      } else if (group.length > 1 && (e.key === "ArrowLeft" || e.keyCode === 37)) {
        e.preventDefault();
        show(index - 1);
      }
    }

    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) destroy();
    });
    closeBtn.addEventListener("click", destroy);
    prevBtn.addEventListener("click", function () { show(index - 1); });
    nextBtn.addEventListener("click", function () { show(index + 1); });
    doc.addEventListener("keydown", onKeydown, true);

    var prevOverflow = doc.documentElement.style.overflow;
    doc.documentElement.style.overflow = "hidden";
    (doc.body || doc.documentElement).appendChild(backdrop);
    closeBtn.focus();
    show(index);
  }

  // Lazily wire an eligible image anchor that `wire()` never marked (e.g. article
  // content rendered after init, such as an article opened from search results).
  // Returns the wired anchor, or null if the click is not on a lightbox-eligible image.
  function resolveAnchor(target) {
    if (!target || !target.closest) return null;
    var anchor = target.closest("[" + ATTR + "]");
    if (anchor) return anchor;
    // Not yet wired: is this a click on a .content image (optionally inside an anchor)?
    var img = target.closest(".content img");
    if (!img) return null;
    var a = img.closest ? img.closest("a") : null;
    var doc = img.ownerDocument || document;
    if (a) {
      if (!isSafeHref(a.getAttribute("href"))) return null;
      a.setAttribute(ATTR, "");
      if (!a.hasAttribute(CAPTION_ATTR) && img.getAttribute("alt")) {
        a.setAttribute(CAPTION_ATTR, img.getAttribute("alt"));
      }
      return a;
    }
    var src = img.getAttribute("src");
    if (!isSafeHref(src)) return null;
    var wrap = doc.createElement("a");
    wrap.setAttribute("href", src);
    wrap.setAttribute(ATTR, "");
    if (img.getAttribute("alt")) wrap.setAttribute(CAPTION_ATTR, img.getAttribute("alt"));
    img.insertAdjacentElement("afterend", wrap);
    wrap.appendChild(img);
    return wrap;
  }

  function onClick(e) {
    var target = e.target;
    var anchor = resolveAnchor(target);
    if (!anchor) return;
    // Build the overlay first, then suppress the native navigation.
    // stopPropagation + stopImmediatePropagation prevent the click from bubbling
    // to the document-level page-loading-indicator listener in document_head.hbs,
    // which would otherwise treat this anchor as a real navigation and show a
    // full-screen spinner/progress bar that never clears (no navigation occurs).
    e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    openLightbox(anchor.ownerDocument || document, anchor);
  }

  function init(doc) {
    wire(doc);
    doc.addEventListener("click", onClick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(document); });
  } else {
    init(document);
  }
})();
