// Applies the dark theme before first paint, so there is no light flash (FR-1.3).
// A static file because the CSP forbids inline scripts. It must read the same key and
// `theme` values that src/infrastructure/local-preferences-store.ts writes.
try {
  const theme = JSON.parse(localStorage.getItem("ghd:preferences") || "{}").theme;
  if (
    theme === "dark" ||
    (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
    document.documentElement.classList.add("dark");
  }
} catch {
  // Unreadable storage: stay light until the app renders and resolves the theme.
}
