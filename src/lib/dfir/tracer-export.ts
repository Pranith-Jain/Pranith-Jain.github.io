import { serializeGraph, type TracerGraph } from './tracer-graph';

export function toJSON(graph: TracerGraph): string {
  return JSON.stringify(serializeGraph(graph), null, 2);
}

function csvCell(v: string): string {
  // Neutralize spreadsheet formula injection: a cell beginning with =,+,-,@,tab
  // or CR can be executed as a formula by Excel/Sheets. Prefix with a single
  // quote so it is treated as text. Apply before CSV quoting.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One row per edge — a flow table for spreadsheets / legal hand-off. */
export function toCSV(graph: TracerGraph): string {
  const header = ['from', 'to', 'amount', 'token', 'tx_hash', 'direction', 'confidence', 'timestamp'];
  const rows = [...graph.edges.values()].map((e) =>
    [e.source, e.target, e.amount, e.token, e.tx_hash, e.direction, e.confidence, e.timestamp ?? '']
      .map((c) => csvCell(String(c)))
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}
