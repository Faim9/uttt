// Applies the theme saved in this browser before the page draws, so it doesn't flash the default first.
try {
  const theme = localStorage.getItem('theme');
  if (theme) document.documentElement.dataset.theme = theme;
} catch {
  // Storage can be blocked (private windows, strict settings); the default theme is fine then.
}
