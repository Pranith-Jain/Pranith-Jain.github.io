import React, { memo, useCallback, useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Search, Lock, BookOpen, Radar, type LucideIcon } from 'lucide-react';

export type NavTab = 'home' | 'privacy' | 'knowledge' | 'threatIntel';

interface NavItem {
  id: NavTab;
  label: string;
  icon: LucideIcon;
  description?: string;
  badge?: string;
  shortcut?: string;
  color: string;
}

const navItems: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Shield,
    description: 'Overview',
    shortcut: '1',
    color: 'from-brand-500 to-brand-600',
  },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: Lock,
    description: 'Browser Check',
    shortcut: '2',
    color: 'from-emerald-500 to-emerald-600',
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    icon: BookOpen,
    description: 'Wiki + Research',
    badge: '2 tools',
    shortcut: '3',
    color: 'from-violet-500 to-violet-600',
  },
  {
    id: 'threatIntel',
    label: 'Intel',
    icon: Radar,
    description: 'Feeds + Actors',
    badge: '2 tools',
    shortcut: '4',
    color: 'from-blue-500 to-blue-600',
  },
];

interface DFIRNavigationProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  className?: string;
}

export const DFIRNavigation = memo(function DFIRNavigation({
  activeTab,
  onTabChange,
  className = '',
}: DFIRNavigationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeButtonRef = useRef<HTMLButtonElement>(null);
  const [hoveredTab, setHoveredTab] = useState<NavTab | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const currentIndex = navItems.findIndex((item) => item.id === activeTab);

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % navItems.length;
        onTabChange(navItems[nextIndex].id);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + navItems.length) % navItems.length;
        onTabChange(navItems[prevIndex].id);
      } else if (e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (navItems[index]) {
          onTabChange(navItems[index].id);
        }
      }
    },
    [activeTab, onTabChange]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown);
      return () => container.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown]);

  useEffect(() => {
    if (activeButtonRef.current) {
      activeButtonRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeTab]);

  const activeItem = navItems.find((item) => item.id === activeTab);

  return (
    <nav
      ref={containerRef}
      className={`relative overflow-x-auto no-scrollbar bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-b border-slate-200 dark:border-white/5 ${className}`}
      aria-label="DFIR Tools navigation"
    >
      {/* Gradient indicator */}
      <AnimatePresence mode="wait">
        {activeItem && (
          <div key={activeTab} className="absolute inset-0 pointer-events-none">
            <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${activeItem.color}`} />
            <div className={`absolute inset-0 bg-gradient-to-r ${activeItem.color} opacity-[0.03]`} />
          </div>
        )}
      </AnimatePresence>

      <div className="flex relative z-10">
        {navItems.map((item, index) => (
          <motion.button
            key={item.id}
            ref={item.id === activeTab ? activeButtonRef : undefined}
            onClick={() => onTabChange(item.id)}
            onMouseEnter={() => setHoveredTab(item.id)}
            onMouseLeave={() => setHoveredTab(null)}
            className={`relative flex items-center gap-2 px-5 py-4 text-sm font-medium transition-all whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500 ${
              activeTab === item.id
                ? 'text-brand-600 dark:text-brand-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
            role="tab"
            aria-selected={activeTab === item.id}
            aria-controls={`panel-${item.id}`}
            id={`tab-${item.id}`}
            tabIndex={activeTab === item.id ? 0 : -1}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {/* Icon with gradient background on active */}
            <div
              className={`relative p-1.5 rounded-lg transition-all duration-200 ${
                activeTab === item.id
                  ? `bg-gradient-to-br ${item.color} shadow-sm`
                  : hoveredTab === item.id
                    ? 'bg-slate-100 dark:bg-slate-800'
                    : ''
              }`}
            >
              <item.icon
                className={`w-4 h-4 transition-colors ${
                  activeTab === item.id
                    ? 'text-white'
                    : hoveredTab === item.id
                      ? `bg-gradient-to-br ${item.color} bg-clip-text text-transparent`
                      : 'text-slate-500 dark:text-slate-400'
                }`}
                aria-hidden="true"
              />
            </div>

            <span className="flex flex-col items-start sm:flex-row sm:items-center sm:gap-2">
              <span>{item.label}</span>
              {item.description && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal hidden lg:inline">
                  {item.description}
                </span>
              )}
            </span>

            {item.badge && (
              <span
                className={`ml-1 px-1.5 py-0.5 text-[10px] rounded-full font-medium hidden sm:inline-flex items-center gap-1 ${
                  activeTab === item.id
                    ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {item.badge}
              </span>
            )}

            {item.shortcut && (
              <kbd
                className={`ml-1 px-1.5 py-0.5 text-[10px] rounded font-mono hidden xl:inline ${
                  activeTab === item.id
                    ? 'bg-white/20 text-white/80'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                }`}
              >
                {item.shortcut}
              </kbd>
            )}

            {/* Active indicator */}
            {activeTab === item.id && (
              <motion.div
                className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-gradient-to-r ${item.color}`}
                layoutId="activeTabIndicator"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
          </motion.button>
        ))}
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden xl:flex items-center gap-1 text-[10px] text-slate-400">
        <span>←</span>
        <span>→</span>
        <span className="ml-1">navigate</span>
      </div>
    </nav>
  );
});

