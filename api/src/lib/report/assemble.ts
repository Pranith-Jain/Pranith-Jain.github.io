import type { Conflict } from './validator';
import type { WriteOutput } from './writer';
import type { Report, ResolvedSubject, SourceResult, TemplateId, Tlp } from './types';
import { REPORT_TEMPLATES } from './templates';
import { computeConfidence, type InfoCredibility } from '../confidence';

export interface AssembleInput {
  id: string;
  subject: ResolvedSubject;
  template: TemplateId;
  tlp: Tlp;
  writer: WriteOutput;
  sources: SourceResult[];
  validatedMitre: string[];
  conflicts: Conflict[];
  generatedAt: string;
  modelUsed?: string;
}

type FindingType = Parameters<typeof computeConfidence>[0]['findingType'];
const FINDING_TYPE: Record<TemplateId, FindingType> = {
  'ransomware-group': 'ransomware_claim',
  'threat-actor': 'attribution',
  cve: 'vulnerability',
  ioc: 'ioc',
};

function firstSentence(md: string): string {
  const text = md
    .replace(/\[(High|Medium|Low)\]/gi, '') // confidence tag is shown as a separate chip
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // stray headings
    .replace(/[#*_`>[\]]/g, '')
    .replace(/^\s*[-•]\s*/, '') // leading bullet marker
    .trim();
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim().slice(0, 240);
}

function parseConfidence(md: string): 'High' | 'Medium' | 'Low' {
  if (/\[High\]/i.test(md)) return 'High';
  if (/\[Low\]/i.test(md)) return 'Low';
  return 'Medium';
}

const MAX_APPENDIX = 100;

/** Compose the engine outputs into a persisted, structured Report. */
export function assembleReport(input: AssembleInput): Report {
  const { subject, template, tlp, writer, sources, validatedMitre, conflicts, generatedAt, id } = input;
  const tmpl = REPORT_TEMPLATES[template];

  // sourceId -> catalog authority grade (from the gathered results)
  const authorityById = new Map(sources.map((s) => [s.id, s.authority]));

  // Sources appendix: one row per distinct cited source, keep its first ref.
  const seen = new Set<string>();
  const sourcesAppendix: Report['appendices']['sources'] = [];
  for (const c of writer.citations) {
    if (seen.has(c.sourceId)) continue;
    seen.add(c.sourceId);
    const authority = authorityById.get(c.sourceId) ?? 'F';
    const credibility: InfoCredibility = authority <= 'B' ? 2 : authority <= 'D' ? 3 : 4;
    sourcesAppendix.push({ ref: c.ref, name: c.sourceId, authority, credibility });
  }

  // MITRE appendix: validated ids enriched with names/tactics from gathered mitre items.
  const mitreMeta = new Map<string, { name: string; tactic: string }>();
  for (const s of sources)
    for (const it of s.items) {
      const f = it.fields as Record<string, unknown> | undefined;
      if (f?.kind === 'mitre' && typeof f.id === 'string')
        mitreMeta.set(String(f.id).toUpperCase(), { name: String(f.name ?? ''), tactic: String(f.tactic ?? '') });
    }
  const mitre = validatedMitre.map((tid) => ({
    tactic: mitreMeta.get(tid)?.tactic ?? '',
    technique_id: tid,
    technique_name: mitreMeta.get(tid)?.name ?? '',
    refs: [] as number[],
  }));

  // CVE appendix (deduped by id).
  const cveMap = new Map<string, Report['appendices']['cves'][number]>();
  for (const s of sources)
    for (const it of s.items) {
      const f = it.fields as Record<string, unknown> | undefined;
      if (!f) continue;
      if (f.kind === 'cve' && typeof f.cve === 'string') {
        if (!cveMap.has(f.cve)) cveMap.set(f.cve, { id: f.cve, refs: [] });
      } else if ((typeof f.cvss === 'number' || typeof f.kev === 'boolean') && subject.identifiers.cve) {
        cveMap.set(subject.identifiers.cve, {
          id: subject.identifiers.cve,
          cvss: typeof f.cvss === 'number' ? f.cvss : undefined,
          epss: typeof f.epss === 'number' ? f.epss : undefined,
          kev: typeof f.kev === 'boolean' ? f.kev : undefined,
          refs: [],
        });
      }
    }

  // IOC appendix (deduped by value) from live-iocs / ioc-correlation.
  const iocMap = new Map<string, Report['appendices']['iocs'][number]>();
  for (const s of sources) {
    if (s.id !== 'live-iocs' && s.id !== 'ioc-correlation') continue;
    for (const it of s.items) {
      const f = it.fields as Record<string, unknown> | undefined;
      const value = typeof f?.value === 'string' ? f.value : null;
      if (value && !iocMap.has(value))
        iocMap.set(value, { type: typeof f?.kind === 'string' ? f.kind : 'unknown', value, refs: [] });
    }
  }

  const key_findings = writer.sections.slice(0, 5).map((sec) => ({
    text: firstSentence(sec.body_md),
    confidence: parseConfidence(sec.body_md),
    refs: sec.refs,
  }));

  const citedSourceIds = [...new Set(writer.citations.map((c) => c.sourceId))];
  const confidence = computeConfidence({
    sourceIds: citedSourceIds,
    contradictorySourceIds: [],
    findingType: FINDING_TYPE[template],
  });

  return {
    meta: {
      id,
      subject: subject.canonical,
      subject_type: subject.type,
      template,
      tlp,
      status: 'done',
      phase: 'done',
      model_used: input.modelUsed ?? writer.modelUsed,
      generated_at: generatedAt,
    },
    cover: {
      title: tmpl.title(subject.canonical),
      subtitle: `${subject.type.toUpperCase()} intelligence report`,
      tlp,
      subject_badges: [...new Set([subject.type, template])],
      generated_at: generatedAt,
    },
    executive_summary: writer.executive_summary,
    key_findings,
    sections: writer.sections,
    appendices: {
      iocs: [...iocMap.values()].slice(0, MAX_APPENDIX),
      mitre,
      cves: [...cveMap.values()].slice(0, MAX_APPENDIX),
      sources: sourcesAppendix,
      conflicts,
    },
    confidence,
  };
}
