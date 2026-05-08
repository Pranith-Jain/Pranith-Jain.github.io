import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Copy, Check, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { detectEncoding, decodeBase64, decodeUrl, decodeChain, type DecodeStep } from '../../lib/dfir/decode';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

const FORMAT_BADGE: Record<string, string> = {
  base64: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  url: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  unknown: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export default function Decode(): JSX.Element {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<string>('');
  const [steps, setSteps] = useState<DecodeStep[]>([]);
  const [mode, setMode] = useState<'auto' | 'base64' | 'url'>('auto');

  const runDecode = (inputStr: string, selectedMode: 'auto' | 'base64' | 'url') => {
    const trimmed = inputStr.trim();
    if (!trimmed) {
      setOutput('');
      setError(null);
      setFormat('');
      setSteps([]);
      return;
    }

    setError(null);

    if (selectedMode === 'auto') {
      const chain = decodeChain(trimmed);
      if (chain.length === 0) {
        setSteps([]);
        setFormat('unknown');
        setOutput(trimmed);
        setError('Could not detect encoding format.');
        return;
      }
      setSteps(chain);
      setFormat(chain.length > 1 ? 'nested' : chain[0].format);
      setOutput(chain[chain.length - 1].output);
    } else if (selectedMode === 'base64') {
      const result = decodeBase64(trimmed);
      setSteps([]);
      setFormat('base64');
      if (result.ok) {
        setOutput(result.result);
      } else {
        setOutput('');
        setError(result.error);
      }
    } else {
      const result = decodeUrl(trimmed);
      setSteps([]);
      setFormat('url');
      if (result.ok) {
        setOutput(result.result);
      } else {
        setOutput('');
        setError(result.error);
      }
    }
  };

  const handleInput = (val: string) => {
    setInput(val);
    runDecode(val, mode);
  };

  const handleMode = (m: 'auto' | 'base64' | 'url') => {
    setMode(m);
    runDecode(input, m);
  };

  const detectedOnLoad = input ? detectEncoding(input) : 'unknown';

  return (
    <div className="max-w-5xl mx-auto px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-4xl font-display font-bold mb-2">Decoder</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Base64 and URL decode — auto-detect, multi-pass chaining for nested encodings.
        </p>
      </motion.div>

      {/* Mode buttons */}
      <div className="flex gap-2 mb-6">
        {(['auto', 'base64', 'url'] as const).map((m) => (
          <button
            key={m}
            onClick={() => handleMode(m)}
            className={`px-4 py-2 rounded-lg font-mono text-sm font-semibold transition-colors border ${
              mode === m
                ? 'bg-brand-600 dark:bg-brand-500 text-white border-brand-600 dark:border-brand-500'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-brand-400'
            }`}
          >
            {m === 'auto' ? 'Auto-Detect' : m === 'base64' ? 'Base64 Decode' : 'URL Decode'}
          </button>
        ))}
      </div>

      {/* Two-pane layout */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* Input */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="decode-input" className="text-xs font-mono text-slate-500 uppercase tracking-wider">
              Input
            </label>
            {input && mode === 'auto' && detectedOnLoad !== 'unknown' && (
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${FORMAT_BADGE[detectedOnLoad]}`}>
                Detected: {detectedOnLoad.toUpperCase()}
              </span>
            )}
          </div>
          <textarea
            id="decode-input"
            value={input}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Paste encoded string here..."
            rows={12}
            className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 resize-none"
          />
        </div>

        {/* Output */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="decode-output" className="text-xs font-mono text-slate-500 uppercase tracking-wider">
              Output
            </label>
            <div className="flex items-center gap-2">
              {format && format !== 'unknown' && (
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${FORMAT_BADGE[format] ?? FORMAT_BADGE.unknown}`}
                >
                  {format === 'nested' ? 'NESTED' : format.toUpperCase()}
                </span>
              )}
              {output && <CopyButton text={output} />}
            </div>
          </div>
          <div className="relative h-full">
            <textarea
              id="decode-output"
              readOnly
              value={output}
              rows={12}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 resize-none focus:outline-none"
              placeholder="Decoded output will appear here..."
            />
          </div>
        </div>
      </div>

      {error && <p className="mb-4 text-sm font-mono text-amber-600 dark:text-amber-400">{error}</p>}

      {/* Multi-pass steps */}
      {steps.length > 1 && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h3 className="font-display font-semibold text-lg mb-4">Decode chain — {steps.length} passes</h3>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs font-mono text-slate-400">#{i + 1}</span>
                  <span
                    className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${FORMAT_BADGE[step.format] ?? FORMAT_BADGE.unknown}`}
                  >
                    {step.format.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-slate-500 truncate">
                    {step.input.slice(0, 80)}
                    {step.input.length > 80 ? '…' : ''}
                  </div>
                  <ChevronRight size={12} className="text-slate-400 my-0.5" />
                  <div className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all">
                    {step.output.slice(0, 200)}
                    {step.output.length > 200 ? '…' : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
