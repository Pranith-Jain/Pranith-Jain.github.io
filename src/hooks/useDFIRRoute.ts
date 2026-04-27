import { useState, useEffect, useCallback } from 'react';

type TabType = 'home' | 'domain' | 'analysis' | 'exposure' | 'privacy' | 'knowledge' | 'threatIntel';
type SubMode = 'ioc' | 'phishing' | 'wiki' | 'research' | 'intel' | 'actors' | null;

interface TabConfig {
  label: string;
  defaultSubMode: SubMode;
  subModes?: Array<{ id: SubMode; label: string }>;
}

const TAB_CONFIG: Record<TabType, TabConfig> = {
  home: { label: 'Home', defaultSubMode: null },
  domain: { label: 'Domain', defaultSubMode: null },
  analysis: {
    label: 'Analysis',
    defaultSubMode: 'ioc',
    subModes: [
      { id: 'ioc', label: 'IOC Check' },
      { id: 'phishing', label: 'Phishing Analyzer' },
    ],
  },
  exposure: { label: 'Exposure', defaultSubMode: null },
  privacy: { label: 'Privacy', defaultSubMode: null },
  knowledge: {
    label: 'Knowledge',
    defaultSubMode: 'wiki',
    subModes: [
      { id: 'wiki', label: 'Wiki' },
      { id: 'research', label: 'Research Papers' },
    ],
  },
  threatIntel: {
    label: 'Threat Intel',
    defaultSubMode: 'intel',
    subModes: [
      { id: 'intel', label: 'Threat Feeds' },
      { id: 'actors', label: 'Threat Actors' },
    ],
  },
};

const VALID_TABS: TabType[] = ['home', 'domain', 'analysis', 'exposure', 'privacy', 'knowledge', 'threatIntel'];
const VALID_SUB_MODES: SubMode[] = ['ioc', 'phishing', 'wiki', 'research', 'intel', 'actors'];

export interface DFIRRoute {
  tab: TabType;
  subMode: SubMode;
  setTab: (tab: TabType) => void;
  setSubMode: (mode: SubMode) => void;
  toggleSubMode: () => void;
  getUrl: () => string;
  navigateTo: (tab: TabType, subMode?: SubMode) => void;
  getBreadcrumbs: () => Array<{ label: string; href?: string }>;
  tabConfig: typeof TAB_CONFIG;
  isValidTab: (tab: string) => tab is TabType;
}

function getDefaultSubMode(tab: TabType): SubMode {
  return TAB_CONFIG[tab]?.defaultSubMode ?? null;
}

function scrollToSection(sectionId: string = 'dfir', behavior: ScrollBehavior = 'smooth') {
  if (typeof window === 'undefined') return;

  const section = document.getElementById(sectionId);
  if (section) {
    section.scrollIntoView({ behavior, block: 'start' });
  }
}

