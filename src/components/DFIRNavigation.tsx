import { memo, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Globe, Search, Database, Lock, BookOpen, Radar, type LucideIcon } from 'lucide-react';

export type NavTab = 'home' | 'domain' | 'analysis' | 'exposure' | 'privacy' | 'knowledge' | 'threatIntel';

interface NavItem {
  id: NavTab;
  label: string;
  icon: LucideIcon;
  description?: string;
  badge?: string;
  shortcut?: string;
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: Shield, description: 'Overview', shortcut: '1' },
  { id: 'domain', label: 'Domain', icon: Globe, description: 'Security Check', shortcut: '2' },
  { id: 'analysis', label: 'Analysis', icon: Search, description: 'IOC + Phishing', badge: '2 tools', shortcut: '3' },
  { id: 'exposure', label: 'Exposure', icon: Database, description: 'Breach Scanner', shortcut: '4' },
  { id: 'privacy', label: 'Privacy', icon: Lock, description: 'Browser Check', shortcut: '5' },
  {
    id: 'knowledge',
    label: 'Knowledge',
    icon: BookOpen,
    description: 'Wiki + Research',
    badge: '2 tools',
    shortcut: '6',
  },
  { id: 'threatIntel', label: 'Intel', icon: Radar, description: 'Feeds + Actors', badge: '2 tools', shortcut: '7' },
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
      } else if (e.key >= '1' && e.key <= '7') {
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

  return (
    <nav
      ref={containerRef}
      className={`flex overflow-x-auto no-scrollbar bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-b border-slate-200 dark:border-white/5 ${className}`}
      aria-label="DFIR Tools navigation"
    >
      {navItems.map((item, index) => (
        <motion.button
          key={item.id}
          ref={item.id === activeTab ? activeButtonRef : undefined}
          onClick={() => onTabChange(item.id)}
          className={`relative flex items-center gap-2 px-5 py-4 text-sm font-medium transition-all whitespace-nowrap border-b-2 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-inset ${
            activeTab === item.id
              ? 'text-brand-600 dark:text-brand-400 border-brand-500 bg-brand-500/5'
              : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5'
          }`}
          role="tab"
          aria-selected={activeTab === item.id}
          aria-controls={`panel-${item.id}`}
          id={`tab-${item.id}`}
          tabIndex={activeTab === item.id ? 0 : -1}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex flex-col items-start sm:flex-row sm:items-center sm:gap-2">
            <span>{item.label}</span>
            {item.description && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal hidden lg:inline">
                {item.description}
              </span>
            )}
          </span>
          {item.badge && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hidden sm:inline">
              {item.badge}
            </span>
          )}
          {item.shortcut && (
            <kbd className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hidden md:inline font-mono">
              {item.shortcut}
            </kbd>
          )}
          {activeTab === item.id && (
            <motion.div
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500"
              layoutId="activeTab"
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}
        </motion.button>
      ))}
    </nav>
  );
});

interface SubNavigationProps {
  tabs: Array<{ id: string; label: string; icon: LucideIcon }>;
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}

export const SubNavigation = memo(function SubNavigation({
  tabs,
  activeTab,
  onTabChange,
  className = '',
}: SubNavigationProps) {
  return (
    <div
      className={`flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/50 w-fit ${className}`}
      role="tablist"
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
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
          New Scan
        </button>
      )}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
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
