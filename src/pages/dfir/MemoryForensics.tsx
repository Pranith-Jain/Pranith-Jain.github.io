import { BackLink } from '../../components/BackLink';
import { Shield } from 'lucide-react';

export default function MemoryForensics(): JSX.Element {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-slate-900 dark:text-slate-100">
      <BackLink to="/dfir" className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-brand-600 mb-6">← back to DFIR</BackLink>
      <h1 className="text-3xl font-display font-bold flex items-center gap-3 mb-2"><Shield className="text-brand-600" /> Memory Forensics</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8">Volatility 3 integration — upload memory dumps for process, network, and injection analysis</p>
      <div className="text-center py-20"><Shield size={48} className="mx-auto mb-4 text-slate-300" /><p className="text-slate-500">This feature is being built. Check back soon.</p></div>
    </div>
  );
}
