// api/src/lib/supply-chain/types.ts
// Shared normalized result envelopes for the supply-chain intelligence module.
// One source = one lib fn; each fn returns one of these envelopes with an
// HONEST status (never throws). See docs/superpowers/specs/2026-06-11-supply-chain-intel-design.md §2.3.
import type { LabelCategory } from '../address-labels';

/** Injectable fetch implementation (defaults to globalThis.fetch in each lib fn). */
export type Fetchish = typeof fetch;

/** Common envelope every supply-chain lib fn returns (status is honest, never throws). */
export type SCStatus = 'ok' | 'empty' | 'error' | 'needs-key';

export interface SCBase {
  source: string; // e.g. 'osv.dev', 'deps.dev', 'Chainalysis Sanctions Oracle'
  status: SCStatus;
  fetched_at: string; // ISO
  error?: string;
}

/** ── SOFTWARE ── */
export interface SCFinding {
  id: string; // GHSA-*, CVE-*, MAL-*
  malicious: boolean; // id.startsWith('MAL-')
  summary?: string;
  cvss?: string; // e.g. "7.5"
  severity?: string; // critical|high|medium|low|unknown
  aliases: string[];
  fixed?: string;
  modified?: string;
  references?: string[];
}

export interface SCSoftwareResult extends SCBase {
  package: string;
  ecosystem: string;
  version?: string;
  total: number;
  malicious_count: number;
  findings: SCFinding[];
  detail?: Record<string, unknown>; // source-specific extras (e.g. deps.dev scorecard/licenses/dependency_count)
}

/** ── CRYPTO ── reuses the in-app LabelCategory so it feeds risk-score.ts directly. */
export interface SCAddressSignal extends SCBase {
  address: string;
  chain?: string;
  category: LabelCategory | null; // mixer | sanctioned | exchange | bridge | ...
  sanctioned: boolean | null; // null = inconclusive (Oracle RPC failed)
  risk_flags: string[]; // e.g. 'honeypot','high-sell-tax','tornado-pool'
  risk_score?: number; // 0..100 where the source provides one
  label?: string; // human label (entity/token name)
  detail?: Record<string, unknown>;
}

/** ── INFRA ── */
export interface SCInfraResult extends SCBase {
  resource: string; // ip | cidr | "AS####" | domain
  listed?: boolean; // ASN-DROP / distrusted-CA membership
  facts: Array<{ label: string; value: string; url?: string }>;
  detail?: Record<string, unknown>;
}
