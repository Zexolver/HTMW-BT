# HTMW Better Trading

A lightweight browser extension (Chromium + Firefox) that improves the
readability of [howthemarketworks.com](https://www.howthemarketworks.com/).

## What it does

- **Gain/loss color-coding.** Replaces the tiny up/down arrow inside a
  red or green circle with a fully color-outlined box, filled with a
  faint/transparent tint mixed with the background. The outline and
  fill color is much easier to scan at a glance than the small arrow
  icon.
- **Intensity scales with magnitude.** The brightness/saturation of the
  color reflects how far the value has moved from cost basis, not just
  its direction:
  - Brighter green = more gained relative to what was paid.
  - Brighter red = more lost relative to what was paid.
  - Faint red/green = the change is small in magnitude either way.
- **Optional dark mode.** A site-wide dark theme, toggled independently
  of the color-coding feature.

## Design constraints

- Pure vanilla JS/CSS, no build step, no bundler, no runtime
  dependencies — keeps the extension small and auditable.
- Manifest V3, using `browser_specific_settings.gecko` so the same
  package loads in both Chromium-based browsers and Firefox.
- One small cross-browser shim (`typeof browser !== "undefined" ?
  browser : chrome`) instead of pulling in a polyfill library.

## Structure

```
manifest.json       Extension manifest (MV3, cross-browser)
src/content.js       Injected into howthemarketworks.com pages
src/content.css       Styles for the re-colored boxes / dark mode
src/popup.html/.js/.css   Toolbar popup (settings: dark mode toggle)
```

## Development

Load as an unpacked extension:

- **Chrome/Chromium:** `chrome://extensions` → Developer mode → Load
  unpacked → select this folder.
- **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary
  Add-on → select `manifest.json`.

## Status

Early scaffolding — color-coding and dark mode logic are not yet
implemented.
