import type { InvestigationLogEntry } from './types';

/** Append a structured log entry to the investigation state. */
export function logEntry(state: { log?: InvestigationLogEntry[] }, entry: Omit<InvestigationLogEntry, 'ts'>): void {
  if (!state.log) state.log = [];
  state.log.push({ ts: new Date().toISOString(), ...entry });
}
