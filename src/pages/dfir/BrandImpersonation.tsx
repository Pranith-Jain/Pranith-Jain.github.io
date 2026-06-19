import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

const TLDS = ['com', 'net', 'org', 'co', 'io', 'app', 'online', 'site', 'xyz', 'info', 'live', 'sbs', 'shop'];
const HOMO: Record<string, string[]> = {
  a: ['4', '@'],
  e: ['3'],
  i: ['1', 'l'],
  l: ['1', 'i'],
  o: ['0'],
  s: ['5', '$'],
  g: ['9'],
  b: ['8'],
};
const AFFIX = ['login', 'secure', 'account', 'verify', 'support', 'mail', 'app', 'portal', 'auth'];

function variants(domain: string): { typo: string[]; homo: string[]; affix: string[]; tld: string[] } {
  const dot = domain.lastIndexOf('.');
  const name = (dot > 0 ? domain.slice(0, dot) : domain).toLowerCase().replace(/[^a-z0-9-]/g, '');
  const tld = dot > 0 ? domain.slice(dot + 1) : 'com';
  const typo = new Set<string>();
  for (let i = 0; i < name.length; i++) {
    typo.add(name.slice(0, i) + name.slice(i + 1) + '.' + tld); // omission
    typo.add(name.slice(0, i) + name[i] + name[i] + name.slice(i + 1) + '.' + tld); // duplication
    if (i < name.length - 1) typo.add(name.slice(0, i) + name[i + 1] + name[i] + name.slice(i + 2) + '.' + tld); // transposition
  }
  const homo = new Set<string>();
  for (let i = 0; i < name.length; i++) {
    const subs = HOMO[name[i]!];
    if (subs) for (const sub of subs) homo.add(name.slice(0, i) + sub + name.slice(i + 1) + '.' + tld);
  }
  const affix = new Set<string>();
  for (const a of AFFIX) {
    affix.add(`${a}-${name}.${tld}`);
    affix.add(`${name}-${a}.${tld}`);
    affix.add(`${name}${a}.${tld}`);
  }
  const tlds = TLDS.filter((t) => t !== tld).map((t) => `${name}.${t}`);
  return {
    typo: [...typo].slice(0, 40),
    homo: [...homo].slice(0, 30),
    affix: [...affix].slice(0, 40),
    tld: tlds,
  };
}

function Group({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3">
      <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-2">
        {title} · {items.length}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((d) => (
          <a
            key={d}
            href={`https://crt.sh/?q=${encodeURIComponent(d)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Check certificate transparency for this variant"
            className="font-mono text-mini px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-700 dark:text-slate-300 hover:border-brand-500/40"
          >
            {d}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function BrandImpersonation(): JSX.Element {
  const [input, setInput] = useState('');
  const v = useMemo(() => (input.trim() ? variants(input.trim()) : null), [input]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir/tools/osint"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> OSINT tools
      </Link>
      <h1 className="font-display font-bold text-2xl flex items-center gap-2">
        <ShieldAlert size={22} className="text-brand-600 dark:text-brand-400" />
        Brand Impersonation Explorer
      </h1>
      <p className="text-sm font-mono text-muted mt-1 mb-6">
        Generate typosquat, homoglyph, affix and TLD-swap variants of a brand domain. Each variant links to crt.sh —
        pivot to find which lookalikes have live certs. Generated locally.
      </p>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="brand domain — e.g. example.com"
        className="w-full rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 px-3 py-2.5 font-mono text-sm focus:border-brand-500 focus:outline-none"
      />

      {v && (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <Group title="Typos (omit / double / swap)" items={v.typo} />
          <Group title="Homoglyph / leetspeak" items={v.homo} />
          <Group title="Affix (login-, -secure…)" items={v.affix} />
          <Group title="TLD swaps" items={v.tld} />
        </div>
      )}
      <div className="mt-6">
        <Link
          to={`/threatintel/domain-monitor?domain=${encodeURIComponent(input.trim())}`}
          className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded-lg border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:bg-brand-500/20"
        >
          Check live DNS & blacklists for these variants →
        </Link>
      </div>
    </div>
  );
}
