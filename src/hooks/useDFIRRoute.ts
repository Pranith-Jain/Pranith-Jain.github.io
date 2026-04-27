import { useState, useEffect, useCallback } from 'react';

type TabType = 'home' | 'domain' | 'analysis' | 'exposure' | 'privacy' | 'knowledge' | 'threatIntel';
type SubMode = 'ioc' | 'phishing' | 'wiki' | 'research' | 'intel' | 'actors' | null;

interface DFIRRoute {
  tab: TabType;
  subMode: SubMode;
  setTab: (tab: TabType) => void;
  setSubMode: (mode: SubMode) => void;
  getUrl: () => string;
  navigateTo: (tab: TabType, subMode?: SubMode) => void;
}

export function useDFIRRoute(initialTab: TabType = 'home'): DFIRRoute {
  const [tab, setTabState] = useState<TabType>(initialTab);
  const [subMode, setSubModeState] = useState<SubMode>(null);

  // Parse URL on mount and handle browser navigation
  useEffect(() => {
    const parseHash = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/dfir/')) {
        const parts = hash.replace('#/dfir/', '').split('/');
        const tabPart = parts[0] as TabType;
        const subPart = parts[1] as SubMode;

        const validTabs: TabType[] = ['home', 'domain', 'analysis', 'exposure', 'privacy', 'knowledge', 'threatIntel'];
        const validSubModes: SubMode[] = ['ioc', 'phishing', 'wiki', 'research', 'intel', 'actors'];

        if (validTabs.includes(tabPart)) {
          setTabState(tabPart);
          if (subPart && validSubModes.includes(subPart)) {
            setSubModeState(subPart);
          } else {
            // Set default submode based on tab
            setSubModeState(getDefaultSubMode(tabPart));
          }
        }
      } else if (hash === '#dfir' || hash.startsWith('#dfir')) {
        setTabState('home');
        setSubModeState(null);
      }
    };

    parseHash();
    window.addEventListener('hashchange', parseHash);
    return () => window.removeEventListener('hashchange', parseHash);
  }, []);

  // Update URL when tab or submode changes
  const updateUrl = useCallback((newTab: TabType, newSubMode: SubMode | null) => {
    const base = '#/dfir';
    if (newTab === 'home') {
      window.history.replaceState(null, '', '#dfir');
    } else if (newSubMode) {
      window.history.replaceState(null, '', `${base}/${newTab}/${newSubMode}`);
    } else {
      window.history.replaceState(null, '', `${base}/${newTab}`);
    }
  }, []);

  const setTab = useCallback((newTab: TabType) => {
    setTabState(newTab);
    const defaultSub = getDefaultSubMode(newTab);
    setSubModeState(defaultSub);
    updateUrl(newTab, defaultSub);

    // Scroll to DFIR section
    const dfirSection = document.getElementById('dfir');
    if (dfirSection) {
      dfirSection.scrollIntoView({ behavior: 'smooth' });
    }
  }, [updateUrl]);

  const setSubMode = useCallback((mode: SubMode) => {
    setSubModeState(mode);
    updateUrl(tab, mode);
  }, [tab, updateUrl]);

  const getUrl = useCallback(() => {
    const base = '#/dfir';
    if (tab === 'home') return '#dfir';
    if (subMode) return `${base}/${tab}/${subMode}`;
    return `${base}/${tab}`;
  }, [tab, subMode]);

  const navigateTo = useCallback((newTab: TabType, newSubMode?: SubMode) => {
    setTabState(newTab);
    const newSub = newSubMode ?? getDefaultSubMode(newTab);
    setSubModeState(newSub);
    updateUrl(newTab, newSub);

    // Scroll to DFIR section
    const dfirSection = document.getElementById('dfir');
    if (dfirSection) {
      dfirSection.scrollIntoView({ behavior: 'smooth' });
    }
  }, [updateUrl]);

  return { tab, subMode, setTab, setSubMode, getUrl, navigateTo };
}

function getDefaultSubMode(tab: TabType): SubMode {
  switch (tab) {
    case 'analysis':
      return 'ioc';
    case 'knowledge':
      return 'wiki';
    case 'threatIntel':
      return 'intel';
    default:
      return null;
  }
}

export function useDeepLink() {
  const handleDeepLink = useCallback(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/dfir/')) {
      // Ensure DFIR section is visible
      setTimeout(() => {
        const dfirSection = document.getElementById('dfir');
        if (dfirSection) {
          dfirSection.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  }, []);

  useEffect(() => {
    handleDeepLink();
    window.addEventListener('hashchange', handleDeepLink);
    return () => window.removeEventListener('hashchange', handleDeepLink);
  }, [handleDeepLink]);
}