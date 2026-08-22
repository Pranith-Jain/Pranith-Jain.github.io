/**
 * Network signal analytics — C2 beacon periodicity scoring and DNS
 * tunneling heuristics over pre-parsed connection/DNS telemetry.
 *
 * Inputs are JSON (timestamps, remote hosts, query labels), matching what
 * the browser-side PCAP/EVTX parsers already emit. Fleet-parity capability:
 * beacon-pattern identification and DNS-tunneling indicators without a
 * full IDS on the edge.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface BeaconInput {
  /** Connection timestamps (epoch ms or ISO strings) to one destination. */
  timestamps: Array<number | string>;
  /** Destination identifier (ip or host:port). */
  destination?: string;
  /** Optional per-connection byte counts for jitter weighting. */
  bytes?: number[];
}

export interface BeaconResult {
  destination: string;
  connections: number;
  intervalStats: { meanMs: number; stddevMs: number; jitterRatio: number; minMs: number; maxMs: number };
  /** 0-100; higher = more regular = more beacon-like. */
  beaconScore: number;
  verdict: 'regular' | 'moderately_regular' | 'irregular' | 'insufficient_data';
  suggestedInterval?: string;
  notes: string[];
}

export interface DnsTunnelInput {
  /** DNS query names (labels as seen on the wire, case preserved). */
  queries: string[];
  /** Server/zone the queries target (e.g. the authoritative NS domain). */
  zone?: string;
}

export interface DnsTunnelResult {
  zone: string;
  queriesAnalyzed: number;
  uniqueLabels: number;
  avgLabelLength: number;
  maxLabelLength: number;
  entropyAvg: number;
  /** 0-100; higher = more tunnel-like. */
  tunnelScore: number;
  verdict: 'likely_tunnel' | 'suspicious' | 'normal';
  indicators: string[];
  sampleLabels: string[];
}

// ── Beacon detection ───────────────────────────────────────────────────────

function toEpochMs(t: number | string): number | null {
  if (typeof t === 'number' && Number.isFinite(t)) return t > 1e12 ? t : t * 1000;
  if (typeof t === 'string') {
    const parsed = Date.parse(t);
    if (!Number.isNaN(parsed)) return parsed;
    const n = Number(t);
    if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
  }
  return null;
}

export function detectBeacon(input: BeaconInput): BeaconResult {
  const notes: string[] = [];
  const dest = input.destination ?? 'unknown';
  const times = (input.timestamps ?? [])
    .map(toEpochMs)
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);

  if (times.length < 4) {
    return {
      destination: dest,
      connections: times.length,
      intervalStats: { meanMs: 0, stddevMs: 0, jitterRatio: 0, minMs: 0, maxMs: 0 },
      beaconScore: 0,
      verdict: 'insufficient_data',
      notes: ['need at least 4 timestamps for periodicity analysis'],
    };
  }

  const intervals: number[] = [];
  for (let i = 1; i < times.length; i++) intervals.push(times[i]! - times[i - 1]!);

  const n = intervals.length;
  const mean = intervals.reduce((a, b) => a + b, 0) / n;
  const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  // Jitter ratio: coefficient of variation of inter-arrival deltas.
  const jitterRatio = mean > 0 ? std / mean : Infinity;

  // Byte-size consistency bonus (beacons usually carry near-constant payload).
  let sizeConsistency = 0;
  if (input.bytes && input.bytes.length === times.length && input.bytes.length >= 4) {
    const bm = input.bytes.reduce((a, b) => a + b, 0) / input.bytes.length;
    if (bm > 0) {
      const bsd = Math.sqrt(input.bytes.reduce((a, b) => a + (b - bm) ** 2, 0) / input.bytes.length);
      sizeConsistency = Math.max(0, 1 - bsd / bm); // 1 = identical sizes
      if (sizeConsistency > 0.8) notes.push(`payload sizes highly consistent (cv=${(bsd / bm).toFixed(2)})`);
    }
  }

  // Score: low jitter dominates; require non-trivial count.
  const countFactor = Math.min(1, times.length / 20);
  let score = Math.round(Math.max(0, 1 - jitterRatio) * 80 * countFactor + sizeConsistency * 20 * countFactor);
  score = Math.min(100, Math.max(0, score));

  const verdict: BeaconResult['verdict'] =
    times.length < 4 || !Number.isFinite(jitterRatio)
      ? 'insufficient_data'
      : jitterRatio <= 0.15
        ? 'regular'
        : jitterRatio <= 0.35
          ? 'moderately_regular'
          : 'irregular';

  if (verdict === 'regular') notes.push(`inter-arrival jitter ${(jitterRatio * 100).toFixed(1)}% — consistent with automated check-in`);
  if (mean >= 30_000 && mean <= 3_600_000 && verdict !== 'irregular') {
    notes.push('interval within common C2 beacon range (30s–1h)');
  }

  return {
    destination: dest,
    connections: times.length,
    intervalStats: {
      meanMs: Math.round(mean),
      stddevMs: Math.round(std),
      jitterRatio: Number.isFinite(jitterRatio) ? Number(jitterRatio.toFixed(3)) : 999,
      minMs: Math.min(...intervals),
      maxMs: Math.max(...intervals),
    },
    beaconScore: score,
    verdict,
    suggestedInterval:
      mean >= 1000 ? `${Math.round(mean / 1000)}s${mean % 60_000 === 0 && mean >= 60_000 ? ` (${Math.round(mean / 60000)}m)` : ''}` : `${Math.round(mean)}ms`,
    notes,
  };
}

