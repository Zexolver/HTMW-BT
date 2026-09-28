// Entry point for the howthemarketworks.com content script.
//
// Two independent features, each toggleable from the popup:
//   1. Color-coding: replace the small up/down arrow-in-circle gain/loss
//      indicator with a full box outline + translucent fill, where the
//      color's strength scales with the size of the percentage move.
//   2. Dark mode: a generic filter-based dark theme for the whole page.
//
// NOTE: This first pass detects gain/loss indicators heuristically
// (by color + shape + nearby "%"/"$" text) rather than via hardcoded
// site selectors, since the portfolio pages are behind login and their
// exact markup hasn't been inspected yet. Expect to tighten the
// detection logic once real markup is available.
(function () {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;

  const DEFAULTS = { darkMode: false, colorCoding: true };
  const PERCENT_CAP = 20; // % move at which color intensity maxes out
  const MIN_INTENSITY = 0.15; // floor so small moves are still visible
  const GREEN = "34,197,94";
  const RED = "239,68,68";
  const MAX_BOX_SIZE = 40; // px, indicator glyphs are small
  const MAX_ANCESTOR_HOPS = 4;

  let settings = { ...DEFAULTS };
  let observer = null;

  function applyDarkMode(enabled) {
    document.documentElement.classList.toggle("htmw-bt-dark", enabled);
  }

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

  function parseRgb(str) {
    const m = str && str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }

  function findIndicatorCandidates(root) {
    const candidates = [];
    const all = root.querySelectorAll("*");
    for (const el of all) {
      if (el.classList.contains("htmw-bt-box") || el.closest(".htmw-bt-box"))
        continue;
      const rect = el.getBoundingClientRect();
      if (
        rect.width === 0 ||
        rect.height === 0 ||
        rect.width > MAX_BOX_SIZE ||
        rect.height > MAX_BOX_SIZE
      )
        continue;

      const style = getComputedStyle(el);
      const bg = parseRgb(style.backgroundColor);
      const fg = parseRgb(style.color);
      const kind = (bg && classify(bg)) || (fg && classify(fg));
      if (!kind) continue;

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

  function styleBox(box, kind, percent) {
    const intensity =
      percent === null
        ? MIN_INTENSITY
        : Math.min(1, MIN_INTENSITY + (percent / PERCENT_CAP) * (1 - MIN_INTENSITY));
    box.style.setProperty("--htmw-bt-color", kind === "gain" ? GREEN : RED);
    box.style.setProperty("--htmw-bt-intensity", intensity.toFixed(2));
    box.classList.add("htmw-bt-box");
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
    });
    root.querySelectorAll(".htmw-bt-hide-indicator").forEach((el) => {
      el.classList.remove("htmw-bt-hide-indicator");
    });
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  let pendingRoots = new Set();

  const flushPendingRoots = debounce(() => {
    const roots = pendingRoots;
    pendingRoots = new Set();
    for (const root of roots) {
      if (root.isConnected) runColorCoding(root);
    }
  }, 250);

  function startObserving() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const root =
          m.type === "characterData" ? m.target.parentElement : m.target;
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

  function init() {
    api.storage.sync.get(DEFAULTS).then((stored) => {
      settings = { ...DEFAULTS, ...stored };
      applyDarkMode(settings.darkMode);
      if (settings.colorCoding) {
        runColorCoding(document.body);
        startObserving();
      }
    });

    api.storage.onChanged.addListener((changes) => {
      if (changes.darkMode) {
        settings.darkMode = changes.darkMode.newValue;
        applyDarkMode(settings.darkMode);
      }
      if (changes.colorCoding) {
        settings.colorCoding = changes.colorCoding.newValue;
        if (settings.colorCoding) {
          runColorCoding(document.body);
          startObserving();
        } else if (observer) {
          observer.disconnect();
          observer = null;
          clearColorCoding(document.body);
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
