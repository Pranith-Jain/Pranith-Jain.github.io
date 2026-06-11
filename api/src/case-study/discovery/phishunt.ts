import type { Candidate, DedupRecord } from '../types';
import { topicKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

interface PhishuntResult {
  url: string;
  domain: string;
  company: string;
  date: string;
  first_seen: string;
  ip: string;
  country: string;
  asn: string;
  org: string;
  cert: string;
  malicious_google: boolean;
  malicious_openphish: boolean;
  malicious_phishtank: boolean;
  malicious_tweetfeed: boolean;
  malicious_urlscan: boolean;
}

export interface DiscoverPhishuntDeps {
  fetchPhishunt: () => Promise<PhishuntResult[]>;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

const MAX_CANDIDATES = 4;

function confidenceScore(result: PhishuntResult): number {
  let hits = 0;
  if (result.malicious_google) hits++;
  if (result.malicious_openphish) hits++;
  if (result.malicious_phishtank) hits++;
  if (result.malicious_tweetfeed) hits++;
  if (result.malicious_urlscan) hits++;
  return hits / 5;
}

function severityLabel(hits: number): string {
  if (hits >= 4) return 'critical';
  if (hits >= 2) return 'high';
  return 'medium';
}

export async function discoverPhishuntHunts(deps: DiscoverPhishuntDeps): Promise<Candidate[]> {
  let results: PhishuntResult[] = [];
  try {
    results = await deps.fetchPhishunt();
  } catch (err) {
    console.warn('discoverPhishuntHunts: fetch failed', err instanceof Error ? err.message : String(err));
    return [];
  }

  if (results.length === 0) return [];

  const candidates: Candidate[] = [];
  const seenKeys = new Set<string>();

  // Group by company (brand being targeted) to find campaigns
  const brandCampaigns = new Map<string, PhishuntResult[]>();
  for (const r of results) {
    if (!r.company || r.company === 'unknown') continue;
    const existing = brandCampaigns.get(r.company) ?? [];
    existing.push(r);
    brandCampaigns.set(r.company, existing);
  }

  // Surface large brand phishing campaigns
  for (const [brand, entries] of brandCampaigns) {
    if (entries.length < 5) continue;
    const key = topicKey('phish-brand', brand);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const dedup = await deps.getDedup(key);
    const avgConfidence = entries.reduce((s, e) => s + confidenceScore(e), 0) / entries.length;
    const severity = severityLabel(Math.round(avgConfidence * 5));
    const score = finalScore({
      recency: recencyScore(entries[0]!.date, deps.now),
      severity: severityScore({ victims: entries.length / 10 }),
      novelty: noveltyScore(dedup, deps.now),
      sourceWeight: 0.75,
    });

    if (score < 0.4) continue;

    const hosters = [...new Set(entries.map((e) => e.org).filter(Boolean))].slice(0, 5);
    const countries = [...new Set(entries.map((e) => e.country).filter(Boolean))].slice(0, 5);

    candidates.push({
      key,
      type: 'breach',
      title: `${brand} phishing campaign: ${entries.length} active sites targeting ${brand} users`,
      rationale: `${entries.length} live phishing sites · ${hosters.length} hosting providers · ${countries.length} countries · Confidence: ${(avgConfidence * 100).toFixed(0)}%`,
      score,
      evidence: {
        brand,
        siteCount: entries.length,
        avgConfidence,
        severity,
        hosters,
        countries,
        sampleUrls: entries.slice(0, 5).map((e) => e.url),
        source: 'phishunt.io',
        detectedAt: deps.now.toISOString(),
      },
      discoveredAt: deps.now.toISOString(),
      status: 'pending',
    });
  }

  // Surface critical individual phishing sites (flagged by 4+ sources)
  const criticalSites = results.filter((r) => confidenceScore(r) >= 0.8);
  for (const site of criticalSites.slice(0, MAX_CANDIDATES)) {
    const key = topicKey('phish-critical', site.domain);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const dedup = await deps.getDedup(key);
    const score = finalScore({
      recency: recencyScore(site.date, deps.now),
      severity: severityScore({ victims: 1 }),
      novelty: noveltyScore(dedup, deps.now),
      sourceWeight: 0.8,
    });

    if (score < 0.5) continue;

    const flags: string[] = [];
    if (site.malicious_google) flags.push('Google Safe Browsing');
    if (site.malicious_openphish) flags.push('OpenPhish');
    if (site.malicious_phishtank) flags.push('PhishTank');
    if (site.malicious_tweetfeed) flags.push('TweetFeed');
    if (site.malicious_urlscan) flags.push('urlscan.io');

    candidates.push({
      key,
      type: 'breach',
      title: `Critical phishing: ${site.domain} impersonates ${site.company}`,
      rationale: `Flagged by ${flags.length} sources (${flags.join(', ')}) · Hosted by ${site.org ?? 'unknown'} in ${site.country ?? 'unknown'} · TLS: ${site.cert ?? 'unknown'}`,
      score,
      evidence: {
        domain: site.domain,
        url: site.url,
        brand: site.company,
        ip: site.ip,
        country: site.country,
        asn: site.asn,
        org: site.org,
        cert: site.cert,
        detectionSources: flags,
        confidence: confidenceScore(site),
        source: 'phishunt.io',
      },
      discoveredAt: deps.now.toISOString(),
      status: 'pending',
    });
  }

  // Sort by score, keep top N.
  candidates.sort((a, b) => b.score - a.score);
  const kept = candidates.slice(0, MAX_CANDIDATES);

  console.log(
    JSON.stringify({
      runner: 'phishunt',
      total: results.length,
      brandCampaigns: brandCampaigns.size,
      criticalSites: criticalSites.length,
      candidatesGenerated: kept.length,
    })
  );

  return kept;
}
