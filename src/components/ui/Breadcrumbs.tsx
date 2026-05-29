import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-slate-400">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3 w-3 text-slate-400" aria-hidden="true" />}
              {item.href && !isLast ? (
                <a href={item.href} className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">
                  {item.label}
                </a>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={isLast ? 'text-slate-900 dark:text-white font-medium' : ''}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface BreadcrumbsHeadingProps {
  items: BreadcrumbItem[];
  title: string;
  description?: string;
  className?: string;
}

export function BreadcrumbsHeading({ items, title, description, className = '' }: BreadcrumbsHeadingProps) {
  return (
    <div className={`mb-8 ${className}`}>
      <Breadcrumbs items={items} className="mb-3" />
      <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white">{title}</h1>
      {description && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">{description}</p>}
    </div>
  );
}
