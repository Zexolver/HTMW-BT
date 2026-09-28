# HTMW-BT (Better Theming)

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

## Install

Grab the zip from the [latest release](https://github.com/Zexolver/HTMW-BT/releases/latest),
unzip it, then:

- **Chrome / Edge / Brave (Chromium-based):**
  1. Go to `chrome://extensions`.
  2. Turn on **Developer mode** (top right).
  3. Click **Load unpacked** and select the unzipped folder.
- **Firefox:**
  - *Temporary (until browser restart), any Firefox:*
    `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
    select `manifest.json` inside the unzipped folder.
  - *Permanent:* Firefox only runs permanently-installed extensions that
    are signed by Mozilla, or unsigned ones if you're on Firefox
    Developer Edition/Nightly/ESR with `xpinstall.signatures.required`
    set to `false` in `about:config`. Otherwise, re-run "Load Temporary
    Add-on" after each restart.

## Development

Load the `src/` + `manifest.json` straight from this repo as an unpacked
extension (same steps as above, pointed at the repo folder instead of a
release zip).

To produce a release zip yourself: `./scripts/build.sh` → writes
`dist/htmw-bt-<version>.zip`.

## Status

Dark mode is a working generic invert-filter theme. Gain/loss
color-coding uses heuristic detection (color + shape + nearby "%" text)
rather than hardcoded site selectors, since the portfolio pages are
behind login and haven't been inspected directly yet — it should be
treated as a first pass pending verification against the live site.
