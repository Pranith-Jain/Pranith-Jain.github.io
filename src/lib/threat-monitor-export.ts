/**
 * Threat Monitor — Export utilities.
 * Export detections as CSV or JSON files.
 */

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
  downloadFile(csv, 'tam-detections.csv', 'text/csv');
}

/** Export detections as JSON */
export function exportJson(detections: ExportDetection[]) {
  const json = JSON.stringify(detections, null, 2);
  downloadFile(json, 'tam-detections.json', 'application/json');
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
