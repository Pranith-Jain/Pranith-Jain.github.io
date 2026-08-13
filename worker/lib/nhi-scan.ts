/**
 * Non-Human Identity (NHI) scanner — TypeScript port of
 * github.com/rpmsft9/nhi-scan (MIT). Original design:
 *
 *   Every workload, integration, and AI agent now has an identity — and nobody
 *   owns most of them. This module inventories non-human & agent identities,
 *   assigns each a defensible risk tier (1–4) via a transparent floor-tier
 *   rules engine, and maps posture to the OWASP Non-Human Identities (NHI)
 *   Top 10 with a least-privilege remediation for every finding.
 *
 * It runs entirely locally and is deterministic: the same inventory always
 * produces the same tiers and findings, so an assessment is explainable to an
 * engineer and defensible to an auditor. No LLM is in the verdict path.
 *
 * The unit of analysis is an NHI record — service account, API key, OAuth app,
 * service principal / managed identity, workload identity, CI/CD token, PAT,
 * webhook, secret, or AI agent. Only `id` and `name` are required; every other
 * field falls back to a safe, conservative default so a partial inventory
 * still assesses.
 *
 * Source: https://github.com/rpmsft9/nhi-scan (MIT)
 */

// --- Policy thresholds (edit here, not scattered through the engine) ----------
/** A static secret older than this is "long-lived" (OWASP NHI7). */
export const ROTATION_MAX_DAYS = 90;
/** An NHI unused for longer than this is an offboarding candidate. */
export const STALE_DAYS = 90;
/** Scope strings that grant effectively unbounded access. */
export const WILDCARD_SCOPES = new Set(['*', '**', '.*', 'all', 'full_access', 'owner', 'admin', '*:*']);

// --- Enums (string unions + parse helpers with safe defaults) -----------------

export const NHI_TYPES = [
  'service_account',
  'api_key',
  'oauth_app',
  'service_principal',
  'managed_identity',
  'workload_identity',
  'ci_cd_token',
  'pat',
  'webhook',
  'secret',
  'ai_agent',
] as const;
export type NHIType = (typeof NHI_TYPES)[number];

export const CREDENTIAL_TYPES = [
  'static_secret',
  'api_key',
  'certificate',
  'federated',
  'managed',
  'short_lived_token',
  'none',
] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

/** Static credentials are long-lived secrets an attacker can steal and replay. */
export const STATIC_CREDENTIALS: ReadonlySet<CredentialType> = new Set<CredentialType>([
  'static_secret',
  'api_key',
  'certificate',
]);

export const SECRET_STORAGES = ['vault', 'env', 'plaintext', 'none'] as const;
export type SecretStorage = (typeof SECRET_STORAGES)[number];

export const PRIVILEGES = ['admin', 'privileged', 'scoped', 'read_only'] as const;
export type Privilege = (typeof PRIVILEGES)[number];
export const ELEVATED_PRIVILEGES: ReadonlySet<Privilege> = new Set<Privilege>(['admin', 'privileged']);

export const ENVIRONMENTS = ['prod', 'nonprod', 'dev', 'sandbox'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const EXPOSURES = ['internet', 'external_partner', 'internal'] as const;
export type Exposure = (typeof EXPOSURES)[number];

/** Lower is more severe, so `min()` over floors gives the final tier. */
export const RISK_TIERS = [1, 2, 3, 4] as const;
export type RiskTier = (typeof RISK_TIERS)[number];
export const TIER_LABEL: Record<RiskTier, string> = {
  1: 'Critical',
  2: 'High',
  3: 'Moderate',
  4: 'Baseline',
};
export const TIER_BADGE: Record<RiskTier, string> = {
  1: '🔴 Critical',
  2: '🟠 High',
  3: '🟡 Moderate',
  4: '🟢 Baseline',
};

/** OWASP NHI finding severity. */
export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  info: 1,
  low: 2,
  medium: 4,
  high: 8,
  critical: 12,
};