export function useDFIRRoute(initialTab: TabType = 'home'): DFIRRoute {
  const [tab, setTabState] = useState<TabType>(initialTab);
  const [subMode, setSubModeState] = useState<SubMode>(getDefaultSubMode(initialTab));
  const [isInitialized, setIsInitialized] = useState(false);

  // Parse URL on mount and handle browser navigation
  useEffect(() => {
    const parseHash = () => {
      const hash = window.location.hash;

      // Handle base dfir hash
      if (hash === '#dfir' || hash === '#/dfir') {
        setTabState('home');
        setSubModeState(null);
        return;
      }

      // Handle /dfir/ path
      if (hash.startsWith('#/dfir/')) {
        const pathParts = hash.replace('#/dfir/', '').split('/');
        const tabPart = pathParts[0] as TabType;
        const subPart = pathParts[1] as SubMode;

        if (VALID_TABS.includes(tabPart)) {
          setTabState(tabPart);

          // Only set subMode if it's valid for this tab
          if (subPart && VALID_SUB_MODES.includes(subPart)) {
            const tabSubModes = TAB_CONFIG[tabPart]?.subModes?.map((s) => s.id);
            if (tabSubModes?.includes(subPart)) {
              setSubModeState(subPart);
            } else {
              setSubModeState(getDefaultSubMode(tabPart));
            }
          } else {
            setSubModeState(getDefaultSubMode(tabPart));
          }
        }
      }
    };

    parseHash();
    setIsInitialized(true);

    window.addEventListener('hashchange', parseHash);
    return () => window.removeEventListener('hashchange', parseHash);
  }, []);

  // Update URL when tab or submode changes (debounced)
  const updateUrl = useCallback(
    (newTab: TabType, newSubMode: SubMode | null) => {
      if (!isInitialized) return;

      const base = '#/dfir';
      let newHash: string;

      if (newTab === 'home') {
        newHash = '#dfir';
      } else if (newSubMode && TAB_CONFIG[newTab]?.subModes) {
        newHash = `${base}/${newTab}/${newSubMode}`;
      } else {
        newHash = `${base}/${newTab}`;
      }

      // Only update if hash is different to avoid infinite loops
      if (window.location.hash !== newHash) {
        window.history.replaceState(null, '', newHash);
      }
    },
    [isInitialized]
  );

  const setTab = useCallback(
    (newTab: TabType) => {
      setTabState(newTab);
      const defaultSub = getDefaultSubMode(newTab);
      setSubModeState(defaultSub);
      updateUrl(newTab, defaultSub);

      // Scroll to DFIR section after a brief delay for smooth UX
      setTimeout(() => scrollToSection(), 50);
    },
    [updateUrl]
  );

  const setSubMode = useCallback(
    (mode: SubMode) => {
      setSubModeState(mode);
      updateUrl(tab, mode);
    },
    [tab, updateUrl]
  );

  const toggleSubMode = useCallback(() => {
    const subModes = TAB_CONFIG[tab]?.subModes;
    if (!subModes || subModes.length === 0) return;

    const currentIndex = subModes.findIndex((s) => s.id === subMode);
    const nextIndex = (currentIndex + 1) % subModes.length;
    setSubModeState(subModes[nextIndex].id);
    updateUrl(tab, subModes[nextIndex].id);
  }, [tab, subMode, updateUrl]);

  const getUrl = useCallback(() => {
    const base = '#/dfir';
    if (tab === 'home') return '#dfir';
    if (subMode) return `${base}/${tab}/${subMode}`;
    return `${base}/${tab}`;
  }, [tab, subMode]);

  const navigateTo = useCallback(
    (newTab: TabType, newSubMode?: SubMode) => {
      setTabState(newTab);
      const newSub = newSubMode ?? getDefaultSubMode(newTab);
      setSubModeState(newSub);
      updateUrl(newTab, newSub);

      // Scroll to DFIR section
      setTimeout(() => scrollToSection(), 50);
    },
    [updateUrl]
  );

  const getBreadcrumbs = useCallback((): Array<{ label: string; href?: string }> => {
    const breadcrumbs: Array<{ label: string; href?: string }> = [{ label: 'DFIR Tools', href: '#dfir' }];

    if (tab !== 'home') {
      breadcrumbs.push({ label: TAB_CONFIG[tab]?.label ?? tab });
    }

    if (subMode) {
      const subModeConfig = TAB_CONFIG[tab]?.subModes?.find((s) => s.id === subMode);
      if (subModeConfig) {
        breadcrumbs.push({ label: subModeConfig.label });
      }
    }

    return breadcrumbs;
  }, [tab, subMode]);

  const isValidTab = useCallback((tab: string): tab is TabType => {
    return VALID_TABS.includes(tab as TabType);
  }, []);

  return {
    tab,
    subMode,
    setTab,
    setSubMode,
    toggleSubMode,
    getUrl,
    navigateTo,
    getBreadcrumbs,
    tabConfig: TAB_CONFIG,
    isValidTab,
  };
}

// Hook for deep linking - handles incoming links from external sources
export function useDeepLink() {
  useEffect(() => {
    const hash = window.location.hash;

    if (hash.startsWith('#/dfir/')) {
      // Wait for the page to be fully loaded
      const timeoutId = setTimeout(() => {
        scrollToSection('dfir', 'smooth');
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, []);
}

// Hook for browser history navigation
export function useHistoryNavigation(onNavigate?: (tab: TabType) => void) {
  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash;

      if (hash.startsWith('#/dfir/')) {
        const parts = hash.replace('#/dfir/', '').split('/');
        const tab = parts[0] as TabType;

        if (VALID_TABS.includes(tab)) {
          onNavigate?.(tab);
          scrollToSection('dfir', 'smooth');
        }
      } else if (hash === '#dfir' || hash === '#/dfir') {
        onNavigate?.('home');
        scrollToSection('dfir', 'smooth');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onNavigate]);
}

// Utility function to generate shareable links
export function generateShareableLink(tab: TabType, subMode?: SubMode): string {
  const baseUrl = window.location.origin + window.location.pathname;
  if (tab === 'home') {
    return `${baseUrl}#dfir`;
  }
  if (subMode) {
    return `${baseUrl}#/dfir/${tab}/${subMode}`;
  }
  return `${baseUrl}#/dfir/${tab}`;
}

// Utility function to copy link to clipboard
export async function copyLinkToClipboard(tab: TabType, subMode?: SubMode): Promise<boolean> {
  try {
    const link = generateShareableLink(tab, subMode);
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    return false;
  }
}
