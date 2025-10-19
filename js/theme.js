import { STORAGE_KEYS, getStoredValue, setStoredValue } from './localstorage.js';

const DEFAULT_THEME = 'dark';

function applyTheme(theme, toggle) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', normalized);
  if (!toggle) return;
  toggle.textContent = normalized === 'light' ? 'Dark mode' : 'Light mode';
  toggle.title = normalized === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
  toggle.setAttribute('aria-label', normalized === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  toggle.setAttribute('aria-pressed', normalized === 'light' ? 'true' : 'false');
}

function readStoredTheme() {
  const stored = getStoredValue(STORAGE_KEYS.theme);
  return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME;
}

function persistTheme(theme) {
  setStoredValue(STORAGE_KEYS.theme, theme);
}

export function initTheme(toggle = document.getElementById('theme-toggle')) {
  const apply = (theme) => applyTheme(theme, toggle);
  apply(readStoredTheme());

  if (!toggle) return;

  toggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    apply(next);
    persistTheme(next);
  });
}