function parseEnum<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  const v = value.trim().toLowerCase();
  return (values as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function parseNhiType(value: unknown): NHIType {
  return parseEnum(NHI_TYPES, value, 'service_account');
}
export function parseCredentialType(value: unknown): CredentialType {
  return parseEnum(CREDENTIAL_TYPES, value, 'static_secret');
}
export function parseSecretStorage(value: unknown): SecretStorage {
  return parseEnum(SECRET_STORAGES, value, 'vault');
}
export function parsePrivilege(value: unknown): Privilege {
  return parseEnum(PRIVILEGES, value, 'scoped');
}
export function parseEnvironment(value: unknown): Environment {
  return parseEnum(ENVIRONMENTS, value, 'prod');
}
export function parseExposure(value: unknown): Exposure {
  return parseEnum(EXPOSURES, value, 'internal');
}
export function parseRiskTier(value: unknown): RiskTier {
  const t = Number(value);
  return RISK_TIERS.includes(t as RiskTier) ? (t as RiskTier) : 4;
}

// --- Raw inventory records ----------------------------------------------------

/** A single NHI record as supplied in the inventory JSON (only id/name required). */
export interface NhiRecord {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  owner?: unknown;
  environment?: unknown;
  privilege?: unknown;
  credential?: unknown;
  secret_storage?: unknown;
  last_rotated_days?: unknown;
  last_used_days?: unknown;
  exposure?: unknown;
  scopes?: unknown;
  autonomous?: unknown;
  third_party?: unknown;
  human_used?: unknown;
  shared_across_env?: unknown;
  used_by?: unknown;
  [key: string]: unknown;
}

function asStringList(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.map((v) => String(v));
  return [String(value)];
}

function asBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
  return Boolean(value);
}

function asNullableInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// --- Core model -----------------------------------------------------------------

export class Nhi {
  id: string;
  name: string;
  type: NHIType;
  owner: string | null;
  environment: Environment;
  privilege: Privilege;
  credential: CredentialType;
  secretStorage: SecretStorage;
  lastRotatedDays: number | null;
  lastUsedDays: number | null;
  exposure: Exposure;
  scopes: string[];
  autonomous: boolean;
  thirdParty: boolean;
  humanUsed: boolean;
  sharedAcrossEnv: boolean;
  usedBy: string[];

  constructor(rec: NhiRecord) {
    this.id = String(rec.id ?? rec.name ?? 'unknown');
    this.name = String(rec.name ?? rec.id ?? 'unknown');
    this.type = parseNhiType(rec.type);
    this.owner = rec.owner ? String(rec.owner) : null;
    this.environment = parseEnvironment(rec.environment);
    this.privilege = parsePrivilege(rec.privilege);
    this.credential = parseCredentialType(rec.credential);
    this.secretStorage = parseSecretStorage(rec.secret_storage);
    this.lastRotatedDays = asNullableInt(rec.last_rotated_days);
    this.lastUsedDays = asNullableInt(rec.last_used_days);
    this.exposure = parseExposure(rec.exposure);
    this.scopes = asStringList(rec.scopes);
    this.autonomous = asBool(rec.autonomous);
    this.thirdParty = asBool(rec.third_party);
    this.humanUsed = asBool(rec.human_used);
    this.sharedAcrossEnv = asBool(rec.shared_across_env);
    this.usedBy = asStringList(rec.used_by);
  }

  // --- derived posture --------------------------------------------------------
  get isOrphaned(): boolean {
    return !(this.owner && this.owner.trim());
  }

  get hasStaticSecret(): boolean {
    return STATIC_CREDENTIALS.has(this.credential);
  }

  /** Static credential never rotated, or older than the rotation window (NHI7). */
  get isLongLived(): boolean {
    if (!this.hasStaticSecret) return false;
    if (this.lastRotatedDays === null) return true;
    return this.lastRotatedDays > ROTATION_MAX_DAYS;
  }

