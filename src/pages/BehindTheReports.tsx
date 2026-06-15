import { Link } from 'react-router-dom';

const sections = [
  {
    label: 'Phase One',
    title: 'How Threats Are Found',
    body: [
      'Every night, a self-hosted collection platform scans adversary infrastructure — C2 panels, phishing kits, malware distribution points, and open directories hosting stolen data. Automated crawlers enumerate new domains, certificates, and IPs tied to active campaigns, while passive sensors ingest telemetry from dark web forums, Telegram channels, and paste sites.',
      'Discovered binaries and documents are detonated in a sandbox environment. Network traffic, file system changes, and registry modifications are recorded. Indicators of compromise — hashes, IPs, domains, mutexes, and registry keys — are extracted and correlated against existing threat data.',
      'A triage dashboard surfaces what is worth investigating. Automated scoring accounts for prevalence, victimology, and novelty. The result is a prioritized queue of genuine threats, not a fire hose of unverified alerts.',
    ],
  },
  {
    label: 'Phase Two',
    title: 'How Reports Are Made',
    body: [
      'Each investigation follows a structured multi-agent AI workflow. A drafting agent produces an initial narrative from raw sandbox output, network logs, and OSINT enrichment. A review agent checks for logical gaps, missing evidence, and unsupported claims. A final editorial pass ensures clarity, proper citation, and adherence to the structured threat-information format.',
      'The output is not a machine dump. It is prose that explains what the threat does, who it targets, how it operates, and what defenders should do about it. Every claim is sourced. Every indicator is validated. Every report is designed to be acted on within minutes of reading.',
      'This workflow produces original research, not aggregation. The Hunter\'s Ledger does not repackage third-party feeds. Every report published here originates from raw data we collected, analyzed, and verified ourselves.',
    ],
  },
];

export default function BehindTheReports() {
  return (
    <>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="mb-16">
          <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
            Behind the Reports
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
            Behind the Reports
          </h1>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
            How the Intelligence Is Produced
          </p>
        </div>

        <div className="stagger space-y-12">
          {sections.map((section) => (
            <section
              key={section.label}
              className="rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 sm:p-8"
            >
              <div className="mb-3 text-xs font-mono uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400">
                {section.label}
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-5">
                {section.title}
              </h2>
              <div className="space-y-4 text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                {section.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-16 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-brand-50/50 dark:bg-brand-950/20 p-6 sm:p-8">
          <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed">
            <span className="font-semibold text-slate-900 dark:text-white">
              Most threat intelligence fails defenders
            </span>{' '}
            — it is too slow, too generic, or too noisy to act on. The Hunter's Ledger exists to fill that gap. Every
            report is original research, produced from raw collection through a rigorous, repeatable process designed for
            one purpose: giving you intelligence you can trust under pressure.
          </p>
        </div>

        <div className="mt-12 rounded-xl border border-slate-200/70 dark:border-slate-800 p-6 sm:p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Browse published reports on{' '}
            <Link to="/threatintel" className="text-brand-600 dark:text-brand-400 underline hover:no-underline">
              the threat intelligence hub
            </Link>
            , explore{' '}
            <Link to="/dfir" className="text-brand-600 dark:text-brand-400 underline hover:no-underline">
              DFIR tools
            </Link>
            , or read the{' '}
            <Link to="/blog" className="text-brand-600 dark:text-brand-400 underline hover:no-underline">
              blog
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
