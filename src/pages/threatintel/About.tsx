import { ShieldCheck, Radio, Layers, GitBranch } from 'lucide-react';
import { personalInfo } from '../../data/content';
import { DataDisclaimer } from '../../components/DataDisclaimer';
import { DataPageLayout } from '../../components/DataPageLayout';

const PRINCIPLES = [
  {
    icon: Radio,
    t: 'Live, not cached opinion',
    d: 'Feeds are pulled fresh at the edge each visit — ransomware claims, CVE/KEV, IOCs, firehoses.',
  },
  {
    icon: ShieldCheck,
    t: 'Reference, verify-first',
    d: 'Every surface is decision-support. Validate indicators in your own environment before acting.',
  },
  {
    icon: Layers,
    t: 'Cross-source by design',
    d: 'Correlation favours indicators seen in 2+ independent feeds — single-feed flags are noisy.',
  },
  {
    icon: GitBranch,
    t: 'Open + portable',
    d: 'STIX 2.1 export, RSS, JSON — pull what you need into your own pipeline.',
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface-card p-6 mb-6">
      <h2 className="font-display font-bold text-xl mb-3">{title}</h2>
      <div className="text-sm font-mono text-muted leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function ThreatIntelAbout(): JSX.Element {
  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<ShieldCheck size={28} />}
      title="About the threat-intel platform"
      description={
        <p className="text-sm font-mono text-muted max-w-2xl">
          A live, edge-aggregated threat-intelligence surface by {personalInfo.name} — {personalInfo.title}. Built to
          answer the questions a CTI analyst actually asks, without an account or a vendor portal.
        </p>
      }
      maxWidthClass="max-w-4xl"
    >
      <div className="grid sm:grid-cols-2 gap-3 mb-8">
        {PRINCIPLES.map((p) => {
          const I = p.icon;
          return (
            <div key={p.t} className="surface-card p-4">
              <div className="flex items-center gap-2 font-display font-semibold mb-1">
                <I size={16} className="text-brand-600 dark:text-brand-400" /> {p.t}
              </div>
              <p className="text-tool font-mono text-muted leading-relaxed">{p.d}</p>
            </div>
          );
        })}
      </div>

      <Section title="What it covers">
        <p>
          Live ransomware leak-site claims (multi-tracker, deduped), CVE merged with the CISA KEV catalogue, a
          malware-sample stream, phishing URLs with brand attribution, defacement and underground-market feeds, and
          firehoses from Bluesky, Mastodon, Reddit and Telegram. Plus daily/weekly briefings, a ten-panel metrics board,
          cross-source IOC correlation, actor and MITRE catalogues, and a parsed mirror of the deepdarkCTI index.
        </p>
      </Section>

      <Section title="Who it's for">
        <p>
          CTI analysts, SOC and IR teams, threat researchers and students who want a fast, honest read on what is active
          right now — and a place to pivot from a single indicator to its cross-source context.
        </p>
      </Section>

      <Section title="Why I built this">
        <p>
          Most live-intel surfaces are gated behind a vendor login or quietly stale. This one fetches upstream feeds
          fresh at the Cloudflare edge, deduplicates across sources, and stays honest about freshness (a feed-status
          page shows exactly what is warm). It is reference-grade decision support, never a substitute for your own
          validation.
        </p>
      </Section>

      <Section title="Technical stack">
        <ul className="list-disc pl-5 space-y-1">
          <li>Vite + React 18 + TypeScript, statically prerendered, client components</li>
          <li>Cloudflare Workers (edge) — per-feed Cache API + KV last-good fallback, scheduled briefing/warm crons</li>
          <li>Tailwind CSS; strict CSP; no third-party trackers</li>
          <li>~40 upstream sources normalized server-side; STIX 2.1 / RSS / JSON export</li>
          <li>Honest degradation — single-source-down tolerance and a public feed-status dashboard</li>
        </ul>
      </Section>

      <Section title="Data sources & disclaimer">
        <DataDisclaimer />
      </Section>
    </DataPageLayout>
  );
}
