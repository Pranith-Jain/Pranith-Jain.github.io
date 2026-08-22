import { useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Phone, AlertTriangle, Shield, MapPin } from 'lucide-react';

interface TruecallerResult {
  phone_number: string;
  country_code?: string;
  carrier?: string;
  number_type?: string;
  name?: string;
  alt_name?: string;
  spam_score?: number;
  spam_reports?: number;
  is_spam?: boolean;
  city?: string;
  country?: string;
  timezone?: string;
  is_truecaller?: boolean;
  last_updated?: string;
  [key: string]: unknown;
}

interface TruecallerResponse {
  success: boolean;
  phone_number: string;
  result?: TruecallerResult;
  elapsed_ms: number;
  error?: string;
}

export default function Truecaller() {
  const [phone, setPhone] = useState('');
  const [submittedPhone, setSubmittedPhone] = useState<string | null>(null);

  const { data, loading, error } = useDataFetch<TruecallerResponse>({
    url: submittedPhone ? `/api/v1/truecaller/lookup?phone=${encodeURIComponent(submittedPhone)}` : null,
    ttl: 60_000,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = phone.trim();
    if (trimmed) {
      setSubmittedPhone(trimmed);
    }
  };

  const r = data?.result;

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR"
      icon={<Phone />}
      title="Truecaller Lookup"
      description={
        <span>
          Reverse phone lookup via{' '}
          <a
            href="https://www.truecaller.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline transition-colors"
          >
            Truecaller
          </a>{' '}
          — get caller name, carrier, spam score, and location data for any phone number.
        </span>
      }
    >
      <div className="space-y-6 max-w-3xl mx-auto">
        <section className="surface-card p-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="e.g. +1 202 555 0147, 0800 123 4567, (555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <Button
                type="submit"
                variant="primary-brand"
                size="sm"
                loading={loading}
                disabled={!phone.trim()}
                icon={<Phone size={14} />}
              >
                {loading ? 'looking up…' : 'lookup'}
              </Button>
            </div>
            <p className="text-micro text-muted">
              Any format works — E.164, local, with or without +. Enter a phone number to look up.
            </p>
          </form>
        </section>

        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Spinner size="md" className="mr-3" />
            Looking up phone number...
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-4 flex items-center gap-3">
            <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
            <p className="text-sm font-mono text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-4">
            {/* Quick identity card */}
            {r && (
              <section className="surface-card p-4">
                <h2 className="text-eyebrow font-mono uppercase tracking-[0.16em] text-muted mb-3">Identity</h2>
                <div className="space-y-3">
                  <div>
                    <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {r.name || 'Unknown Caller'}
                    </div>
                    {r.alt_name && <div className="text-sm text-muted mt-0.5">{r.alt_name}</div>}
                    <div className="font-mono text-sm text-muted mt-1">{data.phone_number}</div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {r.carrier && (
                      <div className="flex items-center gap-1.5 text-sm font-mono">
                        <span className="text-muted">Carrier:</span>
                        <span className="text-slate-900 dark:text-slate-100">{r.carrier}</span>
                      </div>
                    )}
                    {r.number_type && (
                      <div className="flex items-center gap-1.5 text-sm font-mono">
                        <span className="text-muted">Type:</span>
                        <span className="text-slate-900 dark:text-slate-100">{r.number_type}</span>
                      </div>
                    )}
                    {r.country_code && (
                      <div className="flex items-center gap-1.5 text-sm font-mono">
                        <MapPin size={12} className="text-muted" />
                        <span className="text-slate-900 dark:text-slate-100">{r.country_code}</span>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Spam assessment */}
            {r && typeof r.spam_score === 'number' && (
              <section className="surface-card p-4">
                <h2 className="text-eyebrow font-mono uppercase tracking-[0.16em] text-muted mb-3">
                  <Shield size={12} className="inline mr-1" />
                  Spam Assessment
                </h2>
                <div className="flex items-center gap-4">
                  <div
                    className={`text-2xl font-bold ${
                      r.is_spam
                        ? 'text-rose-600 dark:text-rose-400'
                        : r.spam_score > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {r.spam_score}
                  </div>
                  <div>
                    <div className="text-sm font-mono text-slate-900 dark:text-slate-100">
                      {r.is_spam ? 'Known Spam' : r.spam_score > 0 ? 'Low Spam Score' : 'Clean'}
                    </div>
                    {typeof r.spam_reports === 'number' && (
                      <div className="text-micro font-mono text-muted">
                        {r.spam_reports} spam report{r.spam_reports !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Full details */}
            {r && (
              <section className="surface-card p-4">
                <h2 className="text-eyebrow font-mono uppercase tracking-[0.16em] text-muted mb-3">Details</h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Phone Number', value: r.phone_number },
                    { label: 'Country Code', value: r.country_code },
                    { label: 'City', value: r.city },
                    { label: 'Country', value: r.country },
                    { label: 'Timezone', value: r.timezone },
                    { label: 'Number Type', value: r.number_type },
                    { label: 'Carrier', value: r.carrier },
                    { label: 'On Truecaller', value: r.is_truecaller ? 'Yes' : 'No' },
                    { label: 'Last Updated', value: r.last_updated },
                    {
                      label: 'Spam Reports',
                      value: typeof r.spam_reports === 'number' ? String(r.spam_reports) : undefined,
                    },
                  ]
                    .filter((item) => item.value)
                    .map((item) => (
                      <div key={item.label}>
                        <div className="text-micro font-mono uppercase tracking-wider text-muted">{item.label}</div>
                        <div className="text-sm font-mono text-slate-900 dark:text-slate-100 mt-0.5">{item.value}</div>
                      </div>
                    ))}
                </div>
              </section>
            )}

            {!r && data && (
              <div className="rounded-xl border border-amber-300/70 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/30 p-4 flex items-center gap-3">
                <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-sm font-mono text-amber-700 dark:text-amber-300">
                  No result found for this phone number. It may not be in Truecaller's database.
                </p>
              </div>
            )}

            {data.elapsed_ms && (
              <div className="text-center text-micro text-muted">Lookup completed in {data.elapsed_ms}ms</div>
            )}
          </div>
        )}

        <div className="text-center pt-6 pb-2 text-xs text-muted border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Powered by{' '}
          <a
            href="https://www.truecaller.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline transition-colors"
          >
            Truecaller
          </a>{' '}
          — crowd-sourced caller ID database with 400M+ users.
        </div>
      </div>
    </DataPageLayout>
  );
}
