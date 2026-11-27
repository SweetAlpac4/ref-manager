const THEME_KEY = "ref-manager-theme"

export function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === "light" || saved === "dark") return saved
  } catch { /* Browser storage can be unavailable. */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0c0c0c" : "#f0f0f0")
}

export function saveTheme(theme) {
  applyTheme(theme)
  try { localStorage.setItem(THEME_KEY, theme) } catch { /* Keep the toggle usable without storage. */ }
}
