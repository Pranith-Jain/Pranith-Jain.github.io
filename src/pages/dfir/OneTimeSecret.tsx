import { useState, useEffect, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import { Copy, Eye, EyeOff } from 'lucide-react';

type PageMode = 'create' | 'view';

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeText(plain: string): Uint8Array {
  return new TextEncoder().encode(plain);
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

async function encryptSecret(plaintext: string): Promise<{ ciphertext: string; iv: string; key: string }> {
  const keyMaterial = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', keyMaterial.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);
  const rawIv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: rawIv.buffer as ArrayBuffer },
    key,
    encodeText(plaintext).buffer as ArrayBuffer
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(rawIv),
    key: bytesToBase64(keyMaterial),
  };
}

async function decryptSecret(ciphertext: string, iv: string, keyB64: string): Promise<string> {
  const keyMaterial = base64ToBytes(keyB64);
  const key = await crypto.subtle.importKey('raw', keyMaterial.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, [
    'decrypt',
  ]);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv).buffer as ArrayBuffer },
    key,
    base64ToBytes(ciphertext).buffer as ArrayBuffer
  );
  return decodeText(new Uint8Array(decrypted));
}

type ViewState =
  { mode: 'loading' } | { mode: 'revealed'; content: string } | { mode: 'burned' } | { mode: 'error'; message: string };

export default function OneTimeSecret() {
  const [mode, setMode] = useState<PageMode>('create');
  const [secret, setSecret] = useState('');
  const [expiry, setExpiry] = useState('1h');
  const [status, setStatus] = useState<'idle' | 'encrypting' | 'uploading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const [view, setView] = useState<ViewState>({ mode: 'loading' });

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes('id=') || !hash.includes('key=')) {
      setMode('create');
      setView({ mode: 'loading' });
      return;
    }
    const params = new URLSearchParams(hash.slice(1));
    const id = params.get('id');
    const key = params.get('key');
    if (!id || !key) {
      window.location.hash = '';
      setMode('create');
      return;
    }
    setMode('view');

    (async () => {
      try {
        const res = await fetch(`/api/v1/one-time-secret/${id}`);
        if (res.status === 404) {
          setView({ mode: 'burned' });
          return;
        }
        if (!res.ok) {
          setView({ mode: 'error', message: `Server error (${res.status})` });
          return;
        }
        const data = (await res.json()) as { ciphertext: string; iv: string };
        const content = await decryptSecret(data.ciphertext, data.iv, decodeURIComponent(key));
        setView({ mode: 'revealed', content });
      } catch (err) {
        setView({ mode: 'error', message: err instanceof Error ? err.message : 'Decryption failed' });
      }
    })();
  }, []);

  const handleCreate = useCallback(async () => {
    if (!secret.trim()) {
      setMessage('Enter a secret first');
      setStatus('error');
      return;
    }

    setStatus('encrypting');
    setMessage('Encrypting...');

    try {
      const { ciphertext, iv, key } = await encryptSecret(secret);

      setStatus('uploading');
      setMessage('Storing...');

      const res = await fetch('/api/v1/one-time-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ciphertext, iv, expiresIn: expiry }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }));
        setStatus('error');
        setMessage(err.message || 'Upload failed');
        return;
      }

      const { id } = (await res.json()) as { id: string };
      const url = `${window.location.origin}/dfir/one-time-secret#id=${id}&key=${encodeURIComponent(key)}`;
      setShareUrl(url);
      setStatus('done');
      setMessage('Secret created! Share the link below.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    }
  }, [secret, expiry]);

  const EXPIRY_OPTIONS: { value: string; label: string }[] = [
    { value: '15m', label: '15 minutes' },
    { value: '1h', label: '1 hour' },
    { value: '1d', label: '1 day' },
    { value: '7d', label: '7 days' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-6 font-mono"
      >
        back
      </BackLink>

      <div className="flex items-baseline gap-2 mb-2">
        <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">One-Time Secret</h1>
        <span className="text-mini font-mono uppercase tracking-[0.18em] text-slate-500">
          Encrypted &middot; Burn after reading
        </span>
      </div>

      {mode === 'create' && (
        <>
          <p className="text-xs font-mono text-slate-500 max-w-xl">
            Secrets are encrypted in your browser before being sent to the server. The decryption key is embedded in the
            share URL — the server never sees it. Once viewed, the secret is permanently deleted.
          </p>

          <div>
            <label className="text-xs font-mono text-slate-500 mb-1 block">
              Secret
              <textarea
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                rows={6}
                className="w-full rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2 text-xs font-mono text-slate-900 dark:text-slate-100 mt-1"
                placeholder="Paste your secret here..."
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-mono text-slate-500 flex items-center gap-2">
              Expires after:
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] px-2 py-1 text-xs font-mono text-slate-900 dark:text-slate-100"
              >
                {EXPIRY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={handleCreate}
              disabled={status === 'encrypting' || status === 'uploading'}
              className="px-4 py-2 text-xs font-mono rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {status === 'encrypting' ? 'Encrypting...' : status === 'uploading' ? 'Storing...' : 'Generate Link'}
            </button>

            <button
              type="button"
              onClick={() => {
                setSecret('');
                setShareUrl('');
                setMessage('');
                setStatus('idle');
              }}
              className="px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-400 hover:border-rose-400"
            >
              Clear
            </button>
          </div>

          {message && (
            <div
              className={`text-xs font-mono p-2 rounded-xl ${
                status === 'error'
                  ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400'
                  : status === 'done'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                    : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
              }`}
            >
              {message}
            </div>
          )}

          {shareUrl && (
            <div className="space-y-2">
              <label className="text-xs font-mono text-slate-500 mb-1 block">
                Share this URL (one-time use):
                <div className="flex items-center gap-2 mt-1">
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(shareUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    aria-live="polite"
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono rounded-xl bg-brand-600 text-white hover:bg-brand-700"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </label>
            </div>
          )}
        </>
      )}

      {mode === 'view' && (
        <div className="space-y-4">
          {view.mode === 'loading' && (
            <div className="text-xs font-mono text-slate-500 animate-pulse">Loading secret...</div>
          )}

          {view.mode === 'revealed' && (
            <>
              <div className="flex items-center gap-2 text-xs font-mono text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-xl">
                <Eye className="w-4 h-4" />
                This secret has been revealed and is now permanently deleted from the server.
              </div>
              <div>
                <label className="text-xs font-mono text-slate-500 mb-1 block">
                  Secret content:
                  <textarea
                    readOnly
                    value={view.content}
                    rows={8}
                    className="w-full rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2 text-xs font-mono text-slate-900 dark:text-slate-100 mt-1"
                  />
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(view.content);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  aria-live="polite"
                  className="mt-1 text-mini font-mono text-brand-600 dark:text-brand-400 hover:underline"
                >
                  {copied ? 'Copied!' : 'Copy to clipboard'}
                </button>
              </div>
            </>
          )}

          {view.mode === 'burned' && (
            <div className="flex items-center gap-2 text-xs font-mono text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 p-2 rounded-xl">
              <EyeOff className="w-4 h-4" />
              This secret has already been viewed or never existed. Secrets are deleted after a single read.
            </div>
          )}

          {view.mode === 'error' && (
            <div className="flex items-center gap-2 text-xs font-mono text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 p-2 rounded-xl">
              {view.message}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                window.location.hash = '';
                window.location.reload();
              }}
              className="px-4 py-2 text-xs font-mono rounded-xl bg-brand-600 text-white hover:bg-brand-700"
            >
              Create a Secret
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
