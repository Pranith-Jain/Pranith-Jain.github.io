import { Link } from 'react-router-dom';
import { Terminal, ArrowRight } from 'lucide-react';
import { stats } from '../../data/content';

export function About() {
  return (
    <section id="about" className="mt-32 scroll-mt-24">
      <div className="grid items-center gap-16 lg:grid-cols-2">
        {/* Left Content */}
        <div className="animate-fade-in-up">
          <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
            About Me
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-slate-900 dark:text-white leading-tight">
            Alerts first, then everything else
          </h2>
          <div className="mt-8 space-y-6 text-lg text-slate-700 dark:text-slate-300 leading-relaxed">
            <p>
              The work that taught me anything useful was the alert work. Phishing, BEC, malware, lookalike domains. Two
              hundred and fifty incidents in, you start seeing the same attacker patterns, the same defensive blind
              spots, and the same five steps you keep repeating by hand.
            </p>
            <p>
              That's where the automation came from. With{' '}
              <span className="text-brand-700 dark:text-brand-400 font-semibold">n8n and a few MCP servers</span>, I
              moved the repeatable parts of triage off the analyst critical path. Mean response dropped from four hours
              to under 75 minutes. The decisions that actually need a human stayed with the human.
            </p>
            <p>
              I ship the tools I wish I'd had on shift. The interactive ones live at{' '}
              <Link
                to="/dfir"
                className="text-brand-700 dark:text-brand-400 font-semibold underline-offset-4 hover:underline inline-flex items-center gap-1"
              >
                /dfir <ArrowRight size={14} />
              </Link>
              , the live threat-intel surface at{' '}
              <Link
                to="/threatintel"
                className="text-brand-700 dark:text-brand-400 font-semibold underline-offset-4 hover:underline inline-flex items-center gap-1"
              >
                /threatintel <ArrowRight size={14} />
              </Link>
              . Both run on Cloudflare Workers, both are free.
            </p>
            <p>
              Lately I've been spending most of my reading time on{' '}
              <span className="text-brand-700 dark:text-brand-400 font-semibold">
                AI security and Non-Human Identity governance
              </span>
              . Prompt injection, MCP attack surface, service-account sprawl. The investigation-first mindset transfers
              well; the tooling is mostly still being built.
            </p>
            <p>If you're hiring for any of this, or working on the same problems in the open, my inbox is below.</p>
          </div>

          {/* Stats Grid */}
          <div className="animate-fade-in-up mt-10 grid grid-cols-2 sm:grid-cols-4 gap-6">
            {stats.map((stat) => (
              <div key={stat.label} className="glass rounded-2xl p-4 text-center">
                <div className="text-3xl font-black text-brand-600 dark:text-brand-400">{stat.value}</div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Content - On-brand visual */}
        <div className="animate-fade-in-up relative" aria-hidden="true">
          <div className="glass relative z-10 overflow-hidden rounded-[3rem] p-8 shadow-2xl bg-gradient-to-br from-slate-900 to-brand-950">
            {/* Terminal-style mock showing the toolkit in action */}
            <div className="rounded-2xl bg-slate-950 p-5 font-mono text-xs text-slate-300 shadow-inner border border-white/5">
              <div className="flex items-center gap-2 mb-4">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-3 text-slate-500">pranithjain.qzz.io/dfir</span>
              </div>
              <div className="space-y-1.5">
                <div className="text-slate-500">$ ioc check 8.8.8.8</div>
                <div className="text-emerald-400">streaming verdicts…</div>
                <div className="text-slate-400">virustotal · clean · 0/92</div>
                <div className="text-slate-400">abuseipdb · clean · 0%</div>
                <div className="text-slate-400">threatfox · clean · 0/list</div>
                <div className="text-slate-400">spamhaus · clean · 0/1626</div>
                <div className="text-slate-400">greynoise · clean · RIOT</div>
                <div className="text-slate-500">…18 more sources…</div>
                <div className="text-emerald-400">done</div>
                <div>{'{"verdict":"clean","contributing":24}'}</div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-brand-300 font-semibold">Live Demo</div>
              <Link
                to="/dfir"
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-mono text-white hover:bg-white/20 transition"
                aria-label="Open the DFIR toolkit"
              >
                <Terminal size={12} aria-hidden="true" />
                /dfir
              </Link>
            </div>
          </div>
          <div className="absolute -right-8 -top-8 -z-10 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl"></div>
          <div className="absolute -bottom-8 -left-8 -z-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-2xl"></div>
        </div>
      </div>
    </section>
  );
}