  get isStale(): boolean {
    return this.lastUsedDays !== null && this.lastUsedDays > STALE_DAYS;
  }

  get hasWildcardScope(): boolean {
    for (const s of this.scopes) {
      const low = s.trim().toLowerCase();
      if (WILDCARD_SCOPES.has(low) || low.endsWith('*') || low.endsWith(':*')) return true;
    }
    return false;
  }

  get isOverprivileged(): boolean {
    return this.privilege === 'admin' || this.hasWildcardScope;
  }

  get isReused(): boolean {
    return this.usedBy.length > 1;
  }
}

/** The full set of inventoried non-human identities. */
export class Fleet {
  identities: Nhi[];

  constructor(identities: Nhi[] = []) {
    this.identities = identities;
  }

  get size(): number {
    return this.identities.length;
  }

  get(nhiId: string | null | undefined): Nhi | undefined {
    if (!nhiId) return undefined;
    return this.identities.find((n) => n.id === nhiId);
  }
}

// --- Tiering rules engine ------------------------------------------------------

export interface TierReason {
  ruleId: string;
  floor: RiskTier;
  rationale: string;
}

export interface TierResult {
  nhiId: string;
  tier: RiskTier;
  reasons: TierReason[];
  topRationale: string;
}

export interface TierRule {
  id: string;
  floor: RiskTier;
  rationale: string;
  predicate: (n: Nhi) => boolean;
}

/**
 * Fixed, ordered list of rules. Each rule inspects an NHI and, if it matches,
 * imposes a *floor* tier — a minimum level of scrutiny — with a written
 * rationale. The NHI's final tier is the most severe floor any rule imposed
 * (numerically the smallest). Every matching rule is recorded, so the
 * assessment is fully explainable and — because rules are pure functions of
 * the inventory — reproducible. No LLM is involved.
 *
 * To change the risk policy, edit TIER_RULES. Do not scatter tiering logic
 * elsewhere.
 */
export const TIER_RULES: TierRule[] = [
  {
    id: 'ADMIN_STATIC_SECRET',
    floor: 1,
    rationale:
      'Admin-level identity authenticating with a long-lived static secret — a stealable crown-jewel credential.',
    predicate: (n) => ELEVATED_PRIVILEGES.has(n.privilege) && n.privilege === 'admin' && n.hasStaticSecret,
  },
  {
    id: 'PRIVILEGED_ORPHAN',
    floor: 1,
    rationale: 'Privileged identity has no accountable owner — nobody governs, rotates, or offboards it.',
    predicate: (n) => ELEVATED_PRIVILEGES.has(n.privilege) && n.isOrphaned,
  },
  {
    id: 'AUTONOMOUS_PRIVILEGED_AGENT',
    floor: 1,
    rationale: 'Autonomous AI agent holds elevated privilege and acts without per-action human approval.',
    predicate: (n) => n.type === 'ai_agent' && n.autonomous && ELEVATED_PRIVILEGES.has(n.privilege),
  },
  {
    id: 'INTERNET_EXPOSED_PRIVILEGED',
    floor: 1,
    rationale: 'Privileged identity is reachable from the public internet.',
    predicate: (n) => n.exposure === 'internet' && ELEVATED_PRIVILEGES.has(n.privilege),
  },
  {
    id: 'PROD_LONG_LIVED_SECRET',
    floor: 2,
    rationale: 'Production identity relies on a long-lived / never-rotated static secret.',
    predicate: (n) => n.environment === 'prod' && n.isLongLived,
  },
  {
    id: 'OVERPRIVILEGED',
    floor: 2,
    rationale: 'Identity is admin or carries wildcard/full-access scopes (violates least privilege).',
    predicate: (n) => n.isOverprivileged,
  },
  {
    id: 'ORPHANED',
    floor: 2,
    rationale: 'Identity has no accountable owner.',
    predicate: (n) => n.isOrphaned,
  },
  {
    id: 'STALE_PRIVILEGED',
    floor: 2,
    rationale: 'Privileged identity is stale (unused) — a standing offboarding gap.',
    predicate: (n) => n.isStale && ELEVATED_PRIVILEGES.has(n.privilege),
  },
  {
    id: 'AUTONOMOUS_AGENT',
    floor: 2,
    rationale: 'Autonomous AI agent acts without per-action human approval.',
    predicate: (n) => n.type === 'ai_agent' && n.autonomous,
  },
  {
    id: 'HUMAN_USE_OF_NHI',
    floor: 2,
    rationale: 'A human authenticates interactively with this shared non-human identity (no individual attribution).',
    predicate: (n) => n.humanUsed,
  },
  {
    id: 'PROD_NHI',
    floor: 3,
    rationale: 'Identity operates in production.',
    predicate: (n) => n.environment === 'prod',
  },
  {
    id: 'LONG_LIVED_SECRET',
    floor: 3,
    rationale: 'Identity relies on a long-lived / never-rotated static secret.',
    predicate: (n) => n.isLongLived,
  },
  {
    id: 'STALE',
    floor: 3,
    rationale: 'Identity is stale (unused beyond the staleness window).',
    predicate: (n) => n.isStale,
  },
  {
    id: 'THIRD_PARTY',
    floor: 3,
    rationale: 'Identity is issued to or operated by an external third party.',
    predicate: (n) => n.thirdParty,
  },
];

