# Report Engine — Copilot Frontend + PDF (Plan E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Add a "Full report" mode inside the Copilot page that kicks the `ReportBuilderDO` job, streams progress, renders the structured `Report`, and exports a print-quality PDF — keeping the existing quick Q&A unchanged.

**Architecture:** A typed report client (`buildReport`/`getReport`, **polls** `GET /:id` for progress since `EventSource` can't send the admin auth header), a presentational `ReportView` component, a `report-pdf` helper (jspdf + jspdf-autotable, mirroring `src/pages/threatintel/RansomReport.tsx`), and additions to `Copilot.tsx` for the mode toggle + pickers + progress stepper.

**Tech Stack:** React 18, Vite, TypeScript, Vitest + Testing Library (root config, jsdom), `jspdf`/`jspdf-autotable` (already deps), `adminAuthHeaders` (`src/lib/admin-token`).

**Spec:** §7. **Depends on:** Plan D endpoints.

**Run tests:** `npx vitest run src/...` (root config, sandbox not required).

---

## File structure

| File                                                                                        | Responsibility                                              |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/lib/threatintel/report-client.ts`                                                      | `Report` FE type + `buildReport`, `pollReport`.             |
| `src/lib/threatintel/report-pdf.ts`                                                         | `exportReportPdf(report)`.                                  |
| `src/components/threatintel/ReportView.tsx`                                                 | Presentational render of a `Report`.                        |
| `src/pages/threatintel/Copilot.tsx`                                                         | Add mode toggle + pickers + progress + ReportView (modify). |
| `src/components/__tests__/ReportView.test.tsx`, `src/lib/threatintel/report-client.test.ts` | Tests.                                                      |

---

## Task 1: Report client

**Files:** Create `src/lib/threatintel/report-client.ts`; Test `src/lib/threatintel/report-client.test.ts`.

- [ ] **Step 1: Failing test** — `buildReport('LockBit','ransomware-group','AMBER')` POSTs to `/api/v1/report/build` with admin headers and the JSON body, returns `report_id`; `pollReport(id, onProgress)` GETs `/api/v1/report/:id`, calls `onProgress` with `{phase,pct,detail}`, and resolves with the `Report` when status `done`. Mock `global.fetch`.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.** Define a FE `Report` type mirroring the backend `Report` (copy the shape from `api/src/lib/report/types.ts` — FE can't import server code). Then:

```ts
import { adminAuthHeaders } from '../admin-token';
// export interface Report { ... }  // mirror api types.ts Report

export async function buildReport(subject: string, template: string | undefined, tlp: string): Promise<string> {
  const res = await fetch('/api/v1/report/build', {
    method: 'POST',
    headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ subject, template, tlp }),
  });
  if (!res.ok) throw new Error(`build failed: ${res.status}`);
  return ((await res.json()) as { report_id: string }).report_id;
}

