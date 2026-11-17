// Apply the saved theme before first paint (no flash). A file, not inline, so the CSP can forbid inline scripts.
try {
  if (localStorage.getItem('getit.theme') === 'dark') document.documentElement.classList.add('dark');
} catch {
  /* storage blocked: light theme */
}