/** Every inventoried NHI gets at least Tier 4 so it lands with baseline governance. */
export const BASELINE_REASON: TierReason = {
  ruleId: 'BASELINE',
  floor: 4,
  rationale: 'Baseline: all inventoried non-human identities receive minimum governance.',
};

export function assess(nhi: Nhi): TierResult {
  const reasons: TierReason[] = [BASELINE_REASON];
  for (const rule of TIER_RULES) {
    if (rule.predicate(nhi)) {
      reasons.push({ ruleId: rule.id, floor: rule.floor, rationale: rule.rationale });
    }
  }
  const tier = Math.min(...reasons.map((r) => r.floor)) as RiskTier;
  // Sort most-severe first for stable, readable output.
  reasons.sort((a, b) => a.floor - b.floor || a.ruleId.localeCompare(b.ruleId));
  return { nhiId: nhi.id, tier, reasons, topRationale: reasons[0]?.rationale ?? '' };
}

// --- OWASP NHI Top 10 — 2025 catalog -------------------------------------------

export interface OwaspNhi {
  id: string;
  title: string;
  summary: string;
}

export const OWASP_SOURCE_URL = 'https://owasp.org/www-project-non-human-identities-top-10/';

/** Versioned data layer, not model memory — update when the list is revised. */
export const OWASP_CATALOG: OwaspNhi[] = [
  {
    id: 'NHI1:2025',
    title: 'Improper Offboarding',
    summary: 'NHIs left active after the workload, integration, or owner they served is gone.',
  },
  {
    id: 'NHI2:2025',
    title: 'Secret Leakage',
    summary: 'Secrets stored or transmitted where they can be exposed (code, config, logs, env).',
  },
  {
    id: 'NHI3:2025',
    title: 'Vulnerable Third-Party NHI',
    summary: 'Identities granted to external apps/vendors that widen the trust boundary.',
  },
  {
    id: 'NHI4:2025',
    title: 'Insecure Authentication',
    summary: 'Weak or deprecated auth methods (static keys/basic) instead of federated/managed identity.',
  },
  {
    id: 'NHI5:2025',
    title: 'Overprivileged NHI',
    summary: 'Identities with more privilege or broader scope than the task requires.',
  },
  {
    id: 'NHI6:2025',
    title: 'Insecure Cloud Deployment Configurations',
    summary: 'Deployment/config weaknesses that expose or over-trust an NHI.',
  },
  {
    id: 'NHI7:2025',
    title: 'Long-Lived Secrets',
    summary: 'Credentials that live far beyond a safe rotation window (or are never rotated).',
  },
  {
    id: 'NHI8:2025',
    title: 'Environment Isolation',
    summary: 'The same identity/credential reused across prod and non-prod, collapsing isolation.',
  },
  {
    id: 'NHI9:2025',
    title: 'NHI Reuse',
    summary: 'One identity shared across multiple workloads, destroying least privilege and attribution.',
  },
  {
    id: 'NHI10:2025',
    title: 'Human Use of NHI',
    summary: 'A person authenticating interactively with a non-human identity.',
  },
];

