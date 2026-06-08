/**
 * Behavioral Analytics & Anomaly Detection
 *
 * Statistical anomaly detection on IOC feeds — frequency analysis,
 * time-series anomalies, baseline deviation, and peer group analysis.
 * All pure computation, no paid services.
 */

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

export interface AnomalyResult {
  metric: string;
  timestamp: string;
  value: number;
  expected: number;
  deviation: number;
  zscore: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface BaselineProfile {
  metric: string;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  sampleCount: number;
  periodStart: string;
  periodEnd: string;
}

export interface FrequencyAnomaly {
  entity: string;
  entityType: string;
  currentCount: number;
  baselineMean: number;
  baselineStdDev: number;
  zscore: number;
  isAnomaly: boolean;
  direction: 'spike' | 'drop';
}

/** Calculate basic statistics for a numeric array */
export function calculateStats(values: number[]): { mean: number; stdDev: number; min: number; max: number; p50: number; p95: number; p99: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  return {
    mean, stdDev, min: sorted[0], max: sorted[n - 1],
    p50: sorted[Math.floor(n * 0.5)],
    p95: sorted[Math.floor(n * 0.95)],
    p99: sorted[Math.floor(n * 0.99)],
  };
}

/** Z-score based anomaly detection */
export function detectZScoreAnomalies(
  points: TimeSeriesPoint[],
  metric: string,
  threshold = 2.5
): AnomalyResult[] {
  const values = points.map((p) => p.value);
  const stats = calculateStats(values);
  if (stats.stdDev === 0) return [];

  const anomalies: AnomalyResult[] = [];
  for (const point of points) {
    const zscore = Math.abs((point.value - stats.mean) / stats.stdDev);
    if (zscore > threshold) {
      const deviation = ((point.value - stats.mean) / stats.mean) * 100;
      anomalies.push({
        metric,
        timestamp: point.timestamp,
        value: point.value,
        expected: Math.round(stats.mean),
        deviation: Math.round(deviation),
        zscore: Math.round(zscore * 100) / 100,
        severity: zscore > 4 ? 'critical' : zscore > 3.5 ? 'high' : zscore > 3 ? 'medium' : 'low',
        description: `${metric} ${point.value > stats.mean ? 'spike' : 'drop'}: ${Math.round(deviation)}% ${point.value > stats.mean ? 'above' : 'below'} baseline (${stats.mean.toFixed(1)} ± ${stats.stdDev.toFixed(1)})`,
      });
    }
  }
  return anomalies;
}

/** Build a baseline profile from historical data */
export function buildBaseline(points: TimeSeriesPoint[], metric: string): BaselineProfile {
  const values = points.map((p) => p.value);
  const stats = calculateStats(values);
  return {
    metric, ...stats, sampleCount: values.length,
    periodStart: points[0]?.timestamp ?? '',
    periodEnd: points[points.length - 1]?.timestamp ?? '',
  };
}

/** Moving average anomaly detection — catches gradual shifts */
export function detectMovingAverageAnomalies(
  points: TimeSeriesPoint[],
  metric: string,
  windowSize = 7,
  threshold = 2
): AnomalyResult[] {
  if (points.length < windowSize * 2) return [];
  const anomalies: AnomalyResult[] = [];

  for (let i = windowSize; i < points.length; i++) {
    const window = points.slice(i - windowSize, i);
    const windowValues = window.map((p) => p.value);
    const stats = calculateStats(windowValues);
    if (stats.stdDev === 0) continue;

    const zscore = Math.abs((points[i].value - stats.mean) / stats.stdDev);
    if (zscore > threshold) {
      anomalies.push({
        metric, timestamp: points[i].timestamp, value: points[i].value,
        expected: Math.round(stats.mean), deviation: Math.round(((points[i].value - stats.mean) / stats.mean) * 100),
        zscore: Math.round(zscore * 100) / 100,
        severity: zscore > 4 ? 'critical' : zscore > 3 ? 'high' : 'medium',
        description: `Moving average anomaly: ${metric} at ${points[i].value} vs expected ${stats.mean.toFixed(1)}`,
      });
    }
  }
  return anomalies;
}

/** Frequency analysis — detect unusual counts per entity */
export function detectFrequencyAnomalies(
  currentCounts: Map<string, number>,
  historicalCounts: Map<string, number[]>,
  threshold = 2.5
): FrequencyAnomaly[] {
  const anomalies: FrequencyAnomaly[] = [];

  for (const [entity, currentCount] of currentCounts) {
    const history = historicalCounts.get(entity) ?? [];
    if (history.length < 3) continue;

    const stats = calculateStats(history);
    if (stats.stdDev === 0) continue;

    const zscore = (currentCount - stats.mean) / stats.stdDev;
    if (Math.abs(zscore) > threshold) {
      anomalies.push({
        entity, entityType: 'ioc', currentCount,
        baselineMean: Math.round(stats.mean), baselineStdDev: Math.round(stats.stdDev),
        zscore: Math.round(zscore * 100) / 100,
        isAnomaly: true, direction: zscore > 0 ? 'spike' : 'drop',
      });
    }
  }
  return anomalies;
}

/** Entropy analysis — detect DGA domains, encoded strings */
export function calculateShannonEntropy(str: string): number {
  const freq: Record<string, number> = {};
  for (const char of str) freq[char] = (freq[char] || 0) + 1;
  const len = str.length;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return Math.round(entropy * 1000) / 1000;
}

/** Detect high-entropy strings (potential DGA, encoded data, C2) */
export function detectHighEntropyStrings(
  strings: string[],
  threshold = 3.5,
  minLength = 8
): Array<{ value: string; entropy: number; suspicious: boolean }> {
  return strings
    .filter((s) => s.length >= minLength)
    .map((s) => ({ value: s, entropy: calculateShannonEntropy(s), suspicious: calculateShannonEntropy(s) > threshold }))
    .filter((r) => r.suspicious);
}

/** Time-of-day pattern analysis — detect off-hours activity */
export function detectOffHoursActivity(
  events: Array<{ timestamp: string; count: number }>,
  businessHoursStart = 8,
  businessHoursEnd = 18
): Array<{ hour: number; avgCount: number; isOffHours: boolean; anomalyScore: number }> {
  const hourlyBuckets: number[][] = Array.from({ length: 24 }, () => []);
  for (const event of events) {
    const hour = new Date(event.timestamp).getHours();
    hourlyBuckets[hour].push(event.count);
  }

  return hourlyBuckets.map((bucket, hour) => {
    const avgCount = bucket.length > 0 ? bucket.reduce((a, b) => a + b, 0) / bucket.length : 0;
    const isOffHours = hour < businessHoursStart || hour >= businessHoursEnd;
    const overallAvg = events.reduce((sum, e) => sum + e.count, 0) / Math.max(events.length, 1);
    const anomalyScore = overallAvg > 0 ? Math.abs(avgCount - overallAvg) / overallAvg : 0;
    return { hour, avgCount: Math.round(avgCount), isOffHours, anomalyScore: Math.round(anomalyScore * 100) / 100 };
  });
}
