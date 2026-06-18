import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ShieldCheck, Eye, Zap, GitBranch } from 'lucide-react';
import { personalInfo } from '../../data/content';
import { DataDisclaimer } from '../../components/DataDisclaimer';

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    t: 'Privacy-first',
    d: 'Client-side processing by default — no accidental uploads, no tracking, no accounts.',
  },
  { icon: Eye, t: 'Transparent', d: 'Predictable, inspectable tool behaviour built on standard Web APIs.' },
  { icon: Zap, t: 'Zero setup', d: 'Ready-to-use in the browser. Nothing to install, no keys to provision.' },
  {
    icon: GitBranch,
    t: 'Pivot-friendly',
    d: 'Outputs are easy to copy, export (CSV/JSON) and link onward for investigation.',
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-6 mb-6">
      <h2 className="font-display font-bold text-xl mb-3">{title}</h2>
      <div className="text-sm font-mono text-muted leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function ToolsAbout(): JSX.Element {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> all tools
      </BackLink>

      <h1 className="font-display font-bold text-3xl mb-2">About these toolkits</h1>
      <p className="text-sm font-mono text-muted mb-8 max-w-2xl">
        Privacy-first DFIR &amp; OSINT utilities by {personalInfo.name} — {personalInfo.title}. Every tool runs entirely
        in your browser; sensitive data never leaves your device.
      </p>

      <div className="grid sm:grid-cols-2 gap-3 mb-8">
        {PRINCIPLES.map((p) => {
          const I = p.icon;
          return (
            <div
              key={p.t}
              className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-4"
            >
              <div className="flex items-center gap-2 font-display font-semibold mb-1">
                <I size={16} className="text-brand-600 dark:text-brand-400" /> {p.t}
              </div>
              <p className="text-tool font-mono text-muted leading-relaxed">{p.d}</p>
            </div>
          );
        })}
      </div>

      <Section title="DFIR Toolkit">
        <p>
          A collection of browser-based utilities for incident-response triage: IOC extraction, timestamp conversion,
          hashing, email-header analysis, log and PCAP triage, Windows artifact parsing (EVTX, registry hives, prefetch,
          PE), SQLite/iOS artifact inspection and more. Built for SOC analysts, DFIR responders, blue-teamers and
          students who need fast, trustworthy tools without setup overhead — and without shipping enterprise data to a
          third party.
        </p>
      </Section>

      <Section title="OSINT Toolkit">
        <p>
          Lightweight reconnaissance and collection tools: dork building, brand-impersonation discovery, username
          mapping, DNS/CT lookups, email OSINT, EXIF/metadata extraction, image fingerprinting, screenshot intelligence,
          archive/redirect analysis and reverse-image pivots. Designed for investigators, journalists and analysts who
          need quick, reliable utilities that keep public-record data under the operator's control.
        </p>
      </Section>

      <Section title="Why I built this">
        <p>
          Many online security tools require uploads or proxy your input through external services — an unnecessary
          exposure when you're handling logs, hashes, headers or reconnaissance data that can contain confidential
          infrastructure detail or PII. These tools take the opposite stance: modern browser APIs do the work locally,
          so capability doesn't cost you confidentiality.
        </p>
      </Section>

      <Section title="Technical stack">
        <ul className="list-disc pl-5 space-y-1">
          <li>Vite + React 18 + TypeScript, client components, statically prerendered</li>
          <li>Tailwind CSS for styling</li>
          <li>
            Web Crypto API, File API and Canvas for local processing; lazy WASM (sql.js) loaded per-tool on demand
          </li>
          <li>
            Hand-rolled binary parsers (PE, regf, EVTX, prefetch/LZXPRESS-Huffman, pcap, plist, protobuf) — no server
            round-trips
          </li>
          <li>CSV/JSON export via the File API</li>
          <li>Deployed on Cloudflare Workers (edge) with strict CSP — privacy-first, client-side processing</li>
        </ul>
      </Section>

      <Section title="Data sources & disclaimer">
        <DataDisclaimer />
      </Section>
    </div>
  );
}
