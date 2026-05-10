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

export function Experience() {
  return (
    <section id="experience" className="mt-20 scroll-mt-24">
      {/* Header */}
      <div className="mb-12 max-w-2xl">
        <div className="animate-fade-in-up mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          Experience
        </div>
        <h2 className="animate-fade-in-up text-3xl font-extrabold tracking-tight sm:text-4xl text-slate-900 dark:text-white">
          Experience highlights
        </h2>
      </div>

      {/* Experience Cards */}
      <div className="animate-fade-in-up grid gap-8">
        {experiences.map((exp, index) => (
          <div
            key={`${exp.title}-${index}`}
            className="animate-fade-in-up glass rounded-2xl p-6 shadow-sm transition-all hover:shadow-md"
          >
            {/* Header */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4">
              <div>
                <div className="text-base font-semibold text-slate-900 dark:text-white">{exp.title}</div>
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  {exp.company}
                  {exp.location && ` • ${exp.location}`} • {exp.period}
                </div>
              </div>
              {exp.badge && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  {exp.badge}
                </span>
              )}
            </div>

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
              <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                {exp.items.map((item, iIndex) => (
                  <li key={iIndex} className="relative pl-4">
                    <span className="absolute left-0 text-brand-600 dark:text-brand-300">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
