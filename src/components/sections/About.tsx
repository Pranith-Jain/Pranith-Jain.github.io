import { Link } from 'react-router-dom';
import { Terminal, ArrowRight } from 'lucide-react';
import { stats } from '../../data/content';

/**
 * About — prose left, live-toolkit-mock right.
 *
 * The terminal mock is the page's visual hook: it shows what /dfir
 * actually does without requiring a click. The mock is decorative —
 * /dfir/ioc-check is one tap away for the real thing.
 */
export function About() {
  return (
    <section id="about" className="mt-24 scroll-mt-24">
      <div className="grid items-start gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        {/* LEFT: prose */}
        <div className="animate-fade-in-up">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
            02 — About
          </div>
          <h2 className="font-serif text-3xl font-normal italic tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            Alerts first, then everything else
          </h2>
          <div className="mt-7 max-w-[65ch] space-y-5 text-base leading-relaxed text-slate-700 dark:text-slate-300">
            <p>
              The work that taught me anything useful was the alert work. Phishing, BEC, malware, lookalike domains. Two
              hundred and fifty incidents in, you start seeing the same attacker patterns, the same defensive blind
              spots, and the same five steps you keep repeating by hand.
            </p>
            <p>
              That&apos;s where the automation came from. With{' '}
              <span className="font-semibold text-brand-700 dark:text-brand-400">n8n and a few MCP servers</span>, I
              moved the repeatable parts of triage off the analyst critical path. Mean response dropped from four hours
              to under 75 minutes. The decisions that actually need a human stayed with the human.
            </p>
            <p>
              I ship the tools I wish I&apos;d had on shift. The interactive ones live at{' '}
              <Link
                to="/dfir"
                className="inline-flex items-center gap-0.5 font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-400"
              >
                /dfir <ArrowRight size={12} />
              </Link>
              , the live threat-intel surface at{' '}
              <Link
                to="/threatintel"
                className="inline-flex items-center gap-0.5 font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-400"
              >
                /threatintel <ArrowRight size={12} />
              </Link>
              . Both run on Cloudflare Workers, both are free.
            </p>
            <p>
              Lately I&apos;ve been spending most of my reading time on{' '}
              <span className="font-semibold text-brand-700 dark:text-brand-400">
                AI security and Non-Human Identity governance
              </span>
              . Prompt injection, MCP attack surface, service-account sprawl. The investigation-first mindset transfers
              well; the tooling is mostly still being built.
            </p>
            <p>
              If you&apos;re hiring for any of this, or working on the same problems in the open, my inbox is below.
            </p>
          </div>

          {/* Inline stats below prose */}
          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-slate-200 pt-6 sm:grid-cols-4 dark:border-slate-800">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col">
                <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-500">{stat.label}</dt>
                <dd className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{stat.value}</span>
                  {stat.suffix && <span className="font-mono text-[11px] text-slate-500">{stat.suffix}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* RIGHT: terminal mock — restored as visual signature */}
        <div className="animate-fade-in-up relative" aria-hidden="true">
          {/* Decorative blur — subtle texture */}
          <div className="absolute -right-6 -top-6 -z-10 h-48 w-48 rounded-full bg-brand-500/15 blur-3xl" />
          <div className="absolute -bottom-6 -left-6 -z-10 h-32 w-32 rounded-full bg-emerald-500/10 blur-2xl" />

          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-3 font-mono text-[10px] text-slate-500">pranithjain.qzz.io/dfir/ioc-check</span>
            </div>
            <div className="space-y-1.5 font-mono text-[11px] leading-relaxed text-slate-300 sm:text-xs">
              <div className="text-slate-500">$ ioc check 8.8.8.8</div>
              <div className="text-emerald-400">streaming verdicts…</div>
              <div className="text-slate-400">virustotal · clean · 0/92</div>
              <div className="text-slate-400">abuseipdb · clean · 0%</div>
              <div className="text-slate-400">threatfox · clean · 0/list</div>
              <div className="text-slate-400">spamhaus · clean · 0/1626</div>
              <div className="text-slate-400">greynoise · clean · RIOT</div>
              <div className="text-slate-500">…18 more sources…</div>
              <div className="text-emerald-400">done</div>
              <div className="text-slate-300">{'{"verdict":"clean","contributing":24}'}</div>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-brand-300">Live Demo</div>
              <Link
                to="/dfir/ioc-check"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 font-mono text-[10px] text-white transition hover:bg-white/15"
                aria-label="Open the IOC checker"
              >
                <Terminal className="h-3 w-3" /> try it →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
