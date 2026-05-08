const KEY = 'dfir_history_v1';
const CAP = 20;

export interface HistoryEntry {
  id: string;
  tool: 'ioc' | 'domain' | 'phishing' | 'exposure' | 'file' | 'cve' | 'technique';
  indicator: string;
  verdict: string;
  score: number;
  timestamp: string;
}

export function recordHistory(input: Omit<HistoryEntry, 'id' | 'timestamp'>): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  const entry: HistoryEntry = {
    ...input,
    id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
    timestamp: new Date().toISOString(),
  };
  const existing = readHistory();
  const next = [entry, ...existing].slice(0, CAP);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota exceeded etc. */
  }
}

export function readHistory(): HistoryEntry[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* */
  }
}
