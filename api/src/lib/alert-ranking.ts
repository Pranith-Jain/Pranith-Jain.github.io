/**
 * Alert ranking — scores alerts on intent / capability / opportunity axes
 * to produce a composite rank that determines display order.
 *
 * Mirrors Exvora's approach: every alert is scored on three independent
 * dimensions, then merged into a single "attention score" for sorting.
 *
 * Intent      — did the source indicate deliberate targeting?
 * Capability  — how sophisticated is the threat?
 * Opportunity — how exposed/relevant is the estate?
 */

// ── Scoring types ──────────────────────────────────────────────────────

export interface AlertScore {
  /** 0–1: deliberate targeting signal. */
  intent: number;
  /** 0–1: threat sophistication. */
  capability: number;
  /** 0–1: estate exposure match. */
  opportunity: number;
  /** Composite: weighted sum (intent * 0.4 + capability * 0.3 + opportunity * 0.3). */
  composite: number;
  /** Terse label for each axis. */
  labels: {
    intent: 'targeted' | 'sector-wide' | 'opportunistic' | 'unknown';
    capability: 'apt' | 'sophisticated' | 'commodity' | 'unknown';
    opportunity: 'direct-hit' | 'adjacent' | 'perimeter' | 'minimal';
  };
}

export interface AlertForScoring {
  alert_type: string;
  title: string;
  description: string;
  severity: string;
  source: string;
  confidence: number;
  topics: string[];
  matched_assets: string[];
  matched_sector: number;
  ssvc_json?: string;
  /** Optional estate sector to compute opportunity. */
  estateSector?: string;
  /** Optional estate critical assets to compute opportunity depth. */
  estateCriticalAssets?: string[];
}

// ── Heuristic patterns — kept as sets for O(1) lookups ────────────────

const INTENT_KEYWORDS = new Set([
  'ransomware', 'targeted', 'apt', 'campaign', 'actor', 'threat group',
  'cisa', 'kev', 'active exploitation', 'in-the-wild', 'zero-day',
  'supply chain', 'watering hole', 'spearphishing', 'credential theft',
  'data exfiltration', 'lateral movement',
]);

const CAPABILITY_APT_PATTERNS = [
  /\b(apt\d+|lazarus|kimsuksy|scattered.?spider|cozy.?bear|fancy.?bear|sandworm|turla|fin\d+|dark.?halo|mustang.?panda)\b/i,
  /\b(nation.?state|state.?sponsored|foreign.?intelligence)\b/i,
];

const CAPABILITY_SOPHISTICATED = [
  /\b(lockbit|blackcat|alphv|clop|rhysida|play|akira|black.?basta|royal|biance)\b/i,
  /\b(advanced|polymorphic|fileless|zero.?click|wormable)\b/i,
];

const ESTATE_CRITICAL_TAG = /\b(critical|high)\b/i;
const SECTOR_MATCH_TERMS: Record<string, RegExp> = {
  'financial-services': /\b(financial|bank|swift|payment|fintech|credit)\b/i,
  healthcare: /\b(healthcare|hospital|medical|pharma|patient|hipaa)\b/i,
  government: /\b(government|federal|state|agency|defense|military)\b/i,
  technology: /\b(technology|software|saas|cloud|hosting)\b/i,
  energy: /\b(energy|oil|gas|grid|utility|pipeline)\b/i,
  education: /\b(education|university|college|school)\b/i,
};

// ── Main ranking function ──────────────────────────────────────────────

export function rankAlert(alert: AlertForScoring): AlertScore {
  const intent = scoreIntent(alert);
  const capability = scoreCapability(alert);
  const opportunity = scoreOpportunity(alert);

  const composite = intent * 0.4 + capability * 0.3 + opportunity * 0.3;

  return { intent, capability, opportunity, composite, labels: { intent: intentLabel(intent), capability: capLabel(capability), opportunity: oppLabel(opportunity) } };
}

/**
 * Score intent (0–1): does the alert indicate deliberate targeting?
 */
