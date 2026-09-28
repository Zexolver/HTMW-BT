// Entry point for the howthemarketworks.com content script.
//
// Two independent features, each toggleable from the popup:
//   1. Color-coding: replace the small up/down arrow-in-circle gain/loss
//      indicator with a full box outline + translucent fill (plus a
//      solid colored arrow), where the color's strength scales with the
//      size of the percentage move.
//   2. Dark mode: a Firefox-style dark-gray repaint (not a raw color
//      invert) of any element with an explicit light background/dark
//      text, so page chrome goes dark while charts/graphs still adjust.
//
// NOTE: Both features detect targets heuristically (by color, shape, and
// nearby "%" text) rather than via hardcoded site selectors, since the
// portfolio pages are behind login and their exact markup hasn't been
// inspected directly. Expect to keep tightening this based on real
// on-site testing feedback.
(function () {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;

  const DEFAULTS = { darkMode: false, colorCoding: true };

  // --- Color-coding tuning ---
  const PERCENT_CAP = 20; // % move at which color intensity maxes out
  const MIN_INTENSITY = 0.15; // floor so small moves are still visible
  const GREEN = "34,197,94";
  const RED = "239,68,68";
  const MAX_BOX_SIZE = 40; // px, indicator glyphs are small
  const MAX_ANCESTOR_HOPS = 4;
  // Sidebar/widget areas that should never get gain/loss boxing, even if
  // a small colored round element (e.g. a pie-chart wedge or badge dot)
  // happens to live inside them.
  const EXCLUDE_ANCESTOR_PATTERN =
    /chart|legend|graph|widget|sidebar|announce|assignment|summary|donut|pie|calendar|feed|news|word[-_]?of[-_]?the[-_]?day|wotd/i;

  // --- Dark mode tuning (Firefox dark-theme-ish palette) ---
  // Two background tiers give page chrome some depth (cards vs. their
  // surroundings); the page base itself (html/body, in content.css) is
  // a single flat color regardless of this tiering.
  const DARK_BG_MID = "#2b2a33";
  const DARK_BG_LIGHT = "#403f47";
  const LIGHT_TEXT = "#fbfbfe";
  const LIGHT_BG_THRESHOLD = 200; // near-white -> DARK_BG_MID
  const MID_BG_THRESHOLD = 120; // light gray -> DARK_BG_LIGHT
  const DARK_TEXT_THRESHOLD = 120; // dark text -> LIGHT_TEXT
  // Skip recoloring backgrounds with real color in them (buttons, brand
  // accents, badges) — only flatten neutral/near-white/gray chrome so
  // the site doesn't lose its accent colors under dark mode.
  const SATURATION_GUARD = 30;

  let settings = { ...DEFAULTS };
  let observer = null;
  const darkenedElements = new WeakMap();

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function parseRgb(str) {
    const m = str && str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null; // fully transparent
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  function luminance([r, g, b]) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function saturation([r, g, b]) {
    return Math.max(r, g, b) - Math.min(r, g, b);
  }

  // ---------------- Dark mode ----------------

  function darkenElement(el) {
    const style = getComputedStyle(el);
    const bg = parseRgb(style.backgroundColor);
    const fg = parseRgb(style.color);
    const saved = {};
    let touched = false;

    if (bg && saturation(bg) < SATURATION_GUARD) {
      const l = luminance(bg);
      if (l > LIGHT_BG_THRESHOLD) {
        saved.backgroundColor = el.style.getPropertyValue("background-color");
        el.style.setProperty("background-color", DARK_BG_MID, "important");
        touched = true;
      } else if (l > MID_BG_THRESHOLD) {
        saved.backgroundColor = el.style.getPropertyValue("background-color");
        el.style.setProperty("background-color", DARK_BG_LIGHT, "important");
        touched = true;
      }
    }

    if (fg && luminance(fg) < DARK_TEXT_THRESHOLD) {
      saved.color = el.style.getPropertyValue("color");
      el.style.setProperty("color", LIGHT_TEXT, "important");
      touched = true;
    }

    // Gradient backgrounds (hero banners, buttons, etc.) aren't caught by
    // the background-color check above and otherwise stay light.
    if (/gradient/i.test(style.backgroundImage)) {
      saved.backgroundImage = el.style.getPropertyValue("background-image");
      el.style.setProperty("background-image", "none", "important");
      touched = true;
    }

    if (touched) darkenedElements.set(el, saved);
  }

  function undarkenElement(el) {
    const saved = darkenedElements.get(el);
    if (!saved) return;
    if ("backgroundColor" in saved) {
      if (saved.backgroundColor) el.style.setProperty("background-color", saved.backgroundColor);
      else el.style.removeProperty("background-color");
    }
    if ("color" in saved) {
      if (saved.color) el.style.setProperty("color", saved.color);
      else el.style.removeProperty("color");
    }
    if ("backgroundImage" in saved) {
      if (saved.backgroundImage) el.style.setProperty("background-image", saved.backgroundImage);
      else el.style.removeProperty("background-image");
    }
    darkenedElements.delete(el);
  }

  function runDarkMode(root) {
    if (!settings.darkMode) return;
    darkenElement(root);
    root.querySelectorAll("*").forEach(darkenElement);
  }

  function clearDarkMode(root) {
    undarkenElement(root);
    root.querySelectorAll("*").forEach(undarkenElement);
  }

  function applyDarkMode(enabled) {
    document.documentElement.classList.toggle("htmw-bt-dark", enabled);
    if (enabled) runDarkMode(document.documentElement);
    else clearDarkMode(document.documentElement);
  }

  // ---------------- Gain/loss color-coding ----------------

  function hue(rgb) {
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  }

  function classify(rgb) {
    const [r, g, b] = rgb;
    const h = hue(rgb);
    const saturated = Math.max(r, g, b) - Math.min(r, g, b) > 40;
    if (!saturated) return null;
    if (h >= 80 && h <= 170) return "gain";
    if (h <= 20 || h >= 340) return "loss";
    return null;
  }

  function isRoundOrIcon(el, rect, style) {
    if (el.tagName === "I" || el.tagName === "SVG" || el.getAttribute("aria-hidden") === "true")
      return true;
    const radius = parseFloat(style.borderRadius);
    if (!radius) return false;
    if (style.borderRadius.trim().endsWith("%")) return radius >= 40;
    return radius >= Math.min(rect.width, rect.height) * 0.35;
  }

  function isExcluded(el) {
    let node = el;
    for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
      const idClass = `${node.id || ""} ${String(node.className || "")}`;
      if (EXCLUDE_ANCESTOR_PATTERN.test(idClass)) return true;
    }
    return false;
  }

  function findIndicatorCandidates(root) {
    const candidates = [];
    const all = root.querySelectorAll("*");
    for (const el of all) {
      if (el.classList.contains("htmw-bt-box") || el.closest(".htmw-bt-box")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || rect.width > MAX_BOX_SIZE || rect.height > MAX_BOX_SIZE)
        continue;

      const style = getComputedStyle(el);
      if (!isRoundOrIcon(el, rect, style)) continue;

      const bg = parseRgb(style.backgroundColor);
      const fg = parseRgb(style.color);
      const kind = (bg && classify(bg)) || (fg && classify(fg));
      if (!kind) continue;
      if (isExcluded(el)) continue;

      candidates.push({ el, kind });
    }
    return candidates;
  }

  function findMagnitudePercent(box) {
    const match = box.textContent.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
    return match ? Math.abs(parseFloat(match[1])) : null;
  }

  function findBoxAncestor(el) {
    let node = el;
    for (let i = 0; i < MAX_ANCESTOR_HOPS; i++) {
      if (!node.parentElement) break;
      node = node.parentElement;
      if (
        node.tagName === "TD" ||
        node.tagName === "TH" ||
        /cell|item|value|holding|position|row/i.test(node.className || "")
      ) {
        return node;
      }
    }
    return node;
  }

  function addArrow(box, kind) {
    if (box.querySelector(".htmw-bt-arrow")) return;
    const arrow = document.createElement("span");
    arrow.className = "htmw-bt-arrow";
    arrow.textContent = kind === "gain" ? "▲" : "▼";
    arrow.setAttribute("aria-hidden", "true");
    box.append(arrow);
  }

  function styleBox(box, kind, percent) {
    const intensity =
      percent === null
        ? MIN_INTENSITY
        : Math.min(1, MIN_INTENSITY + (percent / PERCENT_CAP) * (1 - MIN_INTENSITY));
    box.style.setProperty("--htmw-bt-color", kind === "gain" ? GREEN : RED);
    box.style.setProperty("--htmw-bt-intensity", intensity.toFixed(2));
    box.classList.add("htmw-bt-box");
    addArrow(box, kind);
  }

  function runColorCoding(root) {
    if (!settings.colorCoding) return;
    const candidates = findIndicatorCandidates(root);
    for (const { el, kind } of candidates) {
      const box = findBoxAncestor(el);
      const percent = findMagnitudePercent(box);
      styleBox(box, kind, percent);
      el.classList.add("htmw-bt-hide-indicator");
    }
  }

  function clearColorCoding(root) {
    root.querySelectorAll(".htmw-bt-box").forEach((el) => {
      el.classList.remove("htmw-bt-box");
      el.style.removeProperty("--htmw-bt-color");
      el.style.removeProperty("--htmw-bt-intensity");
      const arrow = el.querySelector(".htmw-bt-arrow");
      if (arrow) arrow.remove();
    });
    root.querySelectorAll(".htmw-bt-hide-indicator").forEach((el) => {
      el.classList.remove("htmw-bt-hide-indicator");
    });
  }

  // ---------------- Shared mutation watching ----------------

  let pendingRoots = new Set();

  const flushPendingRoots = debounce(() => {
    const roots = pendingRoots;
    pendingRoots = new Set();
    for (const root of roots) {
      if (!root.isConnected) continue;
      runColorCoding(root);
      runDarkMode(root);
    }
  }, 250);

  function startObserving() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const root = m.type === "characterData" ? m.target.parentElement : m.target;
        if (root instanceof Element) pendingRoots.add(root);
      }
      if (pendingRoots.size) flushPendingRoots();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function stopObservingIfIdle() {
    if (!settings.colorCoding && !settings.darkMode && observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function init() {
    api.storage.sync.get(DEFAULTS).then((stored) => {
      settings = { ...DEFAULTS, ...stored };
      applyDarkMode(settings.darkMode);
      if (settings.colorCoding) runColorCoding(document.body);
      if (settings.colorCoding || settings.darkMode) startObserving();
    });

    api.storage.onChanged.addListener((changes) => {
      if (changes.darkMode) {
        settings.darkMode = changes.darkMode.newValue;
        applyDarkMode(settings.darkMode);
        if (settings.darkMode) startObserving();
        else stopObservingIfIdle();
      }
      if (changes.colorCoding) {
        settings.colorCoding = changes.colorCoding.newValue;
        if (settings.colorCoding) {
          runColorCoding(document.body);
          startObserving();
        } else {
          clearColorCoding(document.body);
          stopObservingIfIdle();
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
