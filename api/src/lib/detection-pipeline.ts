/**
 * Detection-as-Code Pipeline
 *
 * Manages detection rules (YARA, Sigma, Snort/Suricata) with:
 *   - Versioning: git-like history with diff support
 *   - Testing: validate rules against sample datasets
 *   - Coverage mapping: MITRE ATT&CK technique coverage tracking
 *   - False positive tracking per rule
 *   - Deployment status (draft → testing → production → retired)
 *
 * Storage: Rules are stored in KV with version history in D1.
 *
 * Usage:
 *   import { createRule, testRule, getCoverage } from '../lib/detection-pipeline';
 */

// ── Types ────────────────────────────────────────────────────────

export type RuleFormat = 'yara' | 'sigma' | 'snort' | 'suricata';
export type RuleStatus = 'draft' | 'testing' | 'production' | 'retired' | 'disabled';

export interface DetectionRule {
  id: string;
  name: string;
  format: RuleFormat;
  status: RuleStatus;
  content: string;
  description: string;
  author: string;
  /** MITRE ATT&CK technique IDs this rule covers. */
  mitreIds: string[];
  /** Tags for categorization (malware family, campaign, sector). */
  tags: string[];
  /** Target file types or log sources. */
  targets: string[];
  /** Version number (auto-incremented). */
  version: number;
  /** SHA-256 hash of the rule content for change detection. */
  hash: string;
  /** False positive count (incremented by analysts). */
  falsePositiveCount: number;
  /** True positive count (confirmed detections). */
  truePositiveCount: number;
  /** Last tested timestamp. */
  lastTested?: string;
  /** Test results. */
  lastTestResult?: RuleTestResult;
  /** Creation timestamp. */
  createdAt: string;
  /** Last modification timestamp. */
  updatedAt: string;
  /** Who last modified this rule. */
  updatedBy: string;
}

export interface RuleTestResult {
  passed: boolean;
  /** Number of test samples that matched. */
  matches: number;
  /** Total test samples. */
  totalSamples: number;
  /** False positive samples that incorrectly matched. */
  falsePositives: number;
  /** Execution time in milliseconds. */
  executionMs: number;
  /** Error message if test failed to execute. */
  error?: string;
  /** Test timestamp. */
  testedAt: string;
}

export interface RuleVersion {
  ruleId: string;
  version: number;
  content: string;
  hash: string;
  changedBy: string;
  changedAt: string;
  changeNote?: string;
}

export interface CoverageReport {
  /** Total rules in production. */
  totalRules: number;
  /** Rules per format. */
  byFormat: Record<RuleFormat, number>;
  /** ATT&CK technique coverage. */
  techniqueCoverage: Array<{
    techniqueId: string;
    techniqueName: string;
    ruleCount: number;
    rules: string[];
  }>;
  /** Techniques with no coverage. */
  gaps: Array<{ techniqueId: string; techniqueName: string }>;
  /** Overall coverage percentage. */
  coveragePercent: number;
}

// ── Rule Validation ──────────────────────────────────────────────

/**
 * Basic YARA rule syntax validation.
 * Checks for balanced braces, required sections, and proper structure.
 */
export function validateYaraRule(rule: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for required 'rule' keyword
  if (!/\brule\s+\w+/i.test(rule)) {
    errors.push('Missing rule declaration (expected: rule <name> { ... })');
  }

  // Check for balanced braces
  const openBraces = (rule.match(/{/g) ?? []).length;
  const closeBraces = (rule.match(/}/g) ?? []).length;
  if (openBraces !== closeBraces) {
    errors.push(`Unbalanced braces: ${openBraces} opening vs ${closeBraces} closing`);
  }

  // Check for meta section (recommended but not required)
  if (!/meta\s*:/.test(rule)) {
    errors.push('Warning: No meta section — consider adding author, description, date');
  }

  // Check for strings or condition
  if (/strings\s*:/.test(rule) && !/condition\s*:/.test(rule)) {
    errors.push('Has strings section but missing condition section');
  }

  // Check for common syntax errors
  if (/rule\s+\d/.test(rule)) {
    errors.push('Rule name cannot start with a number');
  }

  return { valid: errors.filter((e) => !e.startsWith('Warning')).length === 0, errors };
}

