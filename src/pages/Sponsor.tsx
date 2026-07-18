import { Mail } from 'lucide-react';
import { Button } from '../components/ui/Button';

const tiers = [
  {
    name: 'Monthly Sponsor',
    price: '$500',
    period: '/mo',
    annual: 'or $5,000/yr',
    features: [
      'Logo placement on every report and dashboard',
      'Site-wide sponsor presence (footer, hub pages)',
      'Early access to unpublished research',
      'Opportunity to sponsor a specific research topic',
    ],
  },
  {
    name: 'Report Sponsor',
    price: '$150',
    period: '/report',
    annual: '$115 from catalog',
    features: [
      'Exclusive placement on a single report (no co-sponsors)',
      'Permanent link on the published report',
      'Discount on multi-report or catalog backfill',
      'Transparent attribution: "Sponsored by" label',
    ],
  },
];

const benefits = [
  {
    title: 'Reach Defenders',
    body: 'Your brand appears alongside intelligence that SOC analysts, incident responders, and threat hunters read and reference. No noise — just the right audience.',
  },
  {
    title: 'Demonstrate Credibility',
    body: 'Sponsoring independent threat research signals that your organization takes security seriously. It builds trust with a technically sophisticated audience.',
  },
  {
    title: 'Permanent Shelf Life',
    body: 'Unlike ads or conference booths, a sponsorship on a published report persists. Each report remains live and discoverable, carrying your attribution as long as it exists.',
  },
];

export default function Sponsor() {
  return (
    <>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="mb-16 text-center">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Sponsor This Research
          </h1>
          <p className="mt-3 text-base sm:text-lg text-muted leading-relaxed max-w-2xl mx-auto">
            Support independent threat intelligence production. Your sponsorship keeps the collection infrastructure
            running, the sandbox detonating, and the reports coming — all while reaching the security community that
            matters.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 mb-16">
          {tiers.map((tier) => (
            <div key={tier.name} className="surface-card p-6 sm:p-8 flex flex-col">
              <div className="mb-3 text-eyebrow font-mono uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                {tier.name}
              </div>
              <div className="mb-1">
                <span className="font-display text-4xl font-bold text-slate-900 dark:text-white">{tier.price}</span>
                <span className="text-base text-slate-500 dark:text-slate-400">{tier.period}</span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{tier.annual}</p>
              <ul className="space-y-3 mb-8 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="text-sm text-slate-700 dark:text-slate-300 flex items-start gap-2">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                href="mailto:hello@pranithjain.com?subject=Sponsorship%20Inquiry"
                variant="primary-brand"
                size="md"
                icon={<Mail className="h-4 w-4" />}
                fullWidth
              >
                Get in Touch
              </Button>
            </div>
          ))}
        </div>

        <div className="mb-16 rounded-xl border border-slate-200/70 dark:border-[rgb(var(--border-400))] p-6 sm:p-8">
          <div className="mb-3 text-eyebrow font-mono uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Editorial Independence
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            Sponsors Do Not Control Content
          </h2>
          <div className="space-y-4 text-base text-slate-700 dark:text-slate-300 leading-relaxed">
            <p>
              Sponsorship buys placement, not influence. No sponsor reviews, edits, or delays a report before
              publication. No sponsor directs research topics or receives preferential coverage. The Hunter's Ledger
              maintains full editorial control over what is published, how it is analyzed, and how findings are
              presented.
            </p>
            <p>
              If a sponsor is implicated in suspicious activity, that fact is disclosed in the relevant report. Trust is
              the only asset that matters here — it is not for sale.
            </p>
          </div>
        </div>

        <div className="mb-16">
          <div className="mb-8 text-center">
            <div className="mb-3 text-eyebrow font-mono uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Why Sponsor
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              What You Get
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {benefits.map((b) => (
              <div key={b.title} className="surface-card p-6">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{b.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{b.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/70 dark:border-[rgb(var(--border-400))] bg-brand-50/50 dark:bg-brand-950/20 p-6 sm:p-8 text-center">
          <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
            Interested in sponsoring? Let's talk about what fits your goals.
          </p>
          <Button
            href="mailto:hello@pranithjain.com?subject=Sponsorship%20Inquiry"
            variant="primary-brand"
            size="lg"
            icon={<Mail className="h-4 w-4" />}
          >
            hello@pranithjain.com
          </Button>
        </div>
      </div>
    </>
  );
}
