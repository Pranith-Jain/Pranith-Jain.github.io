import { useState } from 'react';
import { Search, Zap, Shield, FileText, Monitor, Mail, ChevronDown } from 'lucide-react';
import { experiences } from '../../data/content';
import { Badge } from '../Badge';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Search,
  Zap,
  Shield,
  FileText,
  Monitor,
  Mail,
};

export function Experience() {
  // The first (current) role expands by default — the rest collapse so the
  // list stays scannable. Each card flips on click.
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]));

  const toggle = (index: number): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <section id="experience" className="mt-20 scroll-mt-24">
      {/* Header */}
      <div className="mb-12 max-w-2xl">
        <div className="animate-fade-in-up mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          Experience
        </div>
        <h2 className="animate-fade-in-up text-4xl font-extrabold tracking-tight sm:text-5xl text-slate-900 dark:text-white">
          Experience highlights
        </h2>
      </div>

      {/* Experience Cards — collapsible */}
      <div className="animate-fade-in-up grid gap-4">
        {experiences.map((exp, index) => {
          const isOpen = expanded.has(index);
          const headerId = `experience-header-${index}`;
          const bodyId = `experience-body-${index}`;
          return (
            <div key={`${exp.title}-${index}`} className="glass rounded-2xl shadow-sm transition-all hover:shadow-md">
              <button
                type="button"
                id={headerId}
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => toggle(index)}
                className="flex w-full items-start gap-4 px-6 py-5 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold text-slate-900 dark:text-white">{exp.title}</div>
                  <div className="text-sm text-slate-700 dark:text-slate-300">
                    {exp.company}
                    {exp.location && ` • ${exp.location}`} • {exp.period}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {exp.badge && <Badge tone="success">{exp.badge}</Badge>}
                  <ChevronDown
                    className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </div>
              </button>

              {isOpen && (
                <div id={bodyId} role="region" aria-labelledby={headerId} className="px-6 pb-6 pt-0">
                  {/* Sections (for main experience) */}
                  {exp.sections &&
                    exp.sections.map((section, sIndex) => {
                      const IconComponent = iconMap[section.icon];
                      const sectionId = `experience-${section.title
                        .toLowerCase()
                        .replace(/[^\w\s-]/g, '')
                        .replace(/\s+/g, '-')}`;
                      return (
                        <div
                          key={section.title}
                          id={sectionId}
                          className={`scroll-mt-28 ${sIndex < exp.sections!.length - 1 ? 'mb-5' : ''}`}
                        >
                          <h4 className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-2 flex items-center gap-2">
                            {IconComponent && <IconComponent className="w-4 h-4" />}
                            {section.title}
                          </h4>
                          <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300 ml-6">
                            {section.items.map((item, iIndex) => (
                              <li key={iIndex} className="relative pl-4">
                                <span className="absolute left-0 text-brand-600 dark:text-brand-300">•</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}

                  {/* Items (for other experiences) */}
                  {exp.items && (
                    <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                      {exp.items.map((item, iIndex) => (
                        <li key={iIndex} className="relative pl-4">
                          <span className="absolute left-0 text-brand-600 dark:text-brand-300">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
