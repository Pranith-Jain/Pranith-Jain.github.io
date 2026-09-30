import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const THEME_VALUES: Theme[] = ['light', 'dark'];

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';

  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored && THEME_VALUES.includes(stored)) {
      return stored;
    }
  } catch {}

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Theme is global app state, but `useTheme()` is consumed from four
 * independent places (App shell, Settings, ThreatIntelDashboard,
 * EntityGraphCanvas). Holding `useState` inside the hook gave each call site
 * its own private copy: the `storage` event only fires in *other* browsing
 * contexts, so toggling the theme from the header left the dashboard and graph
 * rendering on the old theme until those pages remounted — and each copy
 * re-wrote localStorage and registered its own `storage` listener.
 *
 * A single module-level store fixes both: one value, one DOM side effect, one
 * cross-tab listener, and every consumer re-renders together.
 */
let current: Theme | null = null;
const listeners = new Set<(next: Theme) => void>();

/** Read the shared theme, initializing it from storage/system on first use. */
function getTheme(): Theme {
  if (current === null) current = getInitialTheme();
  return current;
}

/** Apply the theme to the document and persist it. Never throws. */
function commit(next: Theme): void {
  current = next;

  if (typeof document !== 'undefined') {
    const html = document.documentElement;
    if (next === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // private mode / storage full — theme still applies for this session
  }
}

function setTheme(next: Theme): void {
  if (getTheme() === next) return;
  commit(next);
  for (const listener of listeners) listener(next);
}

function toggle(): void {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

/** Test-only: drop the module-level store so each case starts from scratch. */
export function _resetThemeForTests(): void {
  current = null;
  listeners.clear();
}

export function useTheme() {
  const [theme, setLocalTheme] = useState<Theme>(getTheme);

  // Subscribe to the shared store. Also re-sync on mount: another instance
  // may have toggled the theme between this component's first render and its
  // effect running.
  useEffect(() => {
    const listener = (next: Theme) => setLocalTheme(next);
    listeners.add(listener);
    setLocalTheme(getTheme());
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue as Theme | null;
      if (next && THEME_VALUES.includes(next)) {
        setTheme(next);
      }
    }

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const toggleTheme = useCallback(() => {
    toggle();
  }, []);

  return { theme, toggleTheme, isDark: theme === 'dark' };
}
