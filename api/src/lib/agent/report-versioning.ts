/**
 * Report versioning — tracks report revisions with diff support.
 * Each synthesis/self-correction creates a new version.
 */

export interface ReportVersion {
  version: number;
  report: string;
  actionCard?: unknown;
  qualityScore: number;
  modelUsed: string;
  reason: string;
  createdAt: string;
}

export interface VersionedReport {
  investigationId: string;
  versions: ReportVersion[];
  currentVersion: number;
}

/**
 * In-memory version tracker for an investigation.
 * Versions are stored in the DO state alongside the report.
 */
export function createVersionedReport(investigationId: string): VersionedReport {
  return {
    investigationId,
    versions: [],
    currentVersion: 0,
  };
}

/**
 * Add a new version to the report.
 */
export function addVersion(
  vr: VersionedReport,
  report: string,
  opts: { actionCard?: unknown; qualityScore: number; modelUsed: string; reason: string }
): VersionedReport {
  const version: ReportVersion = {
    version: vr.versions.length + 1,
    report,
    actionCard: opts.actionCard,
    qualityScore: opts.qualityScore,
    modelUsed: opts.modelUsed,
    reason: opts.reason,
    createdAt: new Date().toISOString(),
  };

  return {
    ...vr,
    versions: [...vr.versions, version],
    currentVersion: version.version,
  };
}

/**
 * Get a specific version of the report.
 */
export function getVersion(vr: VersionedReport, version: number): ReportVersion | null {
  return vr.versions.find((v) => v.version === version) ?? null;
}

/**
 * Get the diff between two versions (line-by-line).
 */
export function getVersionDiff(vr: VersionedReport, from: number, to: number): VersionDiff | null {
  const fromVersion = getVersion(vr, from);
  const toVersion = getVersion(vr, to);
  if (!fromVersion || !toVersion) return null;

  const fromLines = fromVersion.report.split('\n');
  const toLines = toVersion.report.split('\n');

  const diff: DiffLine[] = [];
  const maxLen = Math.max(fromLines.length, toLines.length);

  for (let i = 0; i < maxLen; i++) {
    const fromLine = fromLines[i];
    const toLine = toLines[i];

    if (fromLine === toLine) {
      diff.push({ type: 'unchanged', line: i + 1, content: fromLine ?? '' });
    } else if (fromLine === undefined) {
      diff.push({ type: 'added', line: i + 1, content: toLine ?? '' });
    } else if (toLine === undefined) {
      diff.push({ type: 'removed', line: i + 1, content: fromLine });
    } else {
      diff.push({ type: 'removed', line: i + 1, content: fromLine });
      diff.push({ type: 'added', line: i + 1, content: toLine });
    }
  }

  return {
    fromVersion: from,
    toVersion: to,
    fromScore: fromVersion.qualityScore,
    toScore: toVersion.qualityScore,
    lines: diff,
    additions: diff.filter((d) => d.type === 'added').length,
    deletions: diff.filter((d) => d.type === 'removed').length,
  };
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  line: number;
  content: string;
}

export interface VersionDiff {
  fromVersion: number;
  toVersion: number;
  fromScore: number;
  toScore: number;
  lines: DiffLine[];
  additions: number;
  deletions: number;
}
