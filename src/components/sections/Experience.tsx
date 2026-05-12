import { Search, Zap, Shield, FileText, Monitor, Mail } from 'lucide-react';
import { experiences } from '../../data/content';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Search,
  Zap,
  Shield,
  FileText,
  Monitor,
  Mail,
};

/**
 * Editorial divider rows. Mono date on the left, role + sections on the
 * right. Sub-headers use mono caps for the per-area tracks. No card
 * chrome — hierarchy via spacing + typography.
 */
export function Experience() {
  return (
    <section id="experience" className="mt-24 scroll-mt-24">
      <div className="mb-8 max-w-3xl">
        <div className="animate-fade-in-up mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          03 — Experience
        </div>
        <h2 className="animate-fade-in-up font-serif text-3xl font-normal italic tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          Experience highlights
        </h2>
      </div>

      <ul className="animate-fade-in-up divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {experiences.map((exp, index) => (
          <li key={`${exp.title}-${index}`} className="grid grid-cols-1 gap-4 py-8 sm:grid-cols-[10rem_1fr] sm:gap-8">
            {/* Left rail: period + company */}
            <div className="space-y-1">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">{exp.period}</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{exp.company}</div>
              {exp.location && (
                <div className="font-mono text-[11px] text-slate-500 dark:text-slate-500">{exp.location}</div>
              )}
              {exp.badge && (
                <div className="pt-1">
                  <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                    {exp.badge}
                  </span>
                </div>
              )}
            </div>

            {/* Right rail: role + details */}
            <div className="min-w-0">
              <h3 className="font-serif text-xl font-normal italic leading-tight text-slate-900 sm:text-2xl dark:text-white">
                {exp.title}
              </h3>

              {exp.sections && (
                <div className="mt-5 space-y-5">
                  {exp.sections.map((section) => {
                    const IconComponent = iconMap[section.icon];
                    const sectionId = `experience-${section.title
                      .toLowerCase()
                      .replace(/[^\w\s-]/g, '')
                      .replace(/\s+/g, '-')}`;
                    return (
                      <div key={section.title} id={sectionId} className="scroll-mt-28">
                        <h4 className="mb-2 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
                          {IconComponent && <IconComponent className="h-3 w-3" />}
                          {section.title}
                        </h4>
                        <ul className="space-y-2 text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
                          {section.items.map((item, iIndex) => (
                            <li key={iIndex} className="relative max-w-[68ch] pl-4">
                              <span className="absolute left-0 top-2 inline-block h-1 w-1 rounded-full bg-brand-500" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              {exp.items && (
                <ul className="mt-4 space-y-2 text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
                  {exp.items.map((item, iIndex) => (
                    <li key={iIndex} className="relative max-w-[68ch] pl-4">
                      <span className="absolute left-0 top-2 inline-block h-1 w-1 rounded-full bg-brand-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
