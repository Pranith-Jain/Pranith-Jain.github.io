import { useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft } from 'lucide-react';

const GATEWAYS = [
  { label: 'Tor2web', url: 'https://{onion}.tor2web.io' },
  { label: 'Tor.link', url: 'https://{onion}.tor.link' },
  { label: 'Onion.ws', url: 'https://{onion}.onion.ws' },
  { label: 'Onion.sh', url: 'https://{onion}.onion.sh' },
  { label: 'Onion.live', url: 'https://{onion}.onion.live' },
];

export default function TorGateway() {
  const [onion, setOnion] = useState('');
  const [cleaned, setCleaned] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = onion.trim();
    if (!raw) return;
    let addr = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!addr.endsWith('.onion') && !addr.match(/^[a-z2-7]{16,56}\.onion$/i)) {
      addr = addr.replace(/\.onion$/, '') + '.onion';
    }
    setCleaned(addr);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-6 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="flex items-baseline gap-2 mb-2">
        <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">Tor Gateway</h1>
        <span className="text-mini font-mono uppercase tracking-[0.18em] text-slate-500">
          .onion → Clearnet Gateway Links
        </span>
      </div>

      <p className="text-xs font-mono text-slate-500 max-w-xl">
        Generate clearnet gateway URLs for .onion services. These gateways allow access to Tor hidden services without
        the Tor Browser. Note that gateway traffic is not anonymous and some .onion sites block known gateways.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2 max-w-xl">
        <input
          type="text"
          value={onion}
          onChange={(e) => setOnion(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs font-mono text-slate-900 dark:text-slate-100"
          placeholder="Paste .onion address, e.g. darkfailen53ddea4vw7uxs7b6m5m6k6f7hw7j4i6byoa6woqhzxrad.onion"
        />
        <button
          type="submit"
          className="px-4 py-2 text-xs font-mono rounded-lg bg-brand-600 text-white hover:bg-brand-700"
        >
          Generate
        </button>
      </form>

      {cleaned && (
        <div className="space-y-3">
          <div className="text-xs font-mono text-slate-500">
            Gateway links for <span className="text-slate-700 dark:text-slate-300">{cleaned}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {GATEWAYS.map((gw) => {
              const href = gw.url.replace('{onion}', cleaned);
              return (
                <a
                  key={gw.label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-400 dark:hover:border-brand-600 transition-colors group"
                >
                  <span className="text-xs font-mono text-slate-700 dark:text-slate-300">{gw.label}</span>
                  <span className="text-mini font-mono text-brand-600 dark:text-brand-400 group-hover:underline truncate ml-2 max-w-[200px]">
                    {href}
                  </span>
                </a>
              );
            })}
          </div>
          <p className="text-mini font-mono text-slate-400 italic">
            ⚠ Gateways are operated by third parties. Do not trust them with sensitive data. Always verify you are
            accessing the correct .onion address.
          </p>
        </div>
      )}
    </div>
  );
}
