// Minimal cross-browser shim: Firefox exposes the promise-based `browser`
// API natively; Chromium only has the callback-based `chrome` API.
const api = typeof browser !== "undefined" ? browser : chrome;

const DEFAULTS = { darkMode: false, colorCoding: true };

const darkModeCheckbox = document.getElementById("dark-mode");
const colorCodingCheckbox = document.getElementById("color-coding");

api.storage.sync.get(DEFAULTS).then(({ darkMode, colorCoding }) => {
  darkModeCheckbox.checked = darkMode;
  colorCodingCheckbox.checked = colorCoding;
});

darkModeCheckbox.addEventListener("change", () => {
  api.storage.sync.set({ darkMode: darkModeCheckbox.checked });
});

colorCodingCheckbox.addEventListener("change", () => {
  api.storage.sync.set({ colorCoding: colorCodingCheckbox.checked });
});
