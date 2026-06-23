import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { StatItem } from '../../core/entities';

interface AboutProps {
  stats: StatItem[];
}

export function About({ stats }: AboutProps) {
  return (
    <section id="about" className="scroll-mt-24">
      <div className="max-w-3xl">
        <div className="mb-3 text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          About me
        </div>
        <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Alerts first, then everything else
        </h2>

        <div className="mt-6 space-y-5 text-lg sm:text-xl text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>
            The work that taught me anything useful was the alert work. Phishing, BEC, malware, lookalike domains. Two
            hundred and fifty incidents in, you start seeing the same attacker patterns, the same defensive blind spots,
            and the same five steps you keep repeating by hand.
          </p>
          <p>
            That's where the automation came from. With{' '}
            <span className="font-semibold text-slate-900 dark:text-white">n8n and a few MCP servers</span>, I moved the
            repeatable parts of triage off the analyst critical path. Mean response dropped from four hours to under 75
            minutes. The decisions that actually need a human stayed with the human.
          </p>
          <p>
            I ship the tools I wish I'd had on shift. The interactive ones live at{' '}
            <Link
              to="/dfir"
              className="font-semibold text-brand-700 dark:text-brand-400 underline-offset-4 hover:underline inline-flex items-center gap-1"
            >
              /dfir <ArrowRight size={14} aria-hidden="true" />
            </Link>
            , the live threat-intel surface at{' '}
            <Link
              to="/threatintel"
              className="font-semibold text-brand-700 dark:text-brand-400 underline-offset-4 hover:underline inline-flex items-center gap-1"
            >
              /threatintel <ArrowRight size={14} aria-hidden="true" />
            </Link>
            . Both run on Cloudflare Workers, both are free.
          </p>
          <p>
            Lately I've been spending most of my reading time on{' '}
            <span className="font-semibold text-slate-900 dark:text-white">
              AI security and Non-Human Identity governance
            </span>
            . Prompt injection, MCP attack surface, service-account sprawl. The investigation-first mindset transfers
            well; the tooling is mostly still being built.
          </p>
          <p>If you're hiring for any of this, or working on the same problems in the open, my inbox is below.</p>
        </div>
      </div>

      {/* Stats strip — same minimal `dl` rhythm as the home status block.
          Plain numbers, caps-mono labels, no card chrome. Each cell is
          separated by a thin left rule on sm+ so the row reads as a clean
          band of facts, not four boxes. */}
      <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 sm:[&>div+div]:border-l sm:[&>div+div]:border-slate-200/80 sm:[&>div+div]:pl-5 sm:[&>div+div]:dark:border-[rgb(var(--border-400))]">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-eyebrow font-mono uppercase text-slate-500 dark:text-slate-400">{stat.label}</dt>
            <dd className="mt-1 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{stat.value}</span>
              {stat.suffix && (
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{stat.suffix}</span>
              )}
            </dd>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{stat.description}</p>
            {stat.source && (
              <Link
                to={stat.source}
                className="mt-1 inline-flex items-center gap-1 text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline"
              >
                {stat.sourceLabel || 'verify'} →
              </Link>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}
