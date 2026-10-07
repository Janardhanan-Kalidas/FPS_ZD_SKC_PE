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
      "max-width:90%;max-height:90%;box-sizing:border-box}" +
      ".hilti-lb-modal-header{display:flex;align-items:center;justify-content:flex-end;" +
      "padding:12px 12px 8px;flex:0 0 auto}" +
      ".hilti-lb-body{position:relative;display:flex;align-items:center;justify-content:center;" +
      "padding:0 24px 24px;overflow:auto;min-height:0}" +
      ".hilti-lb-img{display:block;max-width:100%;max-height:72vh;object-fit:contain;background:#fff}" +
      ".hilti-lb-caption{margin:0;padding:0 24px 20px;color:#524f53;text-align:center;" +
      "font-size:14px;line-height:1.4;flex:0 0 auto}" +
      ".hilti-lb-close{background:none;border:0;cursor:pointer;padding:6px;border-radius:0;" +
      "color:#524f53;line-height:0;transition:color .2s}" +
      ".hilti-lb-close:hover{color:#D2051E}" +
      ".hilti-lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:transparent;" +
      "border:0;color:#524f53;cursor:pointer;line-height:1;padding:12px;font-size:44px}" +
      ".hilti-lb-prev{left:4px}.hilti-lb-next{right:4px}" +
      ".hilti-lb-close:focus,.hilti-lb-nav:focus{outline:2px solid #524f53;outline-offset:2px}";
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
    prevBtn.textContent = "\u2039";

    var nextBtn = doc.createElement("button");
    nextBtn.className = "hilti-lb-nav hilti-lb-next";
    nextBtn.setAttribute("type", "button");
    nextBtn.setAttribute("aria-label", "Next image");
    nextBtn.textContent = "\u203a";

    header.appendChild(closeBtn);
    if (group.length > 1) {
      body.appendChild(prevBtn);
    }
    body.appendChild(image);
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

  function onClick(e) {
    var target = e.target;
    var anchor = target && target.closest ? target.closest("[" + ATTR + "]") : null;
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
