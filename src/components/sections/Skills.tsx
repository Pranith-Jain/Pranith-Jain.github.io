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

// Per-card accent stripe so each capability area has its own visual
// identity without breaking the palette: all six accents are already
// in the brand family (brand-, emerald-, rose-, cyan-, amber-, violet-).
const ACCENTS = [
  {
    bg: 'bg-brand-500',
    border: 'hover:border-brand-500/50',
    iconBg: 'bg-brand-50 dark:bg-brand-900/30',
    iconText: 'text-brand-600 dark:text-brand-300',
    dot: 'bg-brand-500',
  },
  {
    bg: 'bg-emerald-500',
    border: 'hover:border-emerald-500/50',
    iconBg: 'bg-emerald-50 dark:bg-emerald-900/30',
    iconText: 'text-emerald-600 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  {
    bg: 'bg-rose-500',
    border: 'hover:border-rose-500/50',
    iconBg: 'bg-rose-50 dark:bg-rose-900/30',
    iconText: 'text-rose-600 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  {
    bg: 'bg-cyan-500',
    border: 'hover:border-cyan-500/50',
    iconBg: 'bg-cyan-50 dark:bg-cyan-900/30',
    iconText: 'text-cyan-600 dark:text-cyan-300',
    dot: 'bg-cyan-500',
  },
  {
    bg: 'bg-amber-500',
    border: 'hover:border-amber-500/50',
    iconBg: 'bg-amber-50 dark:bg-amber-900/30',
    iconText: 'text-amber-600 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  {
    bg: 'bg-violet-500',
    border: 'hover:border-violet-500/50',
    iconBg: 'bg-violet-50 dark:bg-violet-900/30',
    iconText: 'text-violet-600 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
];

/**
 * Skills — tighter cards, less chrome. Each card is a small panel with
 * an icon and a bullet list. No hover-glow, no -translate, no rounded-3xl.
 * The eyebrow uses mono caps (same rhythm as Hero/About).
 */
export function Skills() {
  return (
    <section id="skills" className="mt-24 scroll-mt-24">
      <div className="mb-8 max-w-3xl">
        <div className="animate-fade-in-up mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          06 — Expertise
        </div>
        <h2 className="animate-fade-in-up font-serif text-3xl font-normal italic tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          Core competencies
        </h2>
        <p className="animate-fade-in-up mt-3 max-w-[65ch] text-base text-slate-700 dark:text-slate-400">
          Threat intelligence, cyber criminology, email security, and cloud identity defense.
        </p>
      </div>

      <div className="animate-fade-in-up grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill, idx) => {
          const IconComponent = iconMap[skill.icon];
          const accent = ACCENTS[idx % ACCENTS.length];
          return (
            <div
              key={skill.title}
              className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition-colors duration-200 dark:border-slate-800 dark:bg-slate-900 ${accent.border}`}
            >
              {/* Top accent stripe */}
              <div className={`absolute inset-x-0 top-0 h-0.5 ${accent.bg}`} aria-hidden="true" />
              <div
                className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${accent.iconBg} ${accent.iconText}`}
              >
                {IconComponent && <IconComponent className="h-4 w-4" aria-hidden="true" />}
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{skill.title}</div>
              <ul className="mt-3 space-y-1.5 text-[13px] text-slate-700 dark:text-slate-400">
                {skill.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className={`mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full ${accent.dot}`} />
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
