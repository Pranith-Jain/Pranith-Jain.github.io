/**
 * Threat Monitor — Export utilities.
 * Export detections as CSV or JSON files.
 */

import { downloadText } from './download';

interface ExportDetection {
  id: string;
  source: string;
  title: string;
  url: string;
  published: string;
  apt_groups: string[];
  techniques: { id: string; name: string; tactic: string; kill_chain: string }[];
  kill_chain_stages: string[];
  confidence: number;
  created_at: string;
}

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/** Export detections as CSV */
export function exportCsv(detections: ExportDetection[]) {
  const headers = ['Date', 'Source', 'Title', 'URL', 'APT Groups', 'Techniques', 'Kill Chain', 'Confidence'];
  const rows = detections.map((d) => [
    escapeCsv(d.created_at),
    escapeCsv(d.source),
    escapeCsv(d.title),
    d.url,
    escapeCsv(d.apt_groups.join('; ')),
    escapeCsv(d.techniques.map((t) => `${t.id} ${t.name}`).join('; ')),
    escapeCsv(d.kill_chain_stages.join('; ')),
    (d.confidence * 100).toFixed(0) + '%',
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadText(csv, 'tam-detections.csv', 'text/csv');
}

/** Export detections as JSON */
export function exportJson(detections: ExportDetection[]) {
  const json = JSON.stringify(detections, null, 2);
  downloadText(json, 'tam-detections.json', 'application/json');
}