export function owaspGet(code: string): OwaspNhi {
  const entry = OWASP_CATALOG.find((o) => o.id === code);
  if (!entry) throw new Error(`Unknown OWASP NHI code: ${code}`);
  return entry;
}

// --- Control checks (OWASP NHI Top 10) -----------------------------------------

export interface Finding {
  nhiId: string;
  nhiName: string;
  owaspId: string;
  owaspTitle: string;
  severity: Severity;
  evidence: string;
  remediation: string;
}

export type CheckFn = (n: Nhi) => Finding | null;

function finding(n: Nhi, code: string, sev: Severity, evidence: string, remediation: string): Finding {
  return {
    nhiId: n.id,
    nhiName: n.name,
    owaspId: code,
    owaspTitle: owaspGet(code).title,
    severity: sev,
    evidence,
    remediation,
  };
}

// NHI1: Improper Offboarding
export function checkOffboarding(n: Nhi): Finding | null {
  if (n.isStale) {
    const sev: Severity = ELEVATED_PRIVILEGES.has(n.privilege) ? 'high' : 'medium';
    return finding(
      n,
      'NHI1:2025',
      sev,
      `Unused for ${n.lastUsedDays} days (staleness window is ${STALE_DAYS}).`,
      'Deprovision or disable; if still required, re-justify ownership and set an expiry.'
    );
  }
  if (n.isOrphaned) {
    return finding(
      n,
      'NHI1:2025',
      'medium',
      'No accountable owner recorded.',
      'Assign a named owner and confirm the identity is still needed; otherwise offboard.'
    );
  }
  return null;
}

// NHI2: Secret Leakage
export function checkSecretLeakage(n: Nhi): Finding | null {
  if (!n.hasStaticSecret) return null;
  if (n.secretStorage === 'plaintext') {
    return finding(
      n,
      'NHI2:2025',
      'critical',
      'Static secret stored in plaintext (hardcoded/committed/config).',
      'Move the secret to a managed vault, rotate it immediately, and scan history for exposure.'
    );
  }
  if (n.secretStorage === 'env') {
    return finding(
      n,
      'NHI2:2025',
      'medium',
      'Static secret injected via environment variable (readable by the process and crash dumps).',
      'Source the secret from a vault at runtime; avoid long-lived env injection.'
    );
  }
  return null;
}

// NHI3: Vulnerable Third-Party NHI
export function checkThirdParty(n: Nhi): Finding | null {
  if (n.thirdParty) {
    const sev: Severity = ELEVATED_PRIVILEGES.has(n.privilege) ? 'high' : 'medium';
    return finding(
      n,
      'NHI3:2025',
      sev,
      'Identity is issued to / operated by an external third party.',
      'Constrain to least-privilege scopes, require short-lived credentials, and monitor its access.'
    );
  }
  return null;
}

// NHI4: Insecure Authentication
export function checkInsecureAuth(n: Nhi): Finding | null {
  if (n.credential === 'static_secret' || n.credential === 'api_key') {
    return finding(
      n,
      'NHI4:2025',
      'medium',
      `Authenticates with ${n.credential} rather than federated/managed identity.`,
      'Migrate to workload identity federation (OIDC) or a cloud-managed identity — no stored secret.'
    );
  }
  return null;
}

