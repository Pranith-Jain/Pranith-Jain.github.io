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
 * Experience — divider rows. Mono date + company on the left rail,
 * serif role title + sans details on the right. No card chrome —
 * hierarchy via spacing + typography.
 */
export function Experience() {
  return (
    <section id="experience" className="scroll-mt-24 py-16 lg:py-24">
      <div className="mb-10 max-w-[65ch]">
        <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          Experience highlights
        </h2>
      </div>

      <ul className="divide-y divide-rule border-y border-rule">
        {experiences.map((exp, index) => (
          <li key={`${exp.title}-${index}`} className="grid grid-cols-1 gap-4 py-10 sm:grid-cols-[11rem_1fr] sm:gap-8">
            {/* Left rail: period + company */}
            <div className="space-y-1">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">{exp.period}</div>
              <div className="text-sm font-medium text-ink-1">{exp.company}</div>
              {exp.location && <div className="font-mono text-[11px] text-ink-3">{exp.location}</div>}
              {exp.badge && (
                <div className="pt-2">
                  <span className="inline-flex items-center font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                    {exp.badge}
                  </span>
                </div>
              )}
            </div>

            {/* Right rail: role + details */}
            <div className="min-w-0">
              <h3 className="font-serif text-xl font-medium leading-tight text-ink-1 sm:text-2xl">{exp.title}</h3>

              {exp.sections && (
                <div className="mt-6 space-y-6">
                  {exp.sections.map((section) => {
                    const IconComponent = iconMap[section.icon];
                    const sectionId = `experience-${section.title
                      .toLowerCase()
                      .replace(/[^\w\s-]/g, '')
                      .replace(/\s+/g, '-')}`;
                    return (
                      <div key={section.title} id={sectionId} className="scroll-mt-28">
                        <h4 className="mb-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                          {IconComponent && <IconComponent className="h-3 w-3" aria-hidden="true" />}
                          {section.title}
                        </h4>
                        <ul className="space-y-2 text-[14px] leading-[1.55] text-ink-2">
                          {section.items.map((item, iIndex) => (
                            <li key={iIndex} className="relative max-w-[68ch] pl-4">
                              <span className="absolute left-0 top-2 inline-block h-1 w-1 rounded-full bg-accent" />
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
                <ul className="mt-5 space-y-2 text-[14px] leading-[1.55] text-ink-2">
                  {exp.items.map((item, iIndex) => (
                    <li key={iIndex} className="relative max-w-[68ch] pl-4">
                      <span className="absolute left-0 top-2 inline-block h-1 w-1 rounded-full bg-accent" />
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
