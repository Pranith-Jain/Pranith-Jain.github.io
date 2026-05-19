import type { DetectionRule } from './detection-engine';

/**
 * Curated built-in detection pack, evaluated hourly against the unified
 * live-IOC stream (routes/live-iocs.ts) by the /api/v1/detections cron path.
 *
 * Design rules for entries here:
 *   - High signal. These fire on the public site and into Telegram, so a
 *     noisy rule is worse than a missing one. Prefer cross-feed consensus
 *     (aggregate + distinctBy: 'source') over single-feed string matches.
 *   - Regexes are author-controlled and ReDoS-safe (no nested quantifiers).
 *   - Source ids must match the `source` tags emitted by fetchLiveIocs:
 *     tweetfeed, sans-isc, c2-intel, urlhaus, emerging-threats,
 *     otx-reputation, threatfox, malwarebazaar, phishtank, openphish,
 *     sslbl-c2, botvrij, andreafortuna-defacements, mythreatintel.
 */
export const DETECTION_RULES_PACK: DetectionRule[] = [
  {
    id: 'ip-cross-feed-consensus',
    name: 'IP confirmed by multiple independent feeds',
    severity: 'high',
    description:
      'The same IP was independently reported by 2+ feeds in the live stream. Single-feed flags can be false positives; cross-source overlap is the signal analysts trust for blocklisting.',
    match: { kind: 'ip' },
    aggregate: { groupBy: 'value', minCount: 2, distinctBy: 'source' },
  },
  {
    id: 'domain-cross-feed-consensus',
    name: 'Domain confirmed by multiple independent feeds',
    severity: 'high',
    description: 'The same domain was reported by 2+ independent feeds in the live stream.',
    match: { kind: 'domain' },
    aggregate: { groupBy: 'value', minCount: 2, distinctBy: 'source' },
  },
  {
    id: 'cobalt-strike-c2',
    name: 'Cobalt Strike / C2 infrastructure',
    severity: 'high',
    description:
      'Indicator tagged as Cobalt Strike or generic C2, or sourced from a dedicated C2 tracking feed. High-priority for proactive blocking.',
    match: { contextRegex: '\\b(cobalt[ -]?strike|command[ -]?and[ -]?control|\\bc2\\b|beacon)\\b' },
    minMatches: 1,
  },
  {
    id: 'c2-feed-ip',
    name: 'IP on a dedicated C2 tracking feed',
    severity: 'high',
    description: 'IP published by drb-ra/C2IntelFeeds — curated command-and-control infrastructure.',
    match: { kind: 'ip', source: 'c2-intel' },
    minMatches: 1,
  },
  {
    id: 'ransomware-tagged-indicator',
    name: 'Indicator tagged with a ransomware family',
    severity: 'critical',
    description:
      'Indicator context names a known ransomware family. Treat as active-incident-relevant: pivot to the actor profile and hunt the associated TTPs.',
    match: {
      contextRegex:
        '\\b(ransom|lockbit|blackcat|alphv|akira|cl0p|clop|play|royal|bianlian|medusa|rhysida|black ?basta|qilin|hunters|inc ransom|8base|ransomhub)\\b',
    },
    minMatches: 1,
  },
  {
    id: 'infostealer-malware',
    name: 'Infostealer malware indicator',
    severity: 'high',
    description: 'Indicator context names a known information-stealer family (credential / session theft).',
    match: {
      contextRegex: '\\b(redline|raccoon|vidar|lumma|stealc|rhadamanthys|meta ?stealer|aurora|stealer)\\b',
    },
    minMatches: 1,
  },
  {
    id: 'malware-hash-classified',
    name: 'Classified malware sample',
    severity: 'medium',
    description: 'A file hash carrying a non-trivial family signature from MalwareBazaar / ThreatFox / MyThreatIntel.',
    match: { kind: 'hash', contextRegex: '[a-z]{3,}' },
    aggregate: { groupBy: 'context', minCount: 3 },
  },
  {
    id: 'phishing-brand-cluster',
    name: 'Phishing campaign cluster against one brand',
    severity: 'medium',
    description:
      'Several distinct phishing URLs impersonating the same brand within the live window — indicative of an active campaign rather than a one-off.',
    match: { kind: 'url', source: ['phishtank', 'openphish'], contextRegex: '^brand:' },
    aggregate: { groupBy: 'context', minCount: 4 },
  },
  {
    id: 'high-volume-attack-source',
    name: 'High-volume attack source (sensor telemetry)',
    severity: 'medium',
    description:
      'IP reported by the SANS ISC sensor network and corroborated by at least one other feed — actively scanning/attacking and externally confirmed.',
    match: { kind: 'ip', source: ['sans-isc', 'emerging-threats', 'otx-reputation', 'c2-intel'] },
    aggregate: { groupBy: 'value', minCount: 2, distinctBy: 'source' },
  },
  {
    id: 'tls-c2-infrastructure',
    name: 'SSL/TLS-fingerprinted botnet C2',
    severity: 'high',
    description:
      'IP on abuse.ch SSLBL — its TLS certificate fingerprint matches known botnet command-and-control. High-confidence proactive block.',
    match: { kind: 'ip', source: 'sslbl-c2' },
    minMatches: 1,
  },
  {
    id: 'curated-malicious-domain',
    name: 'Curated malicious domain (Botvrij)',
    severity: 'medium',
    description:
      'Domain on the analyst-curated Botvrij.eu list — lower volume, manually vetted, so a single-source hit still carries weight.',
    match: { kind: 'domain', source: 'botvrij' },
    minMatches: 1,
  },
  {
    id: 'anonymizer-abuse',
    name: 'Anonymiser / proxy infrastructure',
    severity: 'low',
    description:
      'Indicator tagged as TOR, VPN, open-proxy, or other anonymising infrastructure. Context for triage, not an automatic block — legitimate traffic uses these too.',
    match: { contextRegex: '\\b(tor[ -]?(exit|node|relay)?|anonymi[sz]|open[ -]?proxy|\\bvpn\\b)\\b' },
    minMatches: 1,
  },
  {
    id: 'crypto-scam-indicator',
    name: 'Crypto-scam / wallet-drainer indicator',
    severity: 'medium',
    description:
      'Indicator context references wallet drainers, seed-phrase phishing, or pig-butchering — financially-motivated crypto fraud infrastructure.',
    match: {
      contextRegex: '\\b(drainer|wallet|seed[ -]?phrase|metamask|pig[ -]?butcher|crypto[ -]?scam|airdrop scam)\\b',
    },
    minMatches: 1,
  },
  {
    id: 'website-defacement',
    name: 'Active website defacement',
    severity: 'low',
    description:
      'URL reported as a live defacement (Andrea Fortuna mirror). Indicates a compromised, publicly-facing web asset.',
    match: { kind: 'url', source: 'andreafortuna-defacements' },
    minMatches: 1,
  },
  {
    id: 'hash-multi-source-consensus',
    name: 'File hash confirmed across malware feeds',
    severity: 'high',
    description:
      'Same file hash independently present in 2+ malware-sample feeds (MalwareBazaar / ThreatFox / MyThreatIntel) — corroborated malicious sample.',
    match: { kind: 'hash' },
    aggregate: { groupBy: 'value', minCount: 2, distinctBy: 'source' },
  },
];