// NHI5: Overprivileged NHI
export function checkOverprivileged(n: Nhi): Finding | null {
  if (n.privilege === 'admin') {
    return finding(
      n,
      'NHI5:2025',
      'high',
      'Holds admin privilege.',
      'Right-size to the specific permissions the workload uses; remove standing admin.'
    );
  }
  if (n.hasWildcardScope) {
    return finding(
      n,
      'NHI5:2025',
      'high',
      `Carries wildcard/full-access scope: ${n.scopes.join(', ')}.`,
      'Replace wildcard scopes with the explicit, minimal set the workload calls.'
    );
  }
  return null;
}

// NHI6: Insecure Cloud Deployment Configurations
export function checkDeploymentConfig(n: Nhi): Finding | null {
  if (n.exposure === 'internet') {
    const sev: Severity = ELEVATED_PRIVILEGES.has(n.privilege) ? 'critical' : 'high';
    return finding(
      n,
      'NHI6:2025',
      sev,
      'Identity is reachable from the public internet.',
      'Place behind private networking / an allow-list; restrict source ranges and add egress controls.'
    );
  }
  return null;
}

// NHI7: Long-Lived Secrets
export function checkLongLived(n: Nhi): Finding | null {
  if (!n.isLongLived) return null;
  const evidence =
    n.lastRotatedDays === null
      ? 'Static secret with no recorded rotation (never rotated).'
      : `Static secret last rotated ${n.lastRotatedDays} days ago (max is ${ROTATION_MAX_DAYS}).`;
  const sev: Severity = n.environment === 'prod' ? 'high' : 'medium';
  return finding(
    n,
    'NHI7:2025',
    sev,
    evidence,
    'Rotate now and automate rotation; prefer short-lived, auto-issued credentials.'
  );
}

// NHI8: Environment Isolation
export function checkEnvironmentIsolation(n: Nhi): Finding | null {
  if (n.sharedAcrossEnv) {
    return finding(
      n,
      'NHI8:2025',
      'high',
      'Same identity/credential is used across production and non-production.',
      'Split into per-environment identities so a non-prod compromise cannot reach prod.'
    );
  }
  return null;
}

// NHI9: NHI Reuse
export function checkReuse(n: Nhi): Finding | null {
  if (n.isReused) {
    return finding(
      n,
      'NHI9:2025',
      'medium',
      `Shared across ${n.usedBy.length} workloads: ${n.usedBy.join(', ')}.`,
      'Issue a dedicated identity per workload to restore least privilege and attribution.'
    );
  }
  return null;
}

// NHI10: Human Use of NHI
export function checkHumanUse(n: Nhi): Finding | null {
  if (n.humanUsed) {
    return finding(
      n,
      'NHI10:2025',
      'high',
      'A human authenticates interactively with this non-human identity.',
      'Give humans their own identities; reserve this NHI for automation and block interactive login.'
    );
  }
  return null;
}

/** Ordered list of posture checks. Each fires at most one finding per NHI. */
export const CHECKS: CheckFn[] = [
  checkOffboarding,
  checkSecretLeakage,
  checkThirdParty,
  checkInsecureAuth,
  checkOverprivileged,
  checkDeploymentConfig,
  checkLongLived,
  checkEnvironmentIsolation,
  checkReuse,
  checkHumanUse,
];

