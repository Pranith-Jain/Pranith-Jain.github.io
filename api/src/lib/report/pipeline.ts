import type { Env } from '../../env';
import type { Report, ResolvedSubject, SourcePlan, SourceResult, TemplateId, Tlp } from './types';
import { resolveSubject } from './subject-resolver';
import { planSources } from './source-planner';
import { gatherPhase, type GatherContext } from './gatherer';
import { validateMitreIds, validateActorNames, detectContradictions, type Conflict } from './validator';
import { rankEvidence, type RankedItem } from './ranker';
import { writeReport, type WriteDeps, type WriteOutput } from './writer';
import { assembleReport } from './assemble';

export type Phase = 'resolve' | 'plan' | 'gather' | 'validate' | 'rank' | 'write' | 'assemble' | 'done' | 'error';

export interface ReportState {
  id: string;
  input: { subject: string; template?: TemplateId; tlp: Tlp };
  phase: Phase;
  gatherIndex: number;
  pct: number;
  detail: string;
  subject?: ResolvedSubject;
  plan?: SourcePlan;
  sources: SourceResult[];
  conflicts: Conflict[];
  validatedMitre: string[];
  validatedActors: string[];
  // transient (not persisted as the final report):
  ranked?: RankedItem[];
  writerOutput?: WriteOutput;
  report?: Report;
  error?: string;
}

export interface PipelineDeps {
  env: Env;
  write: WriteDeps; // { ai, groqKey, runCompletion? }
  gather?: typeof gatherPhase; // injectable for tests
  now?: () => number;
}

export function initState(id: string, subject: string, template: TemplateId | undefined, tlp: Tlp): ReportState {
  return {
    id,
    input: { subject, template, tlp },
    phase: 'resolve',
    gatherIndex: 0,
    pct: 0,
    detail: 'queued',
    sources: [],
    conflicts: [],
    validatedMitre: [],
    validatedActors: [],
  };
}

const MITRE_RE = /\bT\d{4}(?:\.\d{3})?\b/g;

/** Advance ONE phase. Pure-ish (only side effect is the injected gather/model). Returns the next state. */
export async function advance(s: ReportState, deps: PipelineDeps): Promise<ReportState> {
  const gather = deps.gather ?? gatherPhase;
  const now = deps.now ?? Date.now;
  try {
    switch (s.phase) {
      case 'resolve': {
        const subject = resolveSubject(s.input.subject);
        const template = s.input.template ?? subject.suggestedTemplate;
        return {
          ...s,
          subject,
          input: { ...s.input, template },
          phase: 'plan',
          pct: 10,
          detail: `Resolved ${subject.type}`,
        };
      }
      case 'plan': {
        const plan = planSources({ template: s.input.template! }, { maxPhaseSubrequests: 40 });
        return {
          ...s,
          plan,
          phase: 'gather',
          gatherIndex: 0,
          pct: 20,
          detail: `Planned ${plan.phases.length} phase(s)`,
        };
      }
      case 'gather': {
        const ctx: GatherContext = { env: deps.env, subject: s.subject!, signal: AbortSignal.timeout(20000) };
        const results = await gather(s.plan!, s.gatherIndex, ctx);
        const sources = [...s.sources, ...results];
        const nextIdx = s.gatherIndex + 1;
        const more = nextIdx < s.plan!.phases.length;
        return {
          ...s,
          sources,
          gatherIndex: nextIdx,
          phase: more ? 'gather' : 'validate',
          pct: more ? 30 : 50,
          detail: `Gathered phase ${s.gatherIndex + 1}/${s.plan!.phases.length}`,
        };
      }
      case 'validate': {
        const text = s.sources.flatMap((r) => r.items.map((i) => i.text)).join(' ');
        const mitre = validateMitreIds([...new Set(text.match(MITRE_RE) ?? [])]).valid;
        const actors = validateActorNames([s.subject!.canonical]).valid;
        const claims = s.sources.flatMap((r) =>
          r.items.flatMap((i) => {
            const f = i.fields as Record<string, unknown> | undefined;
            const victim = typeof f?.victim === 'string' ? f.victim : null;
            const ransom = f?.negotiated_ransom ?? f?.initial_ransom;
            return victim && ransom != null
              ? [{ sourceId: r.id, claimKey: `ransom:${victim.toLowerCase()}`, value: String(ransom) }]
              : [];
          })
        );
        return {
          ...s,
          validatedMitre: mitre,
          validatedActors: actors,
          conflicts: detectContradictions(claims),
          phase: 'rank',
          pct: 60,
          detail: `Validated ${mitre.length} techniques`,
        };
      }
      case 'rank': {
        const ranked = rankEvidence(s.sources, { canonical: s.subject!.canonical }, now());
        return { ...s, ranked, phase: 'write', pct: 70, detail: `Ranked ${ranked.length} evidence items` };
      }
      case 'write': {
        const wout = await writeReport(
          {
            subject: s.subject!.canonical,
            template: s.input.template!,
            evidence: s.ranked ?? [],
            conflicts: s.conflicts,
            allowlist: {
              cves: s.subject!.identifiers.cve ? [s.subject!.identifiers.cve] : [],
              mitre: s.validatedMitre,
              actors: s.validatedActors,
            },
          },
          deps.write
        );
        return { ...s, writerOutput: wout, phase: 'assemble', pct: 90, detail: 'Drafted sections' };
      }
      case 'assemble': {
        const report = assembleReport({
          id: s.id,
          subject: s.subject!,
          template: s.input.template!,
          tlp: s.input.tlp,
          writer: s.writerOutput!,
          sources: s.sources,
          validatedMitre: s.validatedMitre,
          conflicts: s.conflicts,
          generatedAt: new Date(now()).toISOString(),
        });
        return { ...s, phase: 'done', pct: 100, detail: 'Done', report };
      }
      default:
        return s;
    }
  } catch (e) {
    return { ...s, phase: 'error', error: e instanceof Error ? e.message : String(e), detail: 'error' };
  }
}
