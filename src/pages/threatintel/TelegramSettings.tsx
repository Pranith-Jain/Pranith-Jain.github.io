import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, ExternalLink, RefreshCw, Loader2, Bot, Radio } from 'lucide-react';
import { adminAuthHeaders } from '../../lib/admin-token';

interface CustomChannel {
  handle: string;
  name: string;
  added_at: string;
}

interface BotStatus {
  configured: boolean;
  bot_username: string | null;
  cached_channels: string[];
}

interface PollResult {
  ok: boolean;
  updates_processed: number;
  channels_updated: number;
  error?: string;
}

export default function TelegramSettings(): JSX.Element {
  const [channels, setChannels] = useState<CustomChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<PollResult | null>(null);

  const loadCtrlRef = useRef<AbortController | null>(null);
  const load = useCallback(() => {
    loadCtrlRef.current?.abort();
    const ctrl = new AbortController();
    loadCtrlRef.current = ctrl;
    setLoading(true);
    setError(null);
    fetch('/api/v1/telegram-custom-channels', {
      signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15000)]),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d) => setChannels(d.channels ?? []))
      .catch((e) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, []);

  const loadBotStatus = useCallback(() => {
    fetch('/api/v1/telegram-bot/status', { signal: AbortSignal.timeout(10000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setBotStatus(d);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    loadBotStatus();
  }, [load, loadBotStatus]);

  const addChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const h = handle.trim().replace(/^@/, '');
    if (!h) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch('/api/v1/telegram-custom-channels', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ handle: h, name: name.trim() || h }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? `HTTP ${res.status}`);
      } else {
        setHandle('');
        setName('');
        load();
      }
    } catch (e) {
      console.error('handler failed:', e instanceof Error ? e.message : String(e));
      if ((e as Error).name === 'AbortError') return;
      setAddError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const deleteChannel = async (h: string) => {
    if (!window.confirm(`Remove channel ${h}?`)) return;
    try {
      const res = await fetch(`/api/v1/telegram-custom-channels/${encodeURIComponent(h)}`, {
        method: 'DELETE',
        headers: adminAuthHeaders(),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) load();
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    }
  };

  const pollBot = async () => {
    setPolling(true);
    setPollResult(null);
    try {
      const res = await fetch('/api/v1/admin/telegram/bot/poll', {
        method: 'POST',
        headers: adminAuthHeaders(),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      setPollResult(data);
      loadBotStatus();
    } catch (e) {
      setPollResult({ ok: false, updates_processed: 0, channels_updated: 0, error: (e as Error).message });
    } finally {
      setPolling(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <div className="animate-fade-in-up mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <ExternalLink size={28} className="text-brand-600 dark:text-brand-400" /> Telegram channel settings
        </h1>
        <p className="text-sm font-mono text-muted mt-1">
          Add public Telegram channels to monitor. They will appear alongside the curated channels on the Telegram feed.
          Enter the channel handle without the @ prefix. Channels must have public{' '}
          <code className="text-xs">telegram.me/s/</code> preview enabled.
        </p>
      </div>

      {/* Bot Status Section */}
      <div className="mb-8 surface-card p-5">
        <h2 className="font-display font-semibold text-sm mb-3 flex items-center gap-2">
          <Bot size={16} className="text-brand-600 dark:text-brand-400" /> Bot API Status
        </h2>
        {botStatus === null ? (
          <div className="flex items-center gap-2 font-mono text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" /> loading...
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-sm">
              <span className="flex items-center gap-1.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${botStatus.configured ? 'bg-emerald-500' : 'bg-rose-500'}`}
                />
                {botStatus.configured ? 'Token configured' : 'Token missing'}
              </span>
              {botStatus.bot_username && <span className="text-slate-500">@{botStatus.bot_username}</span>}
              <span className="text-slate-500">{botStatus.cached_channels.length} channel(s) mapped</span>
            </div>
            {botStatus.configured && botStatus.cached_channels.length === 0 && (
              <p className="text-xs font-mono text-amber-600 dark:text-amber-400">
                Bot has no mapped channels. Add @{botStatus.bot_username ?? 'your-bot'} as admin to Telegram channels,
                then click Poll to discover them.
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={pollBot}
                disabled={polling || !botStatus.configured}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-mono hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {polling ? <Loader2 size={12} className="animate-spin" /> : <Radio size={12} />}
                Poll now
              </button>
              <button
                type="button"
                onClick={loadBotStatus}
                className="inline-flex items-center gap-1 text-xs font-mono text-slate-500 hover:text-brand-600"
              >
                <RefreshCw size={10} /> refresh
              </button>
            </div>
            {pollResult && (
              <div
                className={`rounded-lg p-3 font-mono text-xs ${pollResult.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'}`}
              >
                {pollResult.ok
                  ? pollResult.updates_processed > 0
                    ? `Processed ${pollResult.updates_processed} update(s), ${pollResult.channels_updated} new channel(s) mapped`
                    : 'No pending updates. Bot needs to be admin of channels to receive posts.'
                  : (pollResult.error ?? 'Poll failed')}
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={addChannel} className="mb-8 surface-card p-5">
        <h2 className="font-display font-semibold text-sm mb-3">Add a channel</h2>
        <div className="flex flex-wrap gap-3">
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="handle (e.g. IntCyberDigest)"
            className="flex-1 min-w-[180px] px-3 py-2 surface-card text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="display name (optional)"
            className="flex-1 min-w-[140px] px-3 py-2 surface-card text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          />
          <button
            type="submit"
            disabled={adding || !handle.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-mono hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add
          </button>
        </div>
        {addError && <p className="mt-2 text-xs font-mono text-rose-600 dark:text-rose-400">{addError}</p>}
        <p className="mt-2 text-micro font-mono text-slate-400">
          Channel is checked on the next feed refresh (cached up to 30 min).
        </p>
        <p className="mt-1 text-micro font-mono text-slate-400">
          Uses <code className="text-xs">telegram.me/s/</code> for scraping (t.me is blocked from Cloudflare Workers).
        </p>
      </form>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-sm">
          Custom channels {channels.length > 0 && <span className="font-mono text-slate-500">· {channels.length}</span>}
        </h2>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 text-xs font-mono text-slate-500 hover:text-brand-600"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 font-mono text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> loading...
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 font-mono text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {!loading && !error && channels.length === 0 && (
        <p className="font-mono text-sm text-slate-500">No custom channels added yet.</p>
      )}

      {!loading && channels.length > 0 && (
        <ul className="space-y-2">
          {channels.map((ch) => (
            <li key={ch.handle} className="surface-card p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-display font-semibold text-sm">{ch.name}</span>
                <code className="ml-2 text-xs font-mono text-slate-500">@{ch.handle}</code>
                <p className="text-micro font-mono text-slate-400 mt-0.5">
                  added {new Date(ch.added_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`https://telegram.me/s/${ch.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-1.5 text-slate-500 hover:text-brand-600"
                  aria-label="Preview channel"
                >
                  <ExternalLink size={12} />
                </a>
                <button
                  type="button"
                  onClick={() => deleteChannel(ch.handle)}
                  className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-1.5 text-slate-500 hover:text-rose-600"
                  aria-label="Remove channel"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
