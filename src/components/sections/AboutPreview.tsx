import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PjMark } from '../../components/PjMark';
import { useInView } from '../../hooks/useInView';
import type { PersonalInfo } from '../../core/entities';

interface AboutPreviewProps {
  personalInfo: PersonalInfo;
}

export function AboutPreview({ personalInfo }: AboutPreviewProps) {
  const [ref, inView] = useInView({ threshold: 0.1 });

  return (
    <section ref={ref} id="about-preview" className="scroll-mt-24" aria-labelledby="about-preview-heading">
      <div
        className={`surface-card p-6 sm:p-8 transition-all duration-700 ease-out ${
          inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">
          <div className="flex-1 min-w-0">
            <h3
              id="about-preview-heading"
              className="font-display text-xl font-semibold tracking-[-0.96px] text-slate-900 dark:text-white"
            >
              {personalInfo.name}
            </h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 font-medium">{personalInfo.shortTitle}</p>
            <p className="mt-3 text-sm text-muted leading-relaxed">{personalInfo.description}</p>

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

          <div className="shrink-0 self-start sm:self-center">
            <PjMark className="h-16 w-16 sm:h-20 sm:w-20" />
          </div>
        </div>
      </div>
    </section>
  );
}
