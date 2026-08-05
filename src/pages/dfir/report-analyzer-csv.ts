import { downloadBlob } from '../../lib/dfir/report-analyzer/export-pdf';
import type { ExtractedIoc, AnalyzerOutput } from './report-analyzer-types';

// ── CSV helpers (pure, no deps) ────────────────────────────────────

export function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename);
}

export function exportIocsCsv(iocs: ExtractedIoc[]): string {
  const header = 'kind,value,confidence,confidence_band,evidence,source';
  const rows = iocs.map((i) =>
    [i.kind, i.value, String(Math.round(i.confidence * 100)), i.confidence_band, csvEscape(i.evidence), i.source].join(
      ','
    )
  );
  return [header, ...rows].join('\n');
}

export function exportDetectionCsv(detection: AnalyzerOutput['detection']): string {
  if (!detection) return '';
  const sections: string[] = [];

  if (detection.siemRules.length) {
    sections.push('--- SIEM Rules ---');
    sections.push('title,severity,mitre_id,platform,description,query');
    for (const r of detection.siemRules) {
      sections.push(
        [
          csvEscape(r.title),
          r.severity,
          r.mitreId ?? '',
          r.platform ?? '',
          csvEscape(r.description),
          csvEscape(r.query ?? ''),
        ].join(',')
      );
    }
  }

  if (detection.cliCommands.length) {
    sections.push('');
    sections.push('--- CLI Commands ---');
    sections.push('purpose,command,platform');
    for (const c of detection.cliCommands) {
      sections.push([csvEscape(c.purpose), csvEscape(c.command), c.platform ?? ''].join(','));
    }
  }

  if (detection.monitoringGuidance.length) {
    sections.push('');
    sections.push('--- Monitoring Guidance ---');
    sections.push('category,items');
    for (const g of detection.monitoringGuidance) {
      sections.push([csvEscape(g.category), csvEscape(g.items.join('; '))].join(','));
    }
  }

  if (detection.detectionLimitations.length) {
    sections.push('');
    sections.push('--- Detection Limitations ---');
    sections.push('limitation');
    for (const lim of detection.detectionLimitations) {
      sections.push(csvEscape(lim));
    }
  }

  return sections.join('\n');
}

