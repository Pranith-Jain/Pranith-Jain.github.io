import { useEffect, useState } from 'react';
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
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-3xl mx-auto px-8 py-12">
        <Link
          to="/dfir"
          className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#00fff9] mb-8 font-mono"
        >
          <ArrowLeft size={14} /> /dfir
        </Link>
        <div className="flex items-baseline justify-between mb-8">
          <div>
            <h1 className="text-4xl font-display font-bold mb-2">Recent Lookups</h1>
            <p className="text-[#a1a1aa] max-w-xl">Your last 20 queries, kept anonymously in this browser.</p>
          </div>
          {entries.length > 0 && (
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 text-xs font-mono text-[#a1a1aa] hover:text-[#ef4444]"
            >
              <Trash2 size={12} /> clear
            </button>
          )}
        </div>

        {entries.length === 0 ? (
          <p className="font-mono text-sm text-[#a1a1aa]">
            No lookups yet. Try the{' '}
            <Link to="/dfir/ioc-check" className="text-[#00fff9] hover:underline">
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
    </div>
  );
}
