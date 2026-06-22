/**
 * CTI Exposure Scoring — composite risk score (0–100) for any target.
 *
 * Inspired by CTI Expert's /exposure command. Aggregates signals from:
 * - IOC reputation (abuseipdb, virustotal, etc.)
 * - Breach exposure (haveibeenpwned, hudsonrock)
 * - Infrastructure exposure (open ports, TLS issues, DNS config)
 * - Attack surface (subdomains, exposed services)
 * - Threat intelligence (known malware associations, C2 infrastructure)
 *
 * Each dimension scores 0–100, then weighted into a composite.
 */

export interface ExposureDimension {
  name: string;
  score: number; // 0–100
  weight: number; // 0.0–1.0
  signals: string[]; // human-readable signal descriptions
  details: Record<string, unknown>;
}

export interface ExposureResult {
  target: string;
  targetType: string;
  compositeScore: number; // 0–100
  label: 'Minimal' | 'Moderate' | 'Elevated' | 'Critical';
  dimensions: ExposureDimension[];
  recommendations: string[];
  calculatedAt: string;
}

const SCORE_BANDS: [number, ExposureResult['label']][] = [
  [76, 'Critical'],
  [51, 'Elevated'],
  [26, 'Moderate'],
  [0, 'Minimal'],
];

function scoreLabel(score: number): ExposureResult['label'] {
  for (const [threshold, label] of SCORE_BANDS) {
    if (score >= threshold) return label;
  }
  return 'Minimal';
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Build an exposure result from raw dimension inputs. */
export function calculateExposure(
  target: string,
  targetType: string,
  dimensions: ExposureDimension[],
  extraRecommendations: string[] = []
): ExposureResult {
  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
  const compositeScore =
    totalWeight > 0 ? Math.round(dimensions.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight) : 0;

  const label = scoreLabel(compositeScore);

  const recommendations: string[] = [];
  for (const d of dimensions) {
    if (d.score >= 75) {
      recommendations.push(`URGENT: Address ${d.name} — score ${d.score}/100`);
    } else if (d.score >= 50) {
      recommendations.push(`Review: ${d.name} shows elevated risk (${d.score}/100)`);
    }
  }
  recommendations.push(...extraRecommendations);

  return {
    target,
    targetType,
    compositeScore,
    label,
    dimensions,
    recommendations,
    calculatedAt: new Date().toISOString(),
  };
}

/** IOC reputation dimension — derived from abuseipdb/virustotal scores. */
export function iocReputationDimension(params: {
  abuseScore?: number; // 0–100 abuse confidence
  vtPositives?: number; // AV detections
  vtTotal?: number; // total AV engines
  inBlocklists?: boolean;
  isC2?: boolean;
}): ExposureDimension {
  const signals: string[] = [];
  let score = 0;

  if (params.abuseScore !== undefined) {
    score = Math.max(score, clamp(params.abuseScore));
    signals.push(`AbuseIPDB confidence: ${params.abuseScore}%`);
  }
  if (params.vtPositives !== undefined && params.vtTotal) {
    const ratio = (params.vtPositives / params.vtTotal) * 100;
    score = Math.max(score, clamp(ratio));
    signals.push(`VirusTotal: ${params.vtPositives}/${params.vtTotal} detections`);
  }
  if (params.inBlocklists) {
    score = Math.max(score, 80);
    signals.push('Found in active blocklists');
  }
  if (params.isC2) {
    score = Math.max(score, 95);
    signals.push('Confirmed C2 infrastructure');
  }
  if (signals.length === 0) signals.push('No negative reputation signals found');

  return { name: 'IOC Reputation', score, weight: 0.25, signals, details: params };
}

/** Breach exposure dimension — has the target appeared in known breaches? */
export function breachExposureDimension(params: {
  breachCount?: number;
  totalRecords?: number;
  hasStealerLogs?: boolean;
  lastBreachDate?: string;
}): ExposureDimension {
  const signals: string[] = [];
  let score = 0;

  if (params.breachCount && params.breachCount > 0) {
    score = clamp(Math.min(100, params.breachCount * 15));
    signals.push(`Found in ${params.breachCount} breach(es)`);
  }
  if (params.totalRecords && params.totalRecords > 10000) {
    score = clamp(score + 20);
    signals.push(`~${params.totalRecords.toLocaleString()} records exposed`);
  }
  if (params.hasStealerLogs) {
    score = clamp(score + 30);
    signals.push('Stealer log entries detected');
  }
  if (signals.length === 0) signals.push('No breach exposure detected');

  return { name: 'Breach Exposure', score, weight: 0.2, signals, details: params };
}

/** Infrastructure exposure dimension — open ports, TLS, DNS config. */
export function infrastructureExposureDimension(params: {
  openPorts?: number;
  tlsGrade?: string; // A+ through F
  hasDMARC?: boolean;
  dmarcPolicy?: string; // none, quarantine, reject
  hasSPF?: boolean;
  exposedAdminPanels?: boolean;
  cloudMisconfigs?: string[];
}): ExposureDimension {
  const signals: string[] = [];
  let score = 0;

  if (params.openPorts && params.openPorts > 10) {
    score = clamp(score + 25);
    signals.push(`${params.openPorts} open ports detected`);
  } else if (params.openPorts && params.openPorts > 5) {
    score = clamp(score + 10);
    signals.push(`${params.openPorts} open ports`);
  }

  if (params.tlsGrade) {
    const grade: Record<string, number> = { F: 90, E: 70, D: 50, C: 30, B: 10, A: 0, 'A+': 0 };
    const penalty = grade[params.tlsGrade.toUpperCase()] ?? 0;
    score = clamp(score + penalty);
    if (penalty > 0) signals.push(`TLS grade: ${params.tlsGrade}`);
  }

  if (!params.hasDMARC) {
    score = clamp(score + 15);
    signals.push('No DMARC record');
  } else if (params.dmarcPolicy === 'none') {
    score = clamp(score + 10);
    signals.push('DMARC policy is "none" (monitoring only)');
  }

  if (!params.hasSPF) {
    score = clamp(score + 10);
    signals.push('No SPF record');
  }

  if (params.exposedAdminPanels) {
    score = clamp(score + 20);
    signals.push('Exposed admin panels detected');
  }

  if (params.cloudMisconfigs?.length) {
    score = clamp(score + params.cloudMisconfigs.length * 10);
    signals.push(`Cloud misconfigs: ${params.cloudMisconfigs.join(', ')}`);
  }

  if (signals.length === 0) signals.push('Infrastructure appears well-configured');

  return { name: 'Infrastructure Exposure', score, weight: 0.2, signals, details: params };
}

/** Attack surface dimension — subdomains, exposed services. */
export function attackSurfaceDimension(params: {
  subdomainCount?: number;
  exposedServices?: string[];
  hasPublicRepo?: boolean;
  exposedAPIs?: number;
  wwwRecords?: number;
}): ExposureDimension {
  const signals: string[] = [];
  let score = 0;

  if (params.subdomainCount && params.subdomainCount > 50) {
    score = clamp(score + 20);
    signals.push(`${params.subdomainCount} subdomains discovered`);
  } else if (params.subdomainCount && params.subdomainCount > 20) {
    score = clamp(score + 10);
    signals.push(`${params.subdomainCount} subdomains discovered`);
  }

  if (params.exposedServices?.length) {
    score = clamp(score + params.exposedServices.length * 8);
    signals.push(`Exposed services: ${params.exposedServices.join(', ')}`);
  }

  if (params.hasPublicRepo) {
    score = clamp(score + 10);
    signals.push('Public code repositories detected');
  }

  if (params.exposedAPIs && params.exposedAPIs > 0) {
    score = clamp(score + params.exposedAPIs * 5);
    signals.push(`${params.exposedAPIs} exposed API endpoint(s)`);
  }

  if (signals.length === 0) signals.push('Limited attack surface detected');

  return { name: 'Attack Surface', score, weight: 0.15, signals, details: params };
}

/** Threat intelligence dimension — known associations with malicious activity. */
export function threatIntelDimension(params: {
  greynoiseClass?: string; // benign, unknown, malicious
  threatFoxMatch?: boolean;
  urlhausMatch?: boolean;
  malwareAssociation?: string[];
  ransomwareVictim?: boolean;
  mitreTechniques?: string[];
}): ExposureDimension {
  const signals: string[] = [];
  let score = 0;

  if (params.greynoiseClass === 'malicious') {
    score = clamp(score + 60);
    signals.push('GreyNoise: classified as malicious');
  } else if (params.greynoiseClass === 'unknown') {
    score = clamp(score + 20);
    signals.push('GreyNoise: classification unknown');
  }

  if (params.threatFoxMatch) {
    score = clamp(score + 40);
    signals.push('ThreatFox IOC match');
  }
  if (params.urlhausMatch) {
    score = clamp(score + 40);
    signals.push('URLhaus malware URL match');
  }
  if (params.malwareAssociation?.length) {
    score = clamp(score + params.malwareAssociation.length * 15);
    signals.push(`Malware associations: ${params.malwareAssociation.join(', ')}`);
  }
  if (params.ransomwareVictim) {
    score = clamp(score + 50);
    signals.push('Confirmed ransomware victim');
  }
  if (params.mitreTechniques?.length) {
    signals.push(`MITRE techniques: ${params.mitreTechniques.join(', ')}`);
  }

  if (signals.length === 0) signals.push('No threat intelligence associations');

  return { name: 'Threat Intelligence', score, weight: 0.2, signals, details: params };
}
