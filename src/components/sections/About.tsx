import { Link } from 'react-router-dom';
import { Terminal, ArrowRight } from 'lucide-react';
import { stats } from '../../data/content';
import { DropCapParagraph } from '../editorial';

/**
 * About — prose left, /dfir terminal preview right.
 *
 * The terminal mock is the page's visual hook: it shows what /dfir
 * actually does without requiring a click. The mock keeps its dark
 * surface (it's a tool preview, not editorial chrome), but loses the
 * decorative blur blobs around it.
 */
export function About() {
  return (
    <section id="about" className="scroll-mt-24 py-16 lg:py-24">
      <div className="grid items-start gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        {/* LEFT: prose */}
        <div>
          <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
            Alerts first, then everything else
          </h2>
          <div className="mt-8 max-w-[65ch] space-y-5 text-base leading-[1.65] text-ink-2">
            <DropCapParagraph>
              The work that taught me anything useful was the alert work. Phishing, BEC, malware, lookalike domains. Two
              hundred and fifty incidents in, you start seeing the same attacker patterns, the same defensive blind
              spots, and the same five steps you keep repeating by hand.
            </DropCapParagraph>
            <p>
              That&apos;s where the automation came from. With{' '}
              <span className="text-ink-1">n8n and a few MCP servers</span>, I moved the repeatable parts of triage off
              the analyst critical path. Mean response dropped from four hours to under 75 minutes. The decisions that
              actually need a human stayed with the human.
            </p>
            <p>
              I ship the tools I wish I&apos;d had on shift. The interactive ones live at{' '}
              <Link
                to="/dfir"
                className="text-accent underline decoration-2 underline-offset-4 transition-colors duration-enter hover:decoration-accent"
              >
                /dfir
              </Link>
              , the live threat-intel surface at{' '}
              <Link
                to="/threatintel"
                className="text-accent underline decoration-2 underline-offset-4 transition-colors duration-enter hover:decoration-accent"
              >
                /threatintel
              </Link>
              . Both run on Cloudflare Workers, both are free.
            </p>
            <p>
              Lately I&apos;ve been spending most of my reading time on{' '}
              <span className="text-ink-1">AI security and Non-Human Identity governance</span>. Prompt injection, MCP
              attack surface, service-account sprawl. The investigation-first mindset transfers well; the tooling is
              mostly still being built.
            </p>
            <p>
              If you&apos;re hiring for any of this, or working on the same problems in the open, my inbox is below.
            </p>
          </div>

          {/* Inline stats */}
          <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-rule pt-8 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col">
                <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">{stat.label}</dt>
                <dd className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-medium tracking-tight text-ink-1">{stat.value}</span>
                  {stat.suffix && <span className="font-mono text-[11px] text-ink-3">{stat.suffix}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* RIGHT: terminal mock — keeps its dark surface (tool preview, not chrome) */}
        <div aria-hidden="true">
          <div className="overflow-hidden border border-rule bg-slate-950 p-5">
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
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">Live demo</div>
              <Link
                to="/dfir/ioc-check"
                className="inline-flex items-center gap-1.5 border border-white/15 px-3 py-1.5 font-mono text-[10px] text-white transition-colors duration-enter hover:bg-white/10"
                aria-label="Open the IOC checker"
              >
                <Terminal className="h-3 w-3" aria-hidden="true" /> Try it{' '}
                <ArrowRight className="h-2.5 w-2.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
