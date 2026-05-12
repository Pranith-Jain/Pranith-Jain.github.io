import { Mail, Search, Users, Shield, Cloud, Zap } from 'lucide-react';
import { skills } from '../../data/content';
import { FiledTag } from '../editorial';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Mail,
  Search,
  Users,
  Shield,
  Cloud,
  Zap,
};

/**
 * Skills — monochrome capability cards. Single accent only on the icon
 * surface and the hover border. The 6-color accent stripe system from
 * the previous design is dropped — typography and ordering carry the
 * differentiation.
 */
export function Skills() {
  return (
    <section id="skills" className="scroll-mt-24 py-16 lg:py-24">
      <div className="mb-10 max-w-[65ch]">
        <FiledTag number="06" subject="Expertise — Practice Areas" />
        <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          Core competencies
        </h2>
        <p className="mt-4 text-base leading-[1.55] text-ink-2">
          Threat intelligence, cyber criminology, email security, and cloud identity defense.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill) => {
          const IconComponent = iconMap[skill.icon];
          return (
            <div
              key={skill.title}
              className="group flex h-full flex-col border border-rule bg-surface-raised p-6 transition-colors duration-enter hover:border-ink-1"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center bg-accent-soft text-accent">
                {IconComponent && <IconComponent className="h-4 w-4" aria-hidden="true" />}
              </div>
              <h3 className="text-base font-semibold text-ink-1">{skill.title}</h3>
              <ul className="mt-3 space-y-1.5 text-sm leading-[1.55] text-ink-2">
                {skill.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
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
