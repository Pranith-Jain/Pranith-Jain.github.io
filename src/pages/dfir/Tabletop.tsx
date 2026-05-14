import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ScrollText, Shuffle, Download, ExternalLink } from 'lucide-react';
import {
  ARCHETYPES,
  ROLE_LABELS,
  pickArchetype,
  renderTemplate,
  type Archetype,
  type Role,
  type ScenarioArchetype,
} from '../../data/tabletop';
import { threatActors } from '../../data/dfir/threat-actors';

const ROLE_COLORS: Record<Role, string> = {
  'ir-lead': 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  'tech-lead': 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  comms: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  legal: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  exec: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

function pickRandom<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

interface Selection {
  actorSlug: string;
  archetypeId: Archetype;
  industry: string;
}

function defaultSelection(): Selection {
  const actor = pickRandom(threatActors);
  const archetype = pickArchetype(actor.motivation);
  const industry = actor.targets.length ? pickRandom(actor.targets) : 'your industry';
  return { actorSlug: actor.slug, archetypeId: archetype.id, industry };
}

function buildMarkdown(
  arch: ScenarioArchetype,
  vars: { actor: string; industry: string; malware: string },
  sel: Selection
): string {
  const lines: string[] = [];
  lines.push(`# Tabletop exercise — ${arch.name}`);
  lines.push('');
  lines.push(`**Actor:** ${vars.actor}  `);
  lines.push(`**Industry:** ${vars.industry}  `);
  lines.push(`**Malware family / TTP:** ${vars.malware}  `);
  lines.push(`**Timing cue:** ${arch.timingCue}`);
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(renderTemplate(arch.setup, vars));
  lines.push('');
  for (const inj of arch.injects) {
    lines.push(`## ${inj.t} — ${inj.headline}`);
    lines.push('');
    lines.push(renderTemplate(inj.body, vars));
    lines.push('');
    lines.push('### Discussion prompts');
    lines.push('');
    for (const p of inj.prompts) {
      lines.push(`- **${ROLE_LABELS[p.role]}:** ${renderTemplate(p.question, vars)}`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push(`Generated from /dfir/tabletop · archetype \`${sel.archetypeId}\` · actor \`${sel.actorSlug}\`.`);
  return lines.join('\n');
}

export default function Tabletop(): JSX.Element {
  const [selection, setSelection] = useState<Selection>(defaultSelection);

  const actor = threatActors.find((a) => a.slug === selection.actorSlug) ?? threatActors[0];
  const archetype = ARCHETYPES.find((a) => a.id === selection.archetypeId) ?? ARCHETYPES[0];

  const vars = useMemo(
    () => ({
      actor: actor.name,
      industry: selection.industry,
      malware: actor.malware[0] ?? 'a custom loader',
    }),
    [actor, selection.industry]
  );

  const reroll = () => setSelection(defaultSelection());

  const exportMd = () => {
    const md = buildMarkdown(archetype, vars, selection);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tabletop-${archetype.id}-${actor.slug}.md`;
    // Firefox / Safari require the anchor to be in the document for click() to fire.
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <ScrollText size={28} className="text-brand-600 dark:text-brand-400" /> Tabletop / IR Exercise Generator
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2">
          Generate a tabletop scenario from {ARCHETYPES.length} archetypes (ransomware, BEC, supply-chain, espionage,
          edge-exploit, insider) populated with a real threat-actor profile from{' '}
          <Link to="/threatintel/actors" className="text-brand-600 dark:text-brand-400 hover:underline">
            the catalog
          </Link>
          . Inject sequence with role-specific discussion prompts; markdown export for your facilitator pack.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Designed for 60-90 minute exercises with IR Lead, Tech Lead, Communications, Legal, and Executive Sponsor at
          the table.
        </p>
      </div>

      {/* Controls */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 mb-1 block">
              Threat actor
            </span>
            <select
              value={selection.actorSlug}
              onChange={(e) => {
                const slug = e.target.value;
                const act = threatActors.find((a) => a.slug === slug)!;
                setSelection((s) => ({
                  ...s,
                  actorSlug: slug,
                  archetypeId: pickArchetype(act.motivation).id,
                  industry: act.targets[0] ?? s.industry,
                }));
              }}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 font-mono text-xs"
            >
              {threatActors.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name} — {a.motivation}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 mb-1 block">
              Scenario archetype
            </span>
            <select
              value={selection.archetypeId}
              onChange={(e) => setSelection((s) => ({ ...s, archetypeId: e.target.value as Archetype }))}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 font-mono text-xs"
            >
              {ARCHETYPES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 mb-1 block">
              Industry / target sector
            </span>
            <input
              type="text"
              value={selection.industry}
              onChange={(e) => setSelection((s) => ({ ...s, industry: e.target.value }))}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 font-mono text-xs"
              placeholder="Financial services"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={reroll}
            className="text-sm font-mono px-3 py-1.5 rounded border border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300 hover:border-brand-500 inline-flex items-center gap-1.5"
          >
            <Shuffle size={13} /> Re-roll
          </button>
          <button
            onClick={exportMd}
            className="text-sm font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1.5"
          >
            <Download size={13} /> Export markdown
          </button>
        </div>
      </section>

      {/* Scenario header */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
          <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">{archetype.name}</h2>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-500">{archetype.timingCue}</span>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-3 text-[11px] font-mono mb-3">
          <span>
            <span className="text-slate-500 dark:text-slate-500">Actor: </span>
            <Link
              to={`/threatintel/actors/${actor.slug}`}
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              {actor.name}
            </Link>
          </span>
          <span>
            <span className="text-slate-500 dark:text-slate-500">Industry: </span>
            <span className="text-slate-700 dark:text-slate-300">{vars.industry}</span>
          </span>
          <span>
            <span className="text-slate-500 dark:text-slate-500">Malware/TTP: </span>
            <span className="text-slate-700 dark:text-slate-300">{vars.malware}</span>
          </span>
        </div>
        <p className="text-sm font-mono text-slate-700 dark:text-slate-300 leading-relaxed">
          {renderTemplate(archetype.setup, vars)}
        </p>
      </section>

      {/* Inject timeline */}
      <section className="space-y-3 mb-6">
        {archetype.injects.map((inj, i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
          >
            <div className="flex flex-wrap items-baseline gap-3 mb-1.5">
              <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
                {inj.t}
              </span>
              <h3 className="font-display font-semibold text-slate-900 dark:text-slate-100">{inj.headline}</h3>
            </div>
            <p className="text-sm font-mono text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
              {renderTemplate(inj.body, vars)}
            </p>
            <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 mb-2">
              Discussion prompts
            </h4>
            <ul className="space-y-1.5">
              {inj.prompts.map((p, j) => (
                <li key={j} className="text-sm font-mono">
                  <span
                    className={`inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border mr-2 ${ROLE_COLORS[p.role]}`}
                  >
                    {ROLE_LABELS[p.role]}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">{renderTemplate(p.question, vars)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
          Facilitator notes
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-slate-600 dark:text-slate-400 list-disc pl-5">
          <li>
            <strong>Time-box.</strong> 10-15 minutes per inject keeps a 60-90 minute exercise on track.
          </li>
          <li>
            <strong>Don't break the fourth wall.</strong> If a participant says "we'd just check our runbook" — make
            them run it. The point is to find the gap.
          </li>
          <li>
            <strong>Decision logs.</strong> Capture who decided what, on what evidence — that's the artefact you
            actually want from a tabletop.
          </li>
          <li>
            <strong>Pair with</strong>{' '}
            <Link to="/dfir/kill-chain" className="text-brand-600 dark:text-brand-400 hover:underline">
              the Kill Chain
            </Link>{' '}
            and{' '}
            <Link to="/dfir/diamond" className="text-brand-600 dark:text-brand-400 hover:underline">
              Diamond Model
            </Link>{' '}
            views during the exercise.
          </li>
        </ul>
        <p className="mt-3 text-xs font-mono text-slate-500 dark:text-slate-500 inline-flex items-center gap-1">
          <ExternalLink size={11} />
          References:{' '}
          <a
            href="https://www.cisa.gov/resources-tools/services/cisa-tabletop-exercise-packages"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            CISA Tabletop Exercise Packages (CTEPs)
          </a>
        </p>
      </section>
    </div>
  );
}
