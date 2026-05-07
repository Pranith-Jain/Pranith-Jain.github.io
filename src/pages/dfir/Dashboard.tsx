import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { readHistory, clearHistory, type HistoryEntry } from '../../lib/dfir/history';
import { HistoryRow } from '../../components/dfir/HistoryRow';

export default function Dashboard(): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    setEntries(readHistory());
  }, []);

  const handleClear = () => {
    clearHistory();
    setEntries([]);
  };

  return (
    <div className="max-w-3xl mx-auto px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>
      <div className="flex items-baseline justify-between mb-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-4xl font-display font-bold mb-2">Recent Lookups</h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-xl">
            Your last 20 queries, kept anonymously in this browser.
          </p>
        </motion.div>
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:text-rose-400"
          >
            <Trash2 size={12} /> clear
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="font-mono text-sm text-slate-600 dark:text-slate-400">
          No lookups yet. Try the{' '}
          <Link to="/dfir/ioc-check" className="text-brand-600 dark:text-brand-400 hover:underline">
            IOC checker
          </Link>{' '}
          or any other tool.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <HistoryRow key={e.id} e={e} />
          ))}
        </ul>
      )}
    </div>
  );
}
