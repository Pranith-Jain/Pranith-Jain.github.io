import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'dfir_api_url';
const DEFAULT_API_URL = import.meta.env.VITE_DFIR_API_URL || '';

export interface DFIRSettings {
  apiUrl: string;
  setApiUrl: (url: string) => void;
  clearApiUrl: () => void;
  isUrlValid: (url: string) => boolean;
}

export function useDFIRSettings(): DFIRSettings {
  const [apiUrl, setApiUrlState] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_API_URL;
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_API_URL;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, apiUrl);
    }
  }, [apiUrl]);

  const setApiUrl = useCallback((url: string) => {
    setApiUrlState(url.trim());
  }, []);

  const clearApiUrl = useCallback(() => {
    setApiUrlState('');
  }, []);

  const isUrlValid = useCallback((url: string): boolean => {
    if (!url) return true;
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }, []);

  return {
    apiUrl,
    setApiUrl,
    clearApiUrl,
    isUrlValid,
  };
}