/** Every finding this NHI's posture warrants, sorted most-severe first. */
export function runChecks(n: Nhi): Finding[] {
  const findings: Finding[] = [];
  for (const check of CHECKS) {
    const f = check(n);
    if (f) findings.push(f);
  }
  findings.sort(
    (a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || a.owaspId.localeCompare(b.owaspId)
  );
  return findings;
}

// --- Scan orchestration ---------------------------------------------------------

export interface Assessment {
  nhi: Nhi;
  tier: TierResult;
  findings: Finding[];
  /** Blended score: tier weight (crown jewels dominate) plus finding severity. */
  riskScore: number;
}

const TIER_WEIGHT: Record<RiskTier, number> = { 1: 40, 2: 20, 3: 8, 4: 2 };

export function riskScoreOf(tier: RiskTier, findings: Finding[]): number {
  return TIER_WEIGHT[tier] + findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
}

export class ScanResult {
  assessments: Assessment[];

  constructor(assessments: Assessment[]) {
    this.assessments = assessments;
  }

  get total(): number {
    return this.assessments.length;
  }

  get tierCounts(): Record<RiskTier, number> {
    const c: Record<RiskTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const a of this.assessments) c[a.tier.tier] += 1;
    return c;
  }

  get typeCounts(): Record<string, number> {
    const c: Record<string, number> = {};
    for (const a of this.assessments) c[a.nhi.type] = (c[a.nhi.type] ?? 0) + 1;
    return c;
  }

  get owaspCounts(): Record<string, number> {
    const c: Record<string, number> = {};
    for (const a of this.assessments) {
      for (const f of a.findings) c[f.owaspId] = (c[f.owaspId] ?? 0) + 1;
    }
    const sorted: Record<string, number> = {};
    for (const key of Object.keys(c).sort()) sorted[key] = c[key] ?? 0;
    return sorted;
  }

  get findingCount(): number {
    return this.assessments.reduce((sum, a) => sum + a.findings.length, 0);
  }

  get orphaned(): number {
    return this.assessments.filter((a) => a.nhi.isOrphaned).length;
  }

  get longLived(): number {
    return this.assessments.filter((a) => a.nhi.isLongLived).length;
  }

  get byRisk(): Assessment[] {
    return [...this.assessments].sort((a, b) => b.riskScore - a.riskScore || a.nhi.id.localeCompare(b.nhi.id));
  }
}

export function scan(fleet: Fleet): ScanResult {
  const assessments: Assessment[] = fleet.identities.map((nhi) => {
    const tier = assess(nhi);
    const findings = runChecks(nhi);
    return { nhi, tier, findings, riskScore: riskScoreOf(tier.tier, findings) };
  });
  return new ScanResult(assessments);
}

// --- Ingest ----------------------------------------------------------------------

export interface InventoryInput {
  identities?: unknown;
  [key: string]: unknown;
}

/**
 * Load an inventory into a Fleet. The inventory is a list of NHI records, or an
 * object with an `identities` key. Unknown enum values fall back to a safe
 * default and unknown fields are ignored, so a partial inventory still loads
 * and assesses.
 */
export function parseFleet(raw: unknown): Fleet {
  let records: unknown = raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as InventoryInput;
    if (Array.isArray(obj.identities)) records = obj.identities;
  }
  if (!Array.isArray(records)) {
    throw new Error("Inventory must be a list of NHI records or an object with 'identities'.");
  }
  const identities = records.map((r) => new Nhi((r ?? {}) as NhiRecord));
  return new Fleet(identities);
}

// --- Report rendering -------------------------------------------------------------

export interface TierReasonJson {
  rule: string;
  floor: number;
  rationale: string;
}

export interface FindingJson {
  nhi_id: string;
  nhi_name: string;
  owasp_id: string;
  owasp_title: string;
  severity: string;
  evidence: string;
  remediation: string;
}

export interface IdentityReportJson {
  id: string;
  name: string;
  type: string;
  tier: number;
  tier_label: string;
  risk_score: number;
  reasons: TierReasonJson[];
  findings: FindingJson[];
}

export interface ScanReportJson {
  summary: {
    total_identities: number;
    findings: number;
    orphaned: number;
    long_lived_secrets: number;
    tier_counts: Record<string, number>;
    type_counts: Record<string, number>;
    owasp_counts: Record<string, number>;
  };
  identities: IdentityReportJson[];
}

