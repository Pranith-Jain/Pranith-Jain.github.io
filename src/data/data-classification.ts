/**
 * Data classification & handling templater.
 *
 * Default scheme is the conventional 4-tier (Public / Internal /
 * Confidential / Restricted). Per-tier handling rules are paired with each
 * dataset in the inventory; the matrix view renders the cross-product.
 *
 * All state lives in localStorage. No network round trips.
 */

export type Tier = 'public' | 'internal' | 'confidential' | 'restricted';

export const TIERS: Tier[] = ['public', 'internal', 'confidential', 'restricted'];

export const TIER_LABELS: Record<Tier, string> = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  restricted: 'Restricted',
};

export const TIER_STYLES: Record<Tier, string> = {
  public: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  internal: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  confidential: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  restricted: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
};

export interface TierPolicy {
  tier: Tier;
  description: string;
  encryptionAtRest: 'optional' | 'required' | 'required-customer-key';
  encryptionInTransit: 'optional' | 'required';
  access: string;
  retentionMonths: number | 'indefinite';
  externalSharing: 'allowed' | 'allowed-with-approval' | 'denied';
  auditLogging: 'recommended' | 'required';
  geoRestriction: 'none' | 'region-locked';
  dlp: 'monitor-only' | 'warn-and-allow' | 'block';
  examples: string[];
}

/** Default policy template — editable in localStorage by the user. */
export const DEFAULT_POLICIES: Record<Tier, TierPolicy> = {
  public: {
    tier: 'public',
    description:
      'Information already published or intended for public consumption. Loss has no confidentiality impact; integrity / availability still matter.',
    encryptionAtRest: 'optional',
    encryptionInTransit: 'optional',
    access: 'Anyone, including unauthenticated users.',
    retentionMonths: 'indefinite',
    externalSharing: 'allowed',
    auditLogging: 'recommended',
    geoRestriction: 'none',
    dlp: 'monitor-only',
    examples: ['Marketing site copy', 'Press releases', 'Open-source contributions', 'Published documentation'],
  },
  internal: {
    tier: 'internal',
    description:
      'Information for internal use across the organisation. Disclosure would not cause material harm but is undesirable.',
    encryptionAtRest: 'required',
    encryptionInTransit: 'required',
    access: 'Authenticated employees and contractors with active access.',
    retentionMonths: 36,
    externalSharing: 'allowed-with-approval',
    auditLogging: 'recommended',
    geoRestriction: 'none',
    dlp: 'warn-and-allow',
    examples: ['Internal wiki', 'Org charts', 'Architecture documents', 'Team OKRs'],
  },
  confidential: {
    tier: 'confidential',
    description:
      'Information that would harm the organisation, partners, or customers if disclosed. Limited to those with a need-to-know.',
    encryptionAtRest: 'required',
    encryptionInTransit: 'required',
    access: 'Need-to-know — explicit access grant; reviewed quarterly.',
    retentionMonths: 24,
    externalSharing: 'allowed-with-approval',
    auditLogging: 'required',
    geoRestriction: 'region-locked',
    dlp: 'warn-and-allow',
    examples: ['Customer lists', 'Source code', 'Financials before publication', 'Vendor contracts'],
  },
  restricted: {
    tier: 'restricted',
    description:
      'Regulated or otherwise highly sensitive — PII / PHI / PCI / secrets / IP-critical material. Disclosure is a notifiable event.',
    encryptionAtRest: 'required-customer-key',
    encryptionInTransit: 'required',
    access: 'Strictly need-to-know with explicit business justification; logged + alertable.',
    retentionMonths: 12,
    externalSharing: 'denied',
    auditLogging: 'required',
    geoRestriction: 'region-locked',
    dlp: 'block',
    examples: [
      'PII / PHI / PCI cardholder data',
      'Encryption keys & secrets',
      'Pre-disclosure security findings',
      'Regulated health records',
    ],
  },
};

export type DatasetType =
  | 'app-database'
  | 'analytics-warehouse'
  | 'object-store'
  | 'message-broker'
  | 'document-store'
  | 'log-archive'
  | 'backup'
  | 'ai-training-corpus'
  | 'shared-drive'
  | 'other';

