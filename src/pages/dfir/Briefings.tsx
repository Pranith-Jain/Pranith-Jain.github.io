import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Rss } from 'lucide-react';
import { motion } from 'framer-motion';
import { briefings, type BriefingType } from '../../data/dfir/briefings';
import { BriefingCard } from '../../components/dfir/BriefingCard';
import { IocFeedStream } from '../../components/dfir/IocFeedStream';

type Filter = 'all' | BriefingType;
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
];

export default function Briefings(): JSX.Element {
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = briefings
    .filter((b) => filter === 'all' || b.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="max-w-5xl mx-auto px-8 py-16 text-slate-900 dark:text-slate-100">
      {/* Back link */}
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-10 font-mono transition-colors"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-12"
      >
        <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-3">
          Intel Briefings
        </span>
        <h1 className="text-4xl sm:text-5xl font-display font-bold text-slate-900 dark:text-slate-100 mb-4 leading-tight">
          Threat Intel Briefings
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          Curated daily and weekly summaries of threat intelligence activity, drawn from live IOC feeds including CISA
          KEV, Abuse.ch, and OpenPhish. Reference only — verify all indicators in your own environment.
        </p>
      </motion.header>

      {/* Live IOC Streams */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="mb-14"
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">Live IOC Streams</h2>
          <span className="text-xs font-mono text-slate-400">6 sources · capped at 100 entries · 30 min cache</span>
        </div>
        <IocFeedStream />
      </motion.section>

      {/* Briefings section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">Briefings</h2>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2 mb-8">
          {FILTERS.map(({ id, label }) => {
            const isActive = id === filter;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider border transition-colors ${
                  isActive
                    ? 'bg-brand-500/15 dark:bg-brand-400/15 text-brand-600 dark:text-brand-400 border-brand-500/40'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-brand-500/30'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Briefings list */}
        {filtered.length === 0 ? (
          <p className="text-sm font-mono text-slate-400 py-10 text-center">No briefings found.</p>
        ) : (
          <div className="space-y-4">
            {filtered.map((briefing) => (
              <BriefingCard key={briefing.slug} briefing={briefing} />
            ))}
          </div>
        )}
      </motion.section>

      {/* RSS CTA placeholder */}
      <div className="mt-16 flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
        <Rss size={16} className="text-slate-400 shrink-0" />
        <p className="text-sm font-mono text-slate-500">
          RSS feed coming soon — subscribe to get briefings in your favourite reader.
        </p>
      </div>
    </div>
  );
}
