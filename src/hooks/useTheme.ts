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
  } catch (e) {
    console.warn('Failed to read theme from localStorage:', e);
  }
  
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      console.warn('Failed to save theme to localStorage:', e);
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme, isDark: theme === 'dark' };
}
