// Minimal cross-browser shim: Firefox exposes the promise-based `browser`
// API natively; Chromium only has the callback-based `chrome` API.
const api = typeof browser !== "undefined" ? browser : chrome;

const darkModeCheckbox = document.getElementById("dark-mode");

api.storage.sync.get({ darkMode: false }).then(({ darkMode }) => {
  darkModeCheckbox.checked = darkMode;
});

darkModeCheckbox.addEventListener("change", () => {
  api.storage.sync.set({ darkMode: darkModeCheckbox.checked });
});
