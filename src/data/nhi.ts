/**
 * Non-Human Identity (NHI) data layer.
 *
 * - OWASP NHI Top 10 (2025): the ten risk categories with practitioner
 *   summaries, an attack scenario, and a remediation pointer.
 * - NHI types: the kinds of identity an inventory typically tracks.
 *
 * Sources:
 *   - https://owasp.org/www-project-non-human-identities-top-10/
 *   - Common practitioner experience (service-account, OAuth, MCP token).
 */

export interface NhiTopItem {
  id: NhiTopId;
  num: number;
  title: string;
  summary: string;
  attack: string;
  mitigation: string;
  /** Optional MITRE ATT&CK techniques most relevant to this risk. */
  attCK?: string[];
}

export type NhiTopId =
  | 'NHI01'
  | 'NHI02'
  | 'NHI03'
  | 'NHI04'
  | 'NHI05'
  | 'NHI06'
  | 'NHI07'
  | 'NHI08'
  | 'NHI09'
  | 'NHI10';

export const NHI_TOP_10: NhiTopItem[] = [
  {
    id: 'NHI01',
    num: 1,
    title: 'Improper Offboarding',
    summary:
      'NHIs (service accounts, OAuth apps, machine identities) keep working long after the project, person, or vendor that owned them is gone. Without an offboarding path, decommissioned identities accumulate.',
    attack:
      "A former contractor's service account is still authenticating with valid credentials six months after their access was supposedly removed. An attacker with the leaked token rides it into prod with no MFA prompt.",
    mitigation:
      'Tie every NHI to a human owner. On owner offboarding, require explicit re-assignment or revocation. Run quarterly orphan-NHI reports. Set a max idle window (60–90 days) after which NHIs are auto-disabled.',
    attCK: ['T1098', 'T1078.004'],
  },
  {
    id: 'NHI02',
    num: 2,
    title: 'Secret Leakage',
    summary:
      "NHI credentials end up where they shouldn't - committed to git, embedded in client bundles, pasted into logs, dumped from CI variables, exposed in error pages, or printed by a debug endpoint.",
    attack:
      "A developer commits a long-lived AWS access key in a config file, force-pushes to remove it, then opens the repo to public. Bots index the leaked key within minutes; a Bitcoin-mining workload spins up on the team's account.",
    mitigation:
      'Pre-commit secret scanning (gitleaks, trufflehog), CI secret scanning, secret-redaction in logs, ephemeral credentials wherever possible, GitHub secret-scanning + push protection enabled.',
    attCK: ['T1552.001', 'T1552.004'],
  },
  {
    id: 'NHI03',
    num: 3,
    title: 'Vulnerable Third-Party NHI',
    summary:
      "OAuth integrations, SaaS-to-SaaS connectors, vendor service accounts, and MCP servers grant powerful scopes to identities you don't fully control. A breach at the vendor cascades.",
    attack:
      'A productivity SaaS vendor with an OAuth scope of "Read all email, files, calendars" gets breached. The attacker pivots through every customer\'s tenant via the still-valid OAuth tokens.',
    mitigation:
      'Inventory third-party NHIs and their scopes. Apply least-privilege at consent time. Rotate or re-consent on vendor incidents. Use admin-consent + risky-app detection (Entra) and Workspace marketplace reviews.',
    attCK: ['T1528', 'T1199'],
  },
  {
    id: 'NHI04',
    num: 4,
    title: 'Insecure Authentication',
    summary:
      'NHIs that authenticate with shared static secrets, weak hashing, or no transport security. Common in legacy automation and on-prem service accounts where modern auth was never retrofitted.',
    attack:
      'A legacy backup service authenticates over SMB with a domain account and NTLMv1 enabled. An attacker on the network captures and relays the auth, running code as the backup account on a critical file server.',
    mitigation:
      'Workload Identity Federation, SPIFFE/SPIRE for in-cluster, mTLS for service-to-service. For SaaS-to-cloud, OIDC federation instead of long-lived API keys. Disable NTLMv1; enforce SMB signing.',
    attCK: ['T1557.001', 'T1187'],
  },
  {
    id: 'NHI05',
    num: 5,
    title: 'Overprivileged NHI',
    summary:
      'Service accounts, IAM roles, and OAuth apps run with broad scopes "just in case" - Owner / Editor / *.* / wildcard policies. A single compromise becomes a tenant-wide one.',
    attack:
      'The "deploy" service principal in Azure has Owner on the subscription because someone got tired of debugging permission errors. A leaked deploy token gives the attacker full admin.',
    mitigation:
      'Least privilege per workload, per environment. IAM Access Analyzer / Entra Permissions Management to audit unused permissions. Just-in-time elevation for break-glass scenarios. No human-equivalent roles for NHIs.',
    attCK: ['T1098.003', 'T1078.004'],
  },
  {
    id: 'NHI06',
    num: 6,
    title: 'Insecure Cloud Deployment Configurations',
    summary:
      'CI/CD systems, IaC pipelines, and container orchestrators handle huge volumes of NHI material. Misconfigured runners, shared workspaces, public storage, and tflint-disabled-everything pipelines leak NHIs.',
    attack:
      "A self-hosted GitHub Actions runner is reused across repos with public PR builds. A malicious PR exfiltrates the runner's OIDC token + cloud credentials before the build is even reviewed.",
    mitigation:
      'Dedicated runners per trust boundary; never run untrusted PR code on a runner with prod creds. OIDC short-lived tokens instead of static cloud creds. Scan IaC with checkov / tfsec on every PR.',
  },
  {
    id: 'NHI07',
    num: 7,
    title: 'Long-Lived Secrets',
    summary:
      'API keys, signing keys, refresh tokens, and certificates that have been rotated zero times in years. Any compromise from any past timeframe is still valid today.',
    attack:
      'A 4-year-old PAT used for nightly backups was leaked in a 2022 incident the team forgot about. The PAT is still valid; the attacker uses it to enumerate every repo and exfiltrate IP.',
    mitigation:
      'Mandatory rotation cadence per credential class (e.g. PATs ≤ 90 days, signing keys ≤ 12 months). Rotation playbooks tested quarterly. Prefer dynamic / short-lived credentials wherever the platform supports it.',
  },
  {
    id: 'NHI08',
    num: 8,
    title: 'Environment Isolation',
    summary:
      'NHIs that span environments (dev/staging/prod) erase the blast-radius boundary you thought you had. A staging compromise becomes a prod incident.',
    attack:
      'A "dev" service account also has read access to a prod KMS key for "just-in-case debugging". A typo exposes dev to the internet; the prod key is now in the attacker\'s hands.',
    mitigation:
      'Separate identity per environment, per workload. No cross-environment role assumption. Tenant isolation in shared platforms; separate AWS accounts / GCP projects / Azure subscriptions per environment.',
  },
  {
    id: 'NHI09',
    num: 9,
    title: 'NHI Reuse',
    summary:
      'The same identity (token, key, account) is shared across multiple workloads or services. Compromise of any consumer compromises every consumer.',
    attack:
      'A single API key is used by the mobile app, the web app, the cron jobs, and the partner integration. The mobile app gets reverse-engineered; the leaked key now needs to be rotated everywhere at once, with downtime everywhere.',
    mitigation:
      'One workload, one identity. Per-service tokens. SPIFFE/SPIRE-style identity per workload. If sharing is unavoidable, scope tightly + rotate as a unit.',
  },
  {
    id: 'NHI10',
    num: 10,
    title: 'Human Use of NHI',
    summary:
      'Engineers, ops, and on-call staff use service-account credentials for day-to-day work - for convenience, debugging, or because the per-human IAM is too painful. Audit trails collapse to a single non-human identity.',
    attack:
      'An incident involves a deletion that wiped customer data. The audit log shows the action came from "deploy-bot". The team can\'t determine which on-call engineer ran it; nobody is accountable.',
    mitigation:
      'Human IAM that is good enough that nobody needs to su to a service account. Block interactive logins on service accounts (no shell, no MFA flow). Just-in-time human elevation with full audit trail.',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// NHI types - the kinds of identity an inventory tracks
// ─────────────────────────────────────────────────────────────────────────

export type NhiType =
  | 'service-account'
  | 'oauth-app'
  | 'api-key'
  | 'pat'
  | 'cloud-iam-role'
  | 'machine-cert'
  | 'mcp-token'
  | 'webhook-secret'
  | 'rpa-bot'
  | 'workload-identity';

export const NHI_TYPES: { id: NhiType; label: string; example: string }[] = [
  { id: 'service-account', label: 'Service Account', example: 'AD service account, GCP SA, Linux daemon user' },
  { id: 'oauth-app', label: 'OAuth App', example: 'Google Workspace OAuth client, Entra app registration' },
  { id: 'api-key', label: 'API Key', example: 'Stripe sk_live_…, OpenAI sk-…, vendor X-API-Key header' },
  { id: 'pat', label: 'Personal Access Token', example: 'GitHub ghp_…, GitLab glpat-…, Azure DevOps PAT' },
  {
    id: 'cloud-iam-role',
    label: 'Cloud IAM Role',
    example: 'AWS IAM role, Azure managed identity, GCP service account',
  },
  { id: 'machine-cert', label: 'Machine Certificate', example: 'mTLS client cert, code-signing cert' },
  { id: 'mcp-token', label: 'MCP Server Token', example: 'Token authenticating an MCP client to a remote MCP server' },
  { id: 'webhook-secret', label: 'Webhook Secret', example: 'GitHub webhook secret, Stripe webhook signing secret' },
  { id: 'rpa-bot', label: 'RPA Bot', example: 'UiPath robot, Power Automate flow, Selenium runner' },
  {
    id: 'workload-identity',
    label: 'Workload Identity',
    example: 'GKE workload identity, AWS IRSA, Azure pod-managed identity',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Inventory entry shape (persisted to localStorage)
// ─────────────────────────────────────────────────────────────────────────

export type CoverageStatus = 'unset' | 'covered' | 'partial' | 'gap' | 'na';

export interface NhiEntry {
  id: string; // uuid-ish
  name: string;
  type: NhiType;
  owner: string;
  scope: string;
  /** ISO date, or '' if unknown. */
  lastRotated: string;
  /** Rotation cadence in days, or 0 if never / unknown. */
  rotationDays: number;
  monitored: boolean;
  storage: string; // env var, secrets manager name, etc.
  notes: string;
  /** Per-Top-10 status. Missing keys default to 'unset'. */
  status: Partial<Record<NhiTopId, CoverageStatus>>;
}

export function emptyEntry(): NhiEntry {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name: '',
    type: 'service-account',
    owner: '',
    scope: '',
    lastRotated: '',
    rotationDays: 0,
    monitored: false,
    storage: '',
    notes: '',
    status: {},
  };
}

/** Compute risk score 0–100 for an entry from per-Top-10 status. */
export function entryRisk(e: NhiEntry): { score: number; grade: 'safe' | 'low' | 'medium' | 'high' | 'critical' } {
  const weights: Record<NhiTopId, number> = {
    NHI01: 10,
    NHI02: 14,
    NHI03: 10,
    NHI04: 8,
    NHI05: 14,
    NHI06: 8,
    NHI07: 12,
    NHI08: 8,
    NHI09: 8,
    NHI10: 8,
  };
  let score = 0;
  for (const item of NHI_TOP_10) {
    const s = e.status[item.id] ?? 'unset';
    const w = weights[item.id];
    if (s === 'gap') score += w;
    else if (s === 'partial') score += w * 0.5;
    else if (s === 'unset') score += w * 0.3; // unknown = partial credit toward risk
  }
  score = Math.min(100, Math.round(score));
  const grade = score >= 75 ? 'critical' : score >= 55 ? 'high' : score >= 30 ? 'medium' : score >= 10 ? 'low' : 'safe';
  return { score, grade };
}
