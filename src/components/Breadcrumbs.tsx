import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Home, type LucideIcon } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: LucideIcon;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
  showHome?: boolean;
  maxItems?: number;
}

export const Breadcrumbs = memo(function Breadcrumbs({
  items,
  className = '',
  showHome = true,
  maxItems = 4,
}: BreadcrumbsProps) {
  const displayItems = useMemo(() => {
    if (items.length <= maxItems) {
      return items;
    }

    // Show first, ellipsis, and last items
    const first = items[0];
    const last = items[items.length - 1];
    const middle = items.slice(1, -1);

    return [first, { label: '...', href: undefined }, ...middle.slice(-(maxItems - 2)), last];
  }, [items, maxItems]);

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1 text-sm ${className}`}>
      {showHome && (
        <a
          href="#top"
          className="flex items-center gap-1 text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 transition-colors"
          aria-label="Go to top"
        >
          <Home className="w-4 h-4" />
        </a>
      )}

      {displayItems.map((item, index) => (
        <div key={index} className="flex items-center gap-1">
          <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" aria-hidden="true" />

          {item.label === '...' ? (
            <span className="text-slate-400 dark:text-slate-500 px-2">...</span>
          ) : item.href ? (
            <a
              href={item.href}
              className="flex items-center gap-1 text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 transition-colors"
            >
              {item.icon && <item.icon className="w-3 h-3" />}
              <span>{item.label}</span>
            </a>
          ) : (
            <span className="text-slate-700 dark:text-slate-200 font-medium" aria-current="page">
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
});

// Hook for generating DFIR breadcrumbs
export function useDFIRBreadcrumbs(activeTab: string, subMode?: string | null): BreadcrumbItem[] {
  return useMemo(() => {
    const items: BreadcrumbItem[] = [{ label: 'DFIR Tools', href: '#dfir' }];

    const tabLabels: Record<string, string> = {
      home: 'Home',
      domain: 'Domain Scanner',
      analysis: 'Analysis',
      exposure: 'Exposure',
      privacy: 'Privacy',
      knowledge: 'Knowledge',
      threatIntel: 'Threat Intel',
    };

    const subModeLabels: Record<string, string> = {
      ioc: 'IOC Check',
      phishing: 'Phishing Analyzer',
      wiki: 'Wiki',
      research: 'Research Papers',
      intel: 'Threat Feeds',
      actors: 'Threat Actors',
    };

    if (activeTab && activeTab !== 'home') {
      items.push({
        label: tabLabels[activeTab] || activeTab,
        href: `#/dfir/${activeTab}`,
      });
    }

    if (subMode) {
      items.push({
        label: subModeLabels[subMode] || subMode,
      });
    }

    return items;
  }, [activeTab, subMode]);
}

// Animated breadcrumbs with motion
export function AnimatedBreadcrumbs({ items, className = '' }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1 text-sm ${className}`}>
      {items.map((item, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
          className="flex items-center gap-1"
        >
          {index > 0 && <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" aria-hidden="true" />}

          {index === 0 && (
            <a
              href="#top"
              className="flex items-center gap-1 text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 transition-colors"
            >
              <Home className="w-4 h-4" />
            </a>
          )}

          {item.href && index > 0 ? (
            <a
              href={item.href}
              className="text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 transition-colors"
            >
              {item.label}
            </a>
          ) : (
            <span className="text-slate-700 dark:text-slate-200 font-medium" aria-current="page">
              {item.label}
            </span>
          )}
        </motion.div>
      ))}
    </nav>
  );
}

// Compact breadcrumb for mobile
export function CompactBreadcrumbs({ items, className = '' }: { items: BreadcrumbItem[]; className?: string }) {
  if (items.length <= 2) {
    return (
      <nav aria-label="Breadcrumb" className={`flex items-center gap-1 text-sm ${className}`}>
        {items.map((item, index) => (
          <span
            key={index}
            className={index === items.length - 1 ? 'text-slate-700 dark:text-slate-200 font-medium' : 'text-slate-500'}
          >
            {item.label}
          </span>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1 text-sm ${className}`}>
      <a
        href="#top"
        className="text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 transition-colors"
      >
        <Home className="w-4 h-4" />
      </a>
      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
      <span className="text-slate-500">...</span>
      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
      <span className="text-slate-700 dark:text-slate-200 font-medium">{items[items.length - 1]?.label}</span>
    </nav>
  );
}