export function reportToJson(result: ScanResult): ScanReportJson {
  return {
    summary: {
      total_identities: result.total,
      findings: result.findingCount,
      orphaned: result.orphaned,
      long_lived_secrets: result.longLived,
      tier_counts: {
        TIER_1: result.tierCounts[1],
        TIER_2: result.tierCounts[2],
        TIER_3: result.tierCounts[3],
        TIER_4: result.tierCounts[4],
      },
      type_counts: result.typeCounts,
      owasp_counts: result.owaspCounts,
    },
    identities: result.byRisk.map((a) => ({
      id: a.nhi.id,
      name: a.nhi.name,
      type: a.nhi.type,
      tier: a.tier.tier,
      tier_label: TIER_LABEL[a.tier.tier],
      risk_score: a.riskScore,
      reasons: a.tier.reasons.map((r) => ({ rule: r.ruleId, floor: r.floor, rationale: r.rationale })),
      findings: a.findings.map((f) => ({
        nhi_id: f.nhiId,
        nhi_name: f.nhiName,
        owasp_id: f.owaspId,
        owasp_title: f.owaspTitle,
        severity: f.severity,
        evidence: f.evidence,
        remediation: f.remediation,
      })),
    })),
  };
}

export function reportToMarkdown(result: ScanResult): string {
  const out: string[] = [];
  out.push('# Non-Human Identity Risk Report\n');

  out.push(
    `**${result.total}** identities · **${result.findingCount}** findings · ` +
      `**${result.orphaned}** orphaned · **${result.longLived}** long-lived secrets\n`
  );

  out.push('## Risk tiers\n');
  out.push('| Tier | Identities |');
  out.push('| --- | ---: |');
  for (const tier of RISK_TIERS) {
    out.push(`| ${TIER_BADGE[tier]} | ${result.tierCounts[tier]} |`);
  }
  out.push('');

  const owaspCounts = result.owaspCounts;
  if (Object.keys(owaspCounts).length > 0) {
    out.push('## OWASP NHI Top 10 findings\n');
    out.push('| OWASP | Title | Count |');
    out.push('| --- | --- | ---: |');
    for (const [code, count] of Object.entries(owaspCounts)) {
      out.push(`| ${code} | ${owaspGet(code).title} | ${count} |`);
    }
    out.push(`\n_Mapped to the [OWASP NHI Top 10](${OWASP_SOURCE_URL})._\n`);
  }

  out.push('## Identities by risk\n');
  for (const a of result.byRisk) {
    const n = a.nhi;
    const owner = n.owner || '_orphaned_';
    out.push(`### ${TIER_BADGE[a.tier.tier]} — ${n.name} \`(${n.type})\``);
    out.push(
      `- **Owner:** ${owner} · **Env:** ${n.environment} · ` +
        `**Privilege:** ${n.privilege} · **Score:** ${a.riskScore}`
    );
    out.push(`- **Why this tier:** ${a.tier.topRationale}`);
    if (a.findings.length > 0) {
      out.push('- **Findings:**');
      for (const f of a.findings) {
        out.push(
          `  - \`${f.severity.toUpperCase()}\` **${f.owaspId} ${f.owaspTitle}** — ` +
            `${f.evidence} _→ ${f.remediation}_`
        );
      }
    }
    out.push('');
  }

  return out.join('\n');
}

// --- Reference data (catalog + rule inventory, for GET /nhi/catalog) -------------

export function catalogSummary(): {
  source_url: string;
  thresholds: { rotation_max_days: number; stale_days: number; wildcard_scopes: string[] };
  types: readonly string[];
  privileges: readonly string[];
  credentials: readonly string[];
  owasp: OwaspNhi[];
  rules: { id: string; floor: number; tier_label: string; rationale: string }[];
} {
  return {
    source_url: OWASP_SOURCE_URL,
    thresholds: {
      rotation_max_days: ROTATION_MAX_DAYS,
      stale_days: STALE_DAYS,
      wildcard_scopes: [...WILDCARD_SCOPES],
    },
    types: NHI_TYPES,
    privileges: PRIVILEGES,
    credentials: CREDENTIAL_TYPES,
    owasp: OWASP_CATALOG,
    rules: TIER_RULES.map((r) => ({
      id: r.id,
      floor: r.floor,
      tier_label: TIER_LABEL[r.floor],
      rationale: r.rationale,
    })),
  };
}