interface SubNavigationProps {
  tabs: Array<{ id: string; label: string; icon: LucideIcon }>;
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
  variant?: 'default' | 'pills' | 'underline';
}

export const SubNavigation = memo(function SubNavigation({
  tabs,
  activeTab,
  onTabChange,
  className = '',
  variant = 'pills',
}: SubNavigationProps) {
  if (variant === 'underline') {
    return (
      <div
        className={`flex gap-6 border-b border-slate-200 dark:border-white/10 ${className}`}
        aria-label="Sub-navigation"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative pb-3 text-sm font-medium transition-all focus:outline-none ${
              activeTab === tab.id
                ? 'text-brand-600 dark:text-brand-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            <span className="flex items-center gap-2">
              <tab.icon className="w-4 h-4" aria-hidden="true" />
              {tab.label}
            </span>
            {activeTab === tab.id && (
              <motion.div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" layoutId="subNavIndicator" />
            )}
          </button>
        ))}
      </div>
    );
  }

  if (variant === 'default') {
    return (
      <div
        className={`flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/50 w-fit ${className}`}
        aria-label="Sub-navigation"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            <tab.icon className="w-4 h-4" aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  // Pills variant (default)
  return (
    <div className={`flex flex-wrap gap-2 ${className}`} aria-label="Sub-navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
            activeTab === tab.id
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          role="tab"
          aria-selected={activeTab === tab.id}
        >
          <tab.icon className="w-4 h-4" aria-hidden="true" />
          {tab.label}
        </button>
      ))}
    </div>
  );
});

// Quick action buttons for the toolbar
interface QuickActionsProps {
  onNewScan?: () => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  className?: string;
}

export function QuickActions({ onNewScan, onRefresh, isLoading = false, className = '' }: QuickActionsProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {onNewScan && (
        <button
          onClick={onNewScan}
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors flex items-center gap-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
          New Scan
        </button>
      )}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <motion.div
            className="w-4 h-4"
            animate={isLoading ? { rotate: 360 } : {}}
            transition={{ duration: 1, repeat: isLoading ? Infinity : 0, ease: 'linear' }}
          >
            <Database className="w-4 h-4" aria-hidden="true" />
          </motion.div>
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      )}
    </div>
  );
}

// Utility component for tab panels
interface TabPanelProps {
  id: string;
  activeTab: string;
  children: React.ReactNode;
  className?: string;
}

export function TabPanel({ id, activeTab, children, className = '' }: TabPanelProps) {
  return (
    <div
      id={`panel-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      hidden={activeTab !== id}
      className={className}
    >
      {activeTab === id && children}
    </div>
  );
}
