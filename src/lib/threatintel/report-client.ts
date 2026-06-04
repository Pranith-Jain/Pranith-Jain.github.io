import { adminAuthHeaders } from '../admin-token';

// Frontend mirror of the backend Report (api/src/lib/report/types.ts). Kept in
// sync by hand — the FE can't import server code.
export type Tlp = 'CLEAR' | 'GREEN' | 'AMBER' | 'RED';
export type Reliability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface Report {
  meta: {
    id: string;
    subject: string;
    subject_type: string;
    template: string;
    tlp: Tlp;
    status: string;
    phase: string;
    model_used?: string;
    generated_at: string;
  };
  cover: { title: string; subtitle: string; tlp: Tlp; subject_badges: string[]; generated_at: string };
  executive_summary: string;
  key_findings: { text: string; confidence: 'High' | 'Medium' | 'Low'; refs: number[] }[];
  sections: { id: string; heading: string; body_md: string; refs: number[] }[];
  appendices: {
    iocs: { type: string; value: string; verdict?: string; first_seen?: string; refs: number[] }[];
    mitre: { tactic: string; technique_id: string; technique_name: string; refs: number[] }[];
    cves: { id: string; cvss?: number; epss?: number; kev?: boolean; refs: number[] }[];
    sources: {
      ref: number;
      name: string;
      authority: Reliability;
      credibility: number;
      url?: string;
      fetched_at?: string;
    }[];
    conflicts: { claim: string; positions: string[]; note: string }[];
  };
  confidence: { level?: string; score?: number; admiralty?: { label?: string }; reasoning?: string };
}

export interface Progress {
  phase: string;
  pct: number;
  detail: string;
}

/** Kick a full-report build; returns the report id. */
export async function buildReport(subject: string, template: string | undefined, tlp: string): Promise<string> {
  const res = await fetch('/api/v1/report/build', {
    method: 'POST',
    headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ subject, template, tlp }),
  });
  if (!res.ok) throw new Error(`build failed: ${res.status}`);
  return ((await res.json()) as { report_id: string }).report_id;
}

/**
 * Poll the report until it is done. Calls `onProgress` on each tick.
 * (Polling rather than SSE because the route is admin-gated and EventSource
 * cannot send the admin auth header.)
 */
export async function pollReport(
  id: string,
  onProgress: (p: Progress) => void,
  opts: { intervalMs?: number; maxTries?: number } = {}
): Promise<Report> {
  const interval = opts.intervalMs ?? 1200;
  const maxTries = opts.maxTries ?? 150;
  for (let i = 0; i < maxTries; i++) {
    const res = await fetch(`/api/v1/report/${encodeURIComponent(id)}`, { headers: { ...adminAuthHeaders() } });
    if (!res.ok) throw new Error(`poll failed: ${res.status}`);
    const data = (await res.json()) as {
      phase?: string;
      pct?: number;
      detail?: string;
      status?: string;
      report?: Report | null;
    };
    const phase = data.phase ?? data.status ?? 'building';
    onProgress({ phase, pct: data.pct ?? (phase === 'done' ? 100 : 0), detail: data.detail ?? '' });
    if (phase === 'done') {
      if (data.report) return data.report;
      throw new Error('report finished without a body');
    }
    if (phase === 'error') throw new Error(data.detail || 'report build failed');
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('report timed out');
}
