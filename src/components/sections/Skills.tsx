import { Mail, Search, Users, Shield, Cloud, Zap } from 'lucide-react';
import { skills } from '../../data/content';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Mail,
  Search,
  Users,
  Shield,
  Cloud,
  Zap,
};

/**
 * Skills grid — minimal editorial. No glass, no rounded-3xl, no
 * shadow-glow. Each cluster is a thin-bordered card with an inline icon
 * and a plain bulleted list; the only colour is the brand accent on the
 * icon and the small list bullet.
 */
export function Skills() {
  return (
    <section id="skills" className="mt-20 scroll-mt-24">
      {/* Header — matches the design-system rhythm: caps-mono kicker + a
          plain display heading + a single-line lede. */}
      <div className="mb-10 max-w-3xl">
        <div className="mb-3 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">Expertise</div>
        <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
          Core competencies
        </h2>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
          Focused on threat intelligence, cyber criminology, email security, and cloud-identity defense.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill) => {
          const IconComponent = iconMap[skill.icon];
          return (
            <div
              key={skill.title}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                  {IconComponent && <IconComponent className="h-4 w-4" aria-hidden="true" />}
                </span>
                <h3 className="font-display font-semibold text-lg text-slate-900 dark:text-white">{skill.title}</h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                {skill.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