// ── DNS tunneling ──────────────────────────────────────────────────────────

const ENTROPY_CACHE = new Map<string, number>();
/** Shannon entropy per character (bits), 0..~4 for base32/base64-ish labels. */
function shannon(s: string): number {
  const cached = ENTROPY_CACHE.get(s);
  if (cached !== undefined) return cached;
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of freq.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  if (ENTROPY_CACHE.size > 5000) ENTROPY_CACHE.clear();
  ENTROPY_CACHE.set(s, h);
  return h;
}

export function analyzeDnsTunnel(input: DnsTunnelInput): DnsTunnelResult {
  const indicators: string[] = [];
  const rawQueries = (input.queries ?? []).map((q) => q.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean);
  const zoneGuess = (input.zone ?? '').toLowerCase();
  const zone = zoneGuess || (() => {
    // derive the most common registered suffix from the queries
    const counts = new Map<string, number>();
    for (const q of rawQueries) {
      const parts = q.split('.');
      if (parts.length >= 2) {
        const z = parts.slice(-2).join('.');
        counts.set(z, (counts.get(z) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  })();

  // Keep only queries under the zone (or all when zone unknown).
  const inZone = zone ? rawQueries.filter((q) => q === zone || q.endsWith('.' + zone)) : rawQueries;

  // Extract the data label: leftmost label(s) minus the zone.
  const labels: string[] = [];
  for (const q of inZone) {
    const prefix = zone && q.endsWith('.' + zone) ? q.slice(0, -(zone.length + 1)) : q;
    if (prefix) labels.push(prefix.split('.')[0] ?? prefix);
  }

  const uniqueLabels = new Set(labels).size;
  const lengths = labels.map((l) => l.length);
  const avgLen = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const maxLen = lengths.length ? Math.max(...lengths) : 0;
  const entropies = labels.map(shannon);
  const entAvg = entropies.length ? entropies.reduce((a, b) => a + b, 0) / entropies.length : 0;

  let score = 0;
  if (labels.length >= 10) {
    // Long data labels (base32 chunks are typically 31-63 chars).
    if (avgLen >= 25) { score += 30; indicators.push(`avg label length ${avgLen.toFixed(0)} chars (>=25)`); }
    else if (avgLen >= 15) { score += 15; indicators.push(`avg label length ${avgLen.toFixed(0)} chars (15-24)`); }
    if (maxLen >= 50) { score += 10; indicators.push(`max label length ${maxLen} chars`); }
    // High entropy labels encode binary payloads.
    if (entAvg >= 3.8) { score += 25; indicators.push(`high label entropy ${entAvg.toFixed(2)} bits/char`); }
    else if (entAvg >= 3.2) { score += 12; indicators.push(`elevated label entropy ${entAvg.toFixed(2)} bits/char`); }
    // Unique-per-query labels = session data, not caching resolver traffic.
    const uniqueness = labels.length ? uniqueLabels / labels.length : 0;
    if (uniqueness >= 0.9 && labels.length >= 15) { score += 25; indicators.push(`${uniqueLabels}/${labels.length} unique subdomain labels (session-like)`); }
    else if (uniqueness >= 0.7 && labels.length >= 15) { score += 10; indicators.push(`${uniqueLabels}/${labels.length} unique labels`); }
    // TXT-heavy zones are the classic exfil channel hint (proxy: we infer volume).
    if (inZone.length >= 50) { score += 10; indicators.push(`${inZone.length} queries to one zone`); }
    // All three primary signals together is the classic tunnel fingerprint —
    // individually they can each occur benignly (CDNs have unique-ish labels),
    // jointly they almost never do.
    const longLabels = avgLen >= 15;
    const highEntropy = entAvg >= 3.2;
    const sessionLike = labels.length >= 15 && labels.length ? uniqueLabels / labels.length >= 0.7 : false;
    if (longLabels && highEntropy && sessionLike) {
      score += 20;
      indicators.push('length + entropy + uniqueness all elevated (tunnel fingerprint)');
    }
  } else {
    indicators.push('fewer than 10 in-zone queries — insufficient volume for tunnel inference');
  }

  score = Math.min(100, score);
  const verdict: DnsTunnelResult['verdict'] = score >= 70 ? 'likely_tunnel' : score >= 40 ? 'suspicious' : 'normal';

  return {
    zone: zone || '(unknown)',
    queriesAnalyzed: inZone.length,
    uniqueLabels,
    avgLabelLength: Number(avgLen.toFixed(1)),
    maxLabelLength: maxLen,
    entropyAvg: Number(entAvg.toFixed(2)),
    tunnelScore: score,
    verdict,
    indicators,
    sampleLabels: [...new Set(labels)].slice(0, 5),
  };
}
