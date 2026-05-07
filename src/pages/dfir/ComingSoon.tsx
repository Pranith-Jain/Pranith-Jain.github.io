import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface Props {
  title: string;
  description: string;
}

export function ComingSoon({ title, description }: Props): JSX.Element {
  return (
    <section className="max-w-3xl mx-auto px-8 py-20 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 transition-colors mb-12 font-mono"
      >
        <ArrowLeft size={14} />
        /dfir
      </Link>

      <span className="inline-block text-xs uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-4">
        Coming soon
      </span>

      <h1 className="text-4xl sm:text-5xl font-display font-bold mb-6 leading-tight">{title}</h1>

      <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">{description}</p>

      <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800">
        <p className="text-sm text-slate-500 font-mono">
          Status: <span className="text-brand-600 dark:text-brand-400">scheduled · phase 2</span>
        </p>
      </div>
    </section>
  );
}
