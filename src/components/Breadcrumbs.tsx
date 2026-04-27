import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1 text-sm ${className}`}>
      <a
        href="#top"
        className="flex items-center gap-1 text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 transition-colors"
      >
        <Home className="w-4 h-4" />
      </a>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-1">
          <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          {item.href ? (
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
        </div>
      ))}
    </nav>
  );
}

export function useDFIRBreadcrumbs() {
  return [
    { label: 'DFIR Tools' },
  ];
}