/**
 * Basic Sigma rule validation.
 * Checks for required fields and valid YAML structure.
 */
export function validateSigmaRule(rule: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for required fields
  if (!/title\s*:/i.test(rule)) {
    errors.push('Missing required field: title');
  }
  if (!/detection\s*:/i.test(rule)) {
    errors.push('Missing required section: detection');
  }
  if (!/logsource\s*:/i.test(rule)) {
    errors.push('Missing required section: logsource');
  }

  // Check for condition in detection
  if (/detection\s*:/.test(rule) && !/condition\s*:/i.test(rule)) {
    errors.push('Detection section missing condition');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a detection rule based on its format.
 */
export function validateRule(format: RuleFormat, content: string): { valid: boolean; errors: string[] } {
  switch (format) {
    case 'yara':
      return validateYaraRule(content);
    case 'sigma':
      return validateSigmaRule(content);
    case 'snort':
    case 'suricata':
      // Basic Snort/Suricata validation
      const errors: string[] = [];
      if (!/^(alert|drop|reject|pass)\s+/im.test(content)) {
        errors.push('Missing rule action (expected: alert, drop, reject, or pass)');
      }
      if (!/->\s*\(/.test(content) && !/<>\s*\(/.test(content)) {
        errors.push('Missing rule direction and options');
      }
      return { valid: errors.length === 0, errors };
    default:
      return { valid: false, errors: [`Unknown rule format: ${format}`] };
  }
}

// ── Coverage Analysis ────────────────────────────────────────────

/**
 * Calculate MITRE ATT&CK technique coverage from a set of rules.
 */
export function calculateCoverage(rules: DetectionRule[]): CoverageReport {
  const productionRules = rules.filter((r) => r.status === 'production');
  const byFormat: Record<RuleFormat, number> = { yara: 0, sigma: 0, snort: 0, suricata: 0 };
  for (const rule of productionRules) {
    byFormat[rule.format]++;
  }

  // Build technique coverage map.
  const techniqueMap = new Map<string, { rules: string[] }>();
  for (const rule of productionRules) {
    for (const mitreId of rule.mitreIds) {
      const existing = techniqueMap.get(mitreId) ?? { rules: [] };
      existing.rules.push(rule.name);
      techniqueMap.set(mitreId, existing);
    }
  }

  const techniqueCoverage = [...techniqueMap.entries()].map(([id, data]) => ({
    techniqueId: id,
    techniqueName: id, // Would be enriched from MITRE data
    ruleCount: data.rules.length,
    rules: data.rules,
  }));

  // Known high-priority techniques (subset of ATT&CK Enterprise).
  const highPriorityTechniques = [
    'T1566.001', // Phishing: Spearphishing Attachment
    'T1566.002', // Phishing: Spearphishing Link
    'T1059.001', // Command and Scripting Interpreter: PowerShell
    'T1059.004', // Command and Scripting Interpreter: Unix Shell
    'T1053.005', // Scheduled Task/Job: Scheduled Task
    'T1003.001', // OS Credential Dumping: LSASS Memory
    'T1055',     // Process Injection
    'T1071.001', // Application Layer Protocol: Web Protocols
    'T1071.004', // Application Layer Protocol: DNS
    'T1486',     // Data Encrypted for Impact
    'T1490',     // Inhibit System Recovery
    'T1218.011', // System Binary Proxy Execution: Rundll32
    'T1218.005', // System Binary Proxy Execution: Mshta
  ];

  const coveredTechniques = new Set(techniqueMap.keys());
  const gaps = highPriorityTechniques
    .filter((id) => !coveredTechniques.has(id))
    .map((id) => ({ techniqueId: id, techniqueName: id }));

  const coveragePercent =
    highPriorityTechniques.length > 0
      ? Math.round(((highPriorityTechniques.length - gaps.length) / highPriorityTechniques.length) * 100)
      : 0;

  return {
    totalRules: productionRules.length,
    byFormat,
    techniqueCoverage,
    gaps,
    coveragePercent,
  };
}

// ── Rule Hashing ─────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of rule content for change detection.
 */
export async function hashRule(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray, (b) => b.toString(16).padStart(2, '0')).join('');
}
