// Applies the dark theme and the dragged sidebar width before first paint, so there is no
// light flash and no jump (FR-1.3). A static file because the CSP forbids inline scripts.
// It must read the same key and fields that src/infrastructure/local-preferences-store.ts
// writes. The width is set through the CSSOM, which `style-src 'self'` allows; the CSS
// clamps it to the viewport.
try {
  const preferences = JSON.parse(localStorage.getItem("ghd:preferences") || "{}");
  const theme = preferences.theme;
  if (
    theme === "dark" ||
    (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
    document.documentElement.classList.add("dark");
  }
  const width = preferences.sidebarWidth;
  if (typeof width === "number" && width > 0) {
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  }
} catch {
  // Unreadable storage: stay light until the app renders and resolves the theme.
}