export const DATASET_TYPES: { id: DatasetType; label: string }[] = [
  { id: 'app-database', label: 'Application database' },
  { id: 'analytics-warehouse', label: 'Analytics warehouse' },
  { id: 'object-store', label: 'Object store (S3 / GCS / blob)' },
  { id: 'message-broker', label: 'Message broker / queue' },
  { id: 'document-store', label: 'Document store / SaaS' },
  { id: 'log-archive', label: 'Log archive' },
  { id: 'backup', label: 'Backup / DR copy' },
  { id: 'ai-training-corpus', label: 'AI training / fine-tuning corpus' },
  { id: 'shared-drive', label: 'Shared drive / fileshare' },
  { id: 'other', label: 'Other' },
];

export interface Dataset {
  id: string;
  name: string;
  type: DatasetType;
  tier: Tier;
  owner: string;
  storage: string;
  /** Free-text — describes what the dataset contains. */
  contents: string;
  /** Volume — rough size or row count. */
  volume: string;
  /** Geographic / data-residency note. */
  region: string;
  notes: string;
}

export function emptyDataset(): Dataset {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name: '',
    type: 'app-database',
    tier: 'internal',
    owner: '',
    storage: '',
    contents: '',
    volume: '',
    region: '',
    notes: '',
  };
}

export interface ClassificationState {
  policies: Record<Tier, TierPolicy>;
  datasets: Dataset[];
}

export const STORAGE_KEY = 'dfir.dataclass.v1';

export function emptyState(): ClassificationState {
  return { policies: { ...DEFAULT_POLICIES }, datasets: [] };
}

export function loadState(): ClassificationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<ClassificationState>;
    return {
      policies: { ...DEFAULT_POLICIES, ...(parsed.policies ?? {}) },
      datasets: parsed.datasets ?? [],
    };
  } catch {
    return emptyState();
  }
}

export function distributionByTier(s: ClassificationState): Record<Tier, number> {
  const out: Record<Tier, number> = { public: 0, internal: 0, confidential: 0, restricted: 0 };
  for (const d of s.datasets) out[d.tier]++;
  return out;
}

export function buildMarkdown(s: ClassificationState): string {
  const lines: string[] = ['# Data Classification & Inventory', ''];

  lines.push('## Tier policies', '');
  for (const t of TIERS) {
    const p = s.policies[t];
    lines.push(`### ${TIER_LABELS[t]}`);
    lines.push('');
    lines.push(`> ${p.description}`);
    lines.push('');
    lines.push(`- **Access:** ${p.access}`);
    lines.push(`- **Encryption at rest:** ${p.encryptionAtRest}`);
    lines.push(`- **Encryption in transit:** ${p.encryptionInTransit}`);
    lines.push(`- **Retention:** ${p.retentionMonths === 'indefinite' ? 'indefinite' : `${p.retentionMonths} months`}`);
    lines.push(`- **External sharing:** ${p.externalSharing}`);
    lines.push(`- **Audit logging:** ${p.auditLogging}`);
    lines.push(`- **Geographic restriction:** ${p.geoRestriction}`);
    lines.push(`- **DLP:** ${p.dlp}`);
    lines.push(`- **Examples:** ${p.examples.join(', ')}`);
    lines.push('');
  }

  lines.push('## Dataset inventory', '');
  if (s.datasets.length === 0) {
    lines.push('_(no datasets)_');
  } else {
    for (const d of s.datasets) {
      lines.push(`### ${d.name || '(unnamed)'} — ${TIER_LABELS[d.tier]}`);
      lines.push('');
      lines.push(`- **Type:** ${d.type}`);
      if (d.owner) lines.push(`- **Owner:** ${d.owner}`);
      if (d.storage) lines.push(`- **Storage:** ${d.storage}`);
      if (d.contents) lines.push(`- **Contents:** ${d.contents}`);
      if (d.volume) lines.push(`- **Volume:** ${d.volume}`);
      if (d.region) lines.push(`- **Region:** ${d.region}`);
      if (d.notes) lines.push(`- **Notes:** ${d.notes}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
