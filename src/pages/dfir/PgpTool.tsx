import { useState, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft } from 'lucide-react';

// openpgp is ~380KB. Lazy-load on first use so the PgpTool chunk stays small.
type OpenPgpModule = typeof import('openpgp');
let openpgpCache: OpenPgpModule | null = null;
async function getOpenpgp(): Promise<OpenPgpModule> {
  if (!openpgpCache) openpgpCache = await import('openpgp');
  return openpgpCache;
}

type PgpMode = 'encrypt' | 'decrypt' | 'sign' | 'verify' | 'generate';

export default function PgpTool() {
  const [mode, setMode] = useState<PgpMode>('encrypt');
  const [copied, setCopied] = useState(false);
  const [publicKey, setPublicKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [armor, setArmor] = useState(true);
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const generateKey = useCallback(async () => {
    setStatus('working');
    setMessage('Generating key pair...');
    try {
      const openpgp = await getOpenpgp();
      const { privateKey: priv, publicKey: pub } = await openpgp.generateKey({
        type: 'ecc',
        curve: 'curve25519Legacy',
        userIDs: [{ name: 'Anonymous', email: 'anon@localhost' }],
        passphrase: passphrase || undefined,
        format: 'armored',
      });
      setPrivateKey(priv);
      setPublicKey(pub);
      setOutput(priv);
      setStatus('done');
      setMessage('Key pair generated. Save your private key securely — it cannot be recovered.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Generation failed');
    }
  }, [passphrase]);

  const run = useCallback(async () => {
    setStatus('working');
    setMessage('');
    try {
      const openpgp = await getOpenpgp();
      switch (mode) {
        case 'encrypt': {
          const pub = await openpgp.readKey({ armoredKey: publicKey });
          const msg = await openpgp.createMessage({ text: input });
          const cipher = await openpgp.encrypt({ message: msg, encryptionKeys: pub });
          setOutput(cipher as string);
          break;
        }
        case 'decrypt': {
          const priv = await openpgp.decryptKey({
            privateKey: await openpgp.readPrivateKey({ armoredKey: privateKey }),
            passphrase,
          });
          const msg = await openpgp.readMessage({ armoredMessage: input });
          const plain = await openpgp.decrypt({ message: msg, decryptionKeys: priv });
          setOutput(plain.data as string);
          break;
        }
        case 'sign': {
          const priv = await openpgp.decryptKey({
            privateKey: await openpgp.readPrivateKey({ armoredKey: privateKey }),
            passphrase,
          });
          const msg = await openpgp.createMessage({ text: input });
          const signed = await openpgp.sign({ message: msg, signingKeys: priv, detached: !armor });
          setOutput(signed as string);
          break;
        }
        case 'verify': {
          const pub = await openpgp.readKey({ armoredKey: publicKey });
          const msg = await openpgp.readMessage({ armoredMessage: input });
          const result = await openpgp.verify({ message: msg, verificationKeys: pub });
          const sig = result.signatures[0];
          const verified = await sig?.verified;
          setMessage(verified ? '✓ Signature verified' : '✗ Signature INVALID');
          setOutput(result.data as string);
          break;
        }
      }
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }, [mode, publicKey, privateKey, passphrase, input, armor]);

  const modes: { key: PgpMode; label: string }[] = [
    { key: 'encrypt', label: 'Encrypt' },
    { key: 'decrypt', label: 'Decrypt' },
    { key: 'sign', label: 'Sign' },
    { key: 'verify', label: 'Verify' },
    { key: 'generate', label: 'Generate Key' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-6 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="flex items-baseline gap-2 mb-2">
        <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">PGP Tool</h1>
        <span className="text-mini font-mono uppercase tracking-[0.18em] text-slate-500">
          Encrypt · Decrypt · Sign · Verify
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => {
              setMode(m.key);
              setOutput('');
              setMessage('');
              setStatus('idle');
            }}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
              mode === m.key
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-700 dark:text-slate-300 hover:border-brand-500'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode !== 'generate' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {mode !== 'verify' && mode !== 'encrypt' ? null : (
            <div>
              <label className="text-xs font-mono text-slate-500 mb-1 block">
                Public Key (armored)
                <textarea
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2 text-xs font-mono text-slate-900 dark:text-slate-100 mt-1"
                  placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
                />
              </label>
            </div>
          )}
          {mode !== 'decrypt' && mode !== 'sign' ? null : (
            <div>
              <label className="text-xs font-mono text-slate-500 mb-1 block">
                Private Key (armored)
                <textarea
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2 text-xs font-mono text-slate-900 dark:text-slate-100 mt-1"
                  placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----"
                />
              </label>
            </div>
          )}
          {mode !== 'decrypt' && mode !== 'sign' ? null : (
            <div>
              <label className="text-xs font-mono text-slate-500 mb-1 block">
                Passphrase
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2 text-xs font-mono text-slate-900 dark:text-slate-100 mt-1"
                  placeholder="Private key passphrase"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {mode === 'generate' && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-mono text-slate-500 mb-1 block">
              Passphrase (optional)
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full max-w-md rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2 text-xs font-mono text-slate-900 dark:text-slate-100 mt-1"
                placeholder="Protect private key with passphrase"
              />
            </label>
          </div>
          <button
            onClick={generateKey}
            disabled={status === 'working'}
            className="px-4 py-2 text-xs font-mono rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {status === 'working' ? 'Generating...' : 'Generate Key Pair'}
          </button>
        </div>
      )}

      {mode !== 'generate' && (
        <>
          <div>
            <label className="text-xs font-mono text-slate-500 mb-1 block">
              {mode === 'encrypt'
                ? 'Plaintext'
                : mode === 'decrypt'
                  ? 'Ciphertext (armored)'
                  : mode === 'sign'
                    ? 'Message to sign'
                    : 'Signed message'}
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              placeholder="Paste input here..."
            />
          </div>

          {mode === 'sign' && (
            <label className="flex items-center gap-2 text-xs font-mono text-slate-500">
              <input type="checkbox" checked={!armor} onChange={() => setArmor(!armor)} />
              Detached signature (binary)
            </label>
          )}

          <button
            onClick={run}
            disabled={status === 'working'}
            className="px-4 py-2 text-xs font-mono rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {status === 'working' ? 'Processing...' : mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        </>
      )}

      {message && (
        <div
          className={`text-xs font-mono p-2 rounded-lg ${
            status === 'error' || message.includes('INVALID')
              ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400'
              : status === 'done'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
          }`}
        >
          {message}
        </div>
      )}

      {output && (
        <div>
          <label className="text-xs font-mono text-slate-500 mb-1 block">
            Output
            <textarea
              readOnly
              value={output}
              rows={8}
              className="w-full rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2 text-xs font-mono text-slate-900 dark:text-slate-100 mt-1"
            />
          </label>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(output);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            aria-live="polite"
            className="mt-1 text-mini font-mono text-brand-600 dark:text-brand-400 hover:underline"
          >
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
      )}
    </div>
  );
}
