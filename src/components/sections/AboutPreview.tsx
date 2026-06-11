import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useInView } from '../../hooks/useInView';
import type { PersonalInfo } from '../../core/entities';

interface AboutPreviewProps {
  personalInfo: PersonalInfo;
}

export function AboutPreview({ personalInfo }: AboutPreviewProps) {
  const [ref, inView] = useInView({ threshold: 0.1 });
  const initials = personalInfo.name
    .split(' ')
    .map((n) => n[0])
    .join('');

  return (
    <section ref={ref} id="about-preview" className="mt-20 scroll-mt-24" aria-labelledby="about-preview-heading">
      <div
        className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-6 sm:p-8 transition-all duration-700 ease-out ${
          inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-brand-50 dark:bg-brand-900/30 border-2 border-brand-200 dark:border-brand-800">
            <span className="font-display text-xl font-bold text-brand-600 dark:text-brand-400">{initials}</span>
          </div>

          <div className="flex-1 min-w-0">
            <h3
              id="about-preview-heading"
              className="font-display text-xl font-bold text-slate-900 dark:text-white"
            >
              {personalInfo.name}
            </h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 font-medium">
              {personalInfo.shortTitle}
            </p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {personalInfo.description}
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to="/about"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline"
              >
                More about me <ArrowRight size={14} aria-hidden="true" />
              </Link>
              <Link
                to="/skills"
                className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Skills & certifications <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