export async function pollReport(
  id: string,
  onProgress: (p: { phase: string; pct: number; detail: string }) => void,
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
    if (phase === 'done') return (data.report ?? (data as unknown as { report: Report }).report)!;
    if (phase === 'error') throw new Error(data.detail || 'report build failed');
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('report timed out');
}
```

> The live DO `/state` returns the `ReportState` (has `report` only when done); the D1 fallback returns `{status, report}`. The poller handles both shapes.

- [ ] **Step 4: Run → PASS. Step 5: Commit** `git commit -m "feat(report): frontend report client (build + poll)"`.

---

## Task 2: PDF export

**Files:** Create `src/lib/threatintel/report-pdf.ts`; (test optional — a smoke test that it runs without throwing on a sample report).

- [ ] Mirror the jsPDF usage in `src/pages/threatintel/RansomReport.tsx` (`new jsPDF({ unit: 'pt', format: 'a4' })`, `autoTable(doc, {...})`). Implement `exportReportPdf(report: Report): void` that renders: a cover page (title, TLP banner colored by level, subject badges, generated_at), the executive summary, each section (heading + body text, word-wrapped via `doc.splitTextToSize`), then appendix tables via `autoTable` for IOCs, MITRE matrix, CVEs, and sources (with Admiralty grade column). Footer on every page: `TLP:<level>` + page number. `doc.save(\`report-${slug(report.meta.subject)}.pdf\`)`.
- [ ] **Step: Smoke test** `src/lib/threatintel/report-pdf.test.ts` — build a minimal `Report`, call `exportReportPdf` with `jsPDF.save` mocked, assert no throw and that `autoTable`/`save` were called. **Commit** `git commit -m "feat(report): print-quality PDF export"`.

---

## Task 3: `ReportView` component

**Files:** Create `src/components/threatintel/ReportView.tsx`; Test `src/components/__tests__/ReportView.test.tsx`.

- [ ] **Step 1: Failing render test** — render `<ReportView report={sample} onExportPdf={fn} />` with a hand-built sample `Report`; assert the cover title, the TLP badge text, each section heading, the IOC/MITRE/sources appendix headings, and a clickable citation marker `[1]` are present; assert clicking "Export PDF" calls `onExportPdf`.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.** Presentational only (no fetching). Render: cover with a TLP banner (color map CLEAR=slate, GREEN=emerald, AMBER=amber, RED=rose); confidence panel (Admiralty label from `report.confidence`); executive summary; key findings (confidence chips); sections (render `body_md` through the page's existing sanitize path — reuse `renderMarkdown` + DOMPurify pattern already in `Copilot.tsx`, or render as preformatted text if simpler — citations `[n]` become anchor links to the sources appendix); appendix tables for IOCs, MITRE (tactic/technique/name), CVEs (id/cvss/epss/kev), and **sources with per-source Admiralty badges**; conflicts callout if any. Export buttons (PDF + .md) call props.

- [ ] **Step 4: Run → PASS. Step 5: Commit** `git commit -m "feat(report): ReportView renderer with appendices + citations"`.

---

## Task 4: Wire into Copilot page

**Files:** Modify `src/pages/threatintel/Copilot.tsx`.

Current state: `Copilot()` has `query/loading/error/result/...` and posts to `/api/v1/copilot/investigate`, renders markdown via DOMPurify. Add a **mode** without disturbing quick mode.

- [ ] **Step 1:** Add `const [mode, setMode] = useState<'quick'|'report'>('quick')` and a small segmented toggle near the search input.
- [ ] **Step 2:** When `mode==='report'`, show a template `<select>` (auto / the 4 templates) and a TLP `<select>` (default AMBER) next to the input. Add report state: `const [reportId,setReportId]=useState<string|null>(null); const [progress,setProgress]=useState<{phase:string;pct:number;detail:string}|null>(null); const [report,setReport]=useState<Report|null>(null);`.
- [ ] **Step 3:** A `runReport()` handler: `setProgress({phase:'queued',pct:0,detail:''}); const id=await buildReport(query,template==='auto'?undefined:template,tlp); setReportId(id); const r=await pollReport(id,setProgress); setReport(r);` with try/catch → `setError`. On submit, branch on `mode` (quick → existing flow; report → `runReport()`).
- [ ] **Step 4:** Render: when `mode==='report'` and `progress && !report`, show a **phase stepper** (resolve→plan→gather→validate→rank→write→assemble→done) with `progress.pct` bar + `progress.detail`. When `report`, render `<ReportView report={report} onExportPdf={()=>exportReportPdf(report)} onExportMd={...}/>`.
- [ ] **Step 5: Verify** `npx tsc --noEmit` (root) clean; existing Copilot quick-mode tests still pass (`npx vitest run src/components/__tests__/DfirRoutes.test.tsx`).
- [ ] **Step 6: Commit** `git commit -m "feat(report): full-report mode in the Copilot page"`.

---

## Final verification

```
npx tsc --noEmit
npx vitest run src/components/__tests__/ReportView.test.tsx src/lib/threatintel/report-client.test.ts src/components/__tests__/DfirRoutes.test.tsx
npx eslint src/components/threatintel/ReportView.tsx src/lib/threatintel/report-client.ts src/lib/threatintel/report-pdf.ts src/pages/threatintel/Copilot.tsx --ext ts,tsx
```

All pass / clean. Then a manual smoke (optional): run the app, switch to report mode, generate a Ransomware Group report for "LockBit", confirm the stepper advances and the PDF exports.

## Done

This completes the professional report generator: quick Copilot + full DO-backed report, grounded/validated/ranked evidence, multi-pass writing, structured + TLP-marked report, PDF export — all inside the Copilot page.