function scoreIntent(alert: AlertForScoring): number {
  let score = 0.1; // baseline — always some intent signal

  // Title + description keyword boost
  const text = `${alert.title} ${alert.description}`.toLowerCase();
  for (const kw of INTENT_KEYWORDS) {
    if (text.includes(kw)) {
      score += 0.15;
      break;
    }
  }

  // Source weighting
  const src = alert.source.toLowerCase();
  if (src.includes('cisa') || src.includes('kev') || src.includes('ransomware')) score += 0.25;
  else if (src.includes('threat') || src.includes('intel') || src.includes('feed')) score += 0.1;

  // SSVC-V act = high intent
  if (alert.ssvc_json) {
    try {
      const ssvc = JSON.parse(alert.ssvc_json) as { decision?: string };
      if (ssvc.decision === 'act') score += 0.3;
      else if (ssvc.decision === 'prioritise') score += 0.2;
    } catch { /* ignore */ }
  }

  // Severity boost
  if (alert.severity === 'critical') score += 0.2;
  else if (alert.severity === 'high') score += 0.1;

  // Topic keywords boost
  for (const topic of alert.topics) {
    const t = String(topic).toLowerCase();
    if (t.includes('campaign') || t.includes('targeted') || t.includes('apt')) {
      score += 0.15;
      break;
    }
  }

  return Math.min(score, 1.0);
}

/**
 * Score capability (0–1): how sophisticated is the threat?
 */
function scoreCapability(alert: AlertForScoring): number {
  let score = 0.1;

  const text = `${alert.title} ${alert.description} ${alert.source}`;

  for (const p of CAPABILITY_APT_PATTERNS) {
    if (p.test(text)) {
      score = 0.9;
      break;
    }
  }

  if (score < 0.9) {
    for (const p of CAPABILITY_SOPHISTICATED) {
      if (p.test(text)) {
        score = 0.6;
        break;
      }
    }
  }

  // Generic malware/crimeware
  if (score < 0.6) {
    if (
      /\b(malware|botnet|stealer|infostealer|rat|trojan|phishing|scam|fraud)\b/i.test(text) ||
      alert.alert_type === 'phishing'
    ) {
      score = 0.4;
    }
  }

  // Confidence multiplier
  if (alert.confidence >= 80) score *= 1.1;
  else if (alert.confidence >= 50) score *= 1.0;
  else score *= 0.8;

  return Math.min(score, 1.0);
}

/**
 * Score opportunity (0–1): how exposed/relevant is the estate?
 */
function scoreOpportunity(alert: AlertForScoring): number {
  let score = 0.05;

  // Sector match
  if (alert.matched_sector && alert.estateSector) {
    const sectorPattern = SECTOR_MATCH_TERMS[alert.estateSector];
    if (sectorPattern) {
      const text = `${alert.title} ${alert.description}`;
      if (sectorPattern.test(text)) score += 0.35;
    }
  }

  // Critical asset match
  if (alert.matched_assets.length > 0) {
    score += 0.1; // any asset match
    for (const asset of alert.matched_assets) {
      if (ESTATE_CRITICAL_TAG.test(asset)) {
        score += 0.25;
        break;
      }
    }
  }

  // SSVC-V track/watch = still opportunity for future exploit
  if (alert.ssvc_json) {
    try {
      const ssvc = JSON.parse(alert.ssvc_json) as { decision?: string };
      if (ssvc.decision === 'act') score += 0.2;
    } catch { /* ignore */ }
  }

  return Math.min(score, 1.0);
}

// ── Label helpers ──────────────────────────────────────────────────────

function intentLabel(score: number): AlertScore['labels']['intent'] {
  if (score >= 0.7) return 'targeted';
  if (score >= 0.4) return 'sector-wide';
  if (score >= 0.2) return 'opportunistic';
  return 'unknown';
}

function capLabel(score: number): AlertScore['labels']['capability'] {
  if (score >= 0.8) return 'apt';
  if (score >= 0.5) return 'sophisticated';
  if (score >= 0.3) return 'commodity';
  return 'unknown';
}

function oppLabel(score: number): AlertScore['labels']['opportunity'] {
  if (score >= 0.6) return 'direct-hit';
  if (score >= 0.3) return 'adjacent';
  if (score >= 0.1) return 'perimeter';
  return 'minimal';
}

/**
 * Batch rank for the alert list endpoint.
 * Sorts alerts by composite score descending.
 */
export function rankAlerts(
  alerts: AlertForScoring[],
  estateSector?: string,
  estateCriticalAssets?: string[]
): Array<AlertForScoring & { score: AlertScore }> {
  return alerts
    .map((a) => ({
      ...a,
      score: rankAlert({ ...a, estateSector, estateCriticalAssets }),
    }))
    .sort((a, b) => b.score.composite - a.score.composite);
}