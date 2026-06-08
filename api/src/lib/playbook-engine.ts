/**
 * DFIR Playbook Execution Engine
 *
 * DAG-based playbook runner. Each playbook is a directed acyclic graph
 * of steps. Steps can be:
 *   - enrichment: fetch data from a provider
 *   - condition: branch based on data
 *   - action: take automated action (block, notify, create ticket)
 *   - manual: pause for analyst input
 *   - report: generate output
 *
 * Storage: D1 for playbook definitions and execution history.
 */

import type { D1Database } from '@cloudflare/workers-types';

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type StepType = 'enrichment' | 'condition' | 'action' | 'manual' | 'report' | 'delay' | 'transform';
export type PlaybookStatus = 'draft' | 'active' | 'archived';
export type ExecutionStatus = 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting';

export interface PlaybookStep {
  id: string;
  name: string;
  type: StepType;
  config: Record<string, unknown>;
  /** IDs of steps that must complete before this one runs. */
  depends_on: string[];
  /** For condition steps: branches based on eval result. */
  branches?: Array<{
    condition: string;
    next_step: string;
  }>;
  /** Default next step if no branch matches (or for non-condition steps). */
  next_step?: string;
  /** Timeout in seconds. */
  timeout?: number;
  /** Retry count on failure. */
  retries?: number;
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  category: string;
  status: PlaybookStatus;
  steps: PlaybookStep[];
  /** Input schema — what the analyst provides when starting. */
  inputs: Array<{
    name: string;
    type: 'string' | 'ip' | 'domain' | 'hash' | 'url' | 'email' | 'select';
    label: string;
    required: boolean;
    options?: string[];
    default?: string;
  }>;
  tags: string[];
  mitre_techniques: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  execution_count: number;
  avg_duration_seconds: number;
}

export interface PlaybookExecution {
  id: string;
  playbook_id: string;
  status: ExecutionStatus;
  inputs: Record<string, string>;
  context: Record<string, unknown>;
  step_results: Record<string, StepResult>;
  started_at: string;
  completed_at: string | null;
  error: string | null;
  triggered_by: string;
}

export interface StepResult {
  step_id: string;
  status: StepStatus;
  started_at: string;
  completed_at: string | null;
  output: unknown;
  error: string | null;
  duration_ms: number;
  retry_count: number;
}

/* ─── Database Schema ────────────────────────────────────────────────────── */

export const PLAYBOOK_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS playbooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','archived')),
  steps TEXT NOT NULL DEFAULT '[]',
  inputs TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  mitre_techniques TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  execution_count INTEGER NOT NULL DEFAULT 0,
  avg_duration_seconds REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS playbook_executions (
  id TEXT PRIMARY KEY,
  playbook_id TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  inputs TEXT NOT NULL DEFAULT '{}',
  context TEXT NOT NULL DEFAULT '{}',
  step_results TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  error TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_playbooks_status ON playbooks(status);
CREATE INDEX IF NOT EXISTS idx_playbooks_category ON playbooks(category);
CREATE INDEX IF NOT EXISTS idx_playbook_exec_playbook ON playbook_executions(playbook_id);
CREATE INDEX IF NOT EXISTS idx_playbook_exec_status ON playbook_executions(status);
`;

/* ─── ID Generator ───────────────────────────────────────────────────────── */

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ─── Playbook CRUD ──────────────────────────────────────────────────────── */

export async function createPlaybook(
  db: D1Database,
  input: Omit<Playbook, 'id' | 'created_at' | 'updated_at' | 'execution_count' | 'avg_duration_seconds'>,
): Promise<Playbook> {
  const id = genId('pb');
  const now = new Date().toISOString();

  await db.prepare(
    `INSERT INTO playbooks (id, name, description, category, status, steps, inputs, tags, mitre_techniques, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, input.name, input.description, input.category,
    input.status ?? 'draft',
    JSON.stringify(input.steps),
    JSON.stringify(input.inputs),
    JSON.stringify(input.tags),
    JSON.stringify(input.mitre_techniques),
    input.created_by, now, now
  ).run();

  return { ...input, id, created_at: now, updated_at: now, execution_count: 0, avg_duration_seconds: 0 };
}

export async function getPlaybook(db: D1Database, id: string): Promise<Playbook | null> {
  const row = await db.prepare('SELECT * FROM playbooks WHERE id = ?').bind(id).first() as Record<string, unknown> | null;
  if (!row) return null;
  return parsePlaybook(row);
}

export async function listPlaybooks(
  db: D1Database,
  opts: { status?: PlaybookStatus; category?: string; limit?: number; offset?: number } = {}
): Promise<{ playbooks: Playbook[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.status) { conditions.push('status = ?'); params.push(opts.status); }
  if (opts.category) { conditions.push('category = ?'); params.push(opts.category); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const [countResult, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as total FROM playbooks ${where}`).bind(...params).first() as Promise<{ total: number }>,
    db.prepare(`SELECT * FROM playbooks ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all(),
  ]);

  return {
    playbooks: (rows.results as Record<string, unknown>[]).map(parsePlaybook),
    total: countResult.total,
  };
}

export async function updatePlaybook(db: D1Database, id: string, updates: Partial<Playbook>): Promise<Playbook | null> {
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [new Date().toISOString()];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.steps !== undefined) { fields.push('steps = ?'); values.push(JSON.stringify(updates.steps)); }
  if (updates.inputs !== undefined) { fields.push('inputs = ?'); values.push(JSON.stringify(updates.inputs)); }
  if (updates.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(updates.tags)); }
  if (updates.mitre_techniques !== undefined) { fields.push('mitre_techniques = ?'); values.push(JSON.stringify(updates.mitre_techniques)); }

  values.push(id);
  await db.prepare(`UPDATE playbooks SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return getPlaybook(db, id);
}

export async function deletePlaybook(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM playbooks WHERE id = ?').bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}

/* ─── Playbook Execution ─────────────────────────────────────────────────── */

export async function startExecution(
  db: D1Database,
  playbookId: string,
  inputs: Record<string, string>,
  triggeredBy: string
): Promise<PlaybookExecution> {
  const playbook = await getPlaybook(db, playbookId);
  if (!playbook) throw new Error('Playbook not found');
  if (playbook.status !== 'active') throw new Error('Playbook is not active');

  // Validate required inputs
  for (const input of playbook.inputs) {
    if (input.required && !inputs[input.name]) {
      throw new Error(`Missing required input: ${input.name}`);
    }
  }

  const id = genId('exec');
  const now = new Date().toISOString();

  const execution: PlaybookExecution = {
    id,
    playbook_id: playbookId,
    status: 'running',
    inputs,
    context: { ...inputs },
    step_results: {},
    started_at: now,
    completed_at: null,
    error: null,
    triggered_by: triggeredBy,
  };

  await db.prepare(
    `INSERT INTO playbook_executions (id, playbook_id, status, inputs, context, step_results, started_at, triggered_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, playbookId, 'running', JSON.stringify(inputs), JSON.stringify(execution.context), '{}', now, triggeredBy).run();

  // Update execution count
  await db.prepare('UPDATE playbooks SET execution_count = execution_count + 1 WHERE id = ?').bind(playbookId).run();

  return execution;
}

export async function getExecution(db: D1Database, id: string): Promise<PlaybookExecution | null> {
  const row = await db.prepare('SELECT * FROM playbook_executions WHERE id = ?').bind(id).first() as Record<string, unknown> | null;
  if (!row) return null;
  return parseExecution(row);
}

export async function listExecutions(
  db: D1Database,
  playbookId: string,
  limit = 20
): Promise<PlaybookExecution[]> {
  const rows = await db.prepare(
    'SELECT * FROM playbook_executions WHERE playbook_id = ? ORDER BY started_at DESC LIMIT ?'
  ).bind(playbookId, limit).all();
  return (rows.results as Record<string, unknown>[]).map(parseExecution);
}

export async function updateExecutionStatus(
  db: D1Database,
  executionId: string,
  status: ExecutionStatus,
  error?: string
): Promise<void> {
  const completedAt = ['completed', 'failed', 'cancelled'].includes(status) ? new Date().toISOString() : null;
  await db.prepare(
    'UPDATE playbook_executions SET status = ?, error = ?, completed_at = ? WHERE id = ?'
  ).bind(status, error ?? null, completedAt, executionId).run();
}

export async function updateStepResult(
  db: D1Database,
  executionId: string,
  stepId: string,
  result: StepResult
): Promise<void> {
  const row = await db.prepare('SELECT step_results FROM playbook_executions WHERE id = ?').bind(executionId).first() as { step_results: string } | null;
  if (!row) return;

  const results: Record<string, StepResult> = JSON.parse(row.step_results);
  results[stepId] = result;

  await db.prepare('UPDATE playbook_executions SET step_results = ?, context = ? WHERE id = ?')
    .bind(JSON.stringify(results), JSON.stringify({}), executionId).run();
}

export async function updateExecutionContext(
  db: D1Database,
  executionId: string,
  context: Record<string, unknown>
): Promise<void> {
  await db.prepare('UPDATE playbook_executions SET context = ? WHERE id = ?')
    .bind(JSON.stringify(context), executionId).run();
}

/* ─── Step Execution Logic ───────────────────────────────────────────────── */

export async function executeStep(
  step: PlaybookStep,
  context: Record<string, unknown>,
  env: Env
): Promise<{ output: unknown; next_step?: string }> {
  const startTime = Date.now();

  switch (step.type) {
    case 'enrichment':
      return executeEnrichment(step, context, env);
    case 'condition':
      return executeCondition(step, context);
    case 'action':
      return executeAction(step, context, env);
    case 'transform':
      return executeTransform(step, context);
    case 'delay':
      return executeDelay(step);
    case 'report':
      return executeReport(step, context);
    case 'manual':
      return { output: { status: 'waiting_for_input', step: step.name }, next_step: undefined };
    default:
      throw new Error(`Unknown step type: ${step.type}`);
  }
}

async function executeEnrichment(
  step: PlaybookStep,
  context: Record<string, unknown>,
  env: Env
): Promise<{ output: unknown }> {
  const { provider, indicator, indicator_type } = step.config;
  const value = interpolate(String(indicator), context);

  // Route to the appropriate provider based on config
  const baseUrl = '/api/v1';
  let url = '';

  switch (provider) {
    case 'virustotal':
      url = `${baseUrl}/ioc/check?indicator=${encodeURIComponent(value)}`;
      break;
    case 'shodan':
      url = `${baseUrl}/ioc/check?indicator=${encodeURIComponent(value)}`;
      break;
    case 'abuseipdb':
      url = `${baseUrl}/ioc/check?indicator=${encodeURIComponent(value)}`;
      break;
    default:
      url = `${baseUrl}/ioc/check?indicator=${encodeURIComponent(value)}`;
  }

  try {
    const res = await env.ASSETS.fetch(new Request(`https://placeholder${url}`));
    const data = await res.json();
    return { output: data };
  } catch (e) {
    return { output: { error: (e as Error).message } };
  }
}

function executeCondition(
  step: PlaybookStep,
  context: Record<string, unknown>
): { output: unknown; next_step?: string } {
  const { field, operator, value } = step.config;
  const fieldValue = getNestedValue(context, String(field));

  let result = false;
  switch (operator) {
    case 'equals':
      result = fieldValue === value;
      break;
    case 'not_equals':
      result = fieldValue !== value;
      break;
    case 'contains':
      result = String(fieldValue).includes(String(value));
      break;
    case 'greater_than':
      result = Number(fieldValue) > Number(value);
      break;
    case 'less_than':
      result = Number(fieldValue) < Number(value);
      break;
    case 'exists':
      result = fieldValue !== undefined && fieldValue !== null;
      break;
    case 'matches':
      result = new RegExp(String(value)).test(String(fieldValue));
      break;
  }

  // Find matching branch
  if (step.branches) {
    for (const branch of step.branches) {
      if (evaluateCondition(branch.condition, context)) {
        return { output: { matched: true, condition: branch.condition }, next_step: branch.next_step };
      }
    }
  }

  return { output: { matched: result }, next_step: step.next_step };
}

async function executeAction(
  step: PlaybookStep,
  context: Record<string, unknown>,
  env: Env
): Promise<{ output: unknown }> {
  const { action_type, ...params } = step.config;

  switch (action_type) {
    case 'notify':
      // Queue notification
      return { output: { notified: true, channel: params.channel, message: interpolate(String(params.message), context) } };
    case 'block_ip':
      // Would integrate with firewall/WAF
      return { output: { blocked: true, ip: interpolate(String(params.ip), context) } };
    case 'create_case':
      // Would create a case in the case manager
      return { output: { case_created: true, title: interpolate(String(params.title), context) } };
    case 'tag_ioc':
      return { output: { tagged: true, tags: params.tags } };
    default:
      return { output: { action: action_type, params } };
  }
}

function executeTransform(step: PlaybookStep, context: Record<string, unknown>): { output: unknown } {
  const { source_field, target_field, transform } = step.config;
  const value = getNestedValue(context, String(source_field));

  let transformed: unknown;
  switch (transform) {
    case 'uppercase':
      transformed = String(value).toUpperCase();
      break;
    case 'lowercase':
      transformed = String(value).toLowerCase();
      break;
    case 'extract_domain':
      try { transformed = new URL(String(value)).hostname; } catch { transformed = value; }
      break;
    case 'extract_ip':
      transformed = String(value).match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)?.[0] ?? value;
      break;
    case 'hash_sha256':
      // Would need crypto.subtle in worker context
      transformed = value;
      break;
    default:
      transformed = value;
  }

  return { output: { [String(target_field)]: transformed } };
}

async function executeDelay(step: PlaybookStep): Promise<{ output: unknown }> {
  const seconds = Number(step.config.seconds ?? 0);
  if (seconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
  return { output: { delayed_seconds: seconds } };
}

function executeReport(step: PlaybookStep, context: Record<string, unknown>): { output: unknown } {
  const { format, template } = step.config;
  const content = interpolate(String(template), context);
  return { output: { format, content, generated_at: new Date().toISOString() } };
}

/* ─── Utility Functions ──────────────────────────────────────────────────── */

function interpolate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path: string) => {
    const value = getNestedValue(context, path);
    return value !== undefined ? String(value) : `{{${path}}}`;
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
  // Simple condition evaluation: "field operator value"
  const match = condition.match(/^(\S+)\s+(equals|not_equals|contains|gt|lt|exists|matches)\s+(.+)$/);
  if (!match) return false;

  const [, field, operator, value] = match;
  const fieldValue = getNestedValue(context, field);

  switch (operator) {
    case 'equals': return String(fieldValue) === value;
    case 'not_equals': return String(fieldValue) !== value;
    case 'contains': return String(fieldValue).includes(value);
    case 'gt': return Number(fieldValue) > Number(value);
    case 'lt': return Number(fieldValue) < Number(value);
    case 'exists': return fieldValue !== undefined && fieldValue !== null;
    case 'matches': return new RegExp(value).test(String(fieldValue));
    default: return false;
  }
}

/* ─── Parsers ────────────────────────────────────────────────────────────── */

function safeJson<T>(val: unknown, fallback: T): T {
  try { return JSON.parse(val as string) as T; } catch { return fallback; }
}

function parsePlaybook(r: Record<string, unknown>): Playbook {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    category: r.category as string,
    status: r.status as PlaybookStatus,
    steps: safeJson(r.steps, []),
    inputs: safeJson(r.inputs, []),
    tags: safeJson(r.tags, []),
    mitre_techniques: safeJson(r.mitre_techniques, []),
    created_by: r.created_by as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    execution_count: r.execution_count as number,
    avg_duration_seconds: r.avg_duration_seconds as number,
  };
}

function parseExecution(r: Record<string, unknown>): PlaybookExecution {
  return {
    id: r.id as string,
    playbook_id: r.playbook_id as string,
    status: r.status as ExecutionStatus,
    inputs: JSON.parse(r.inputs as string) as Record<string, string>,
    context: JSON.parse(r.context as string) as Record<string, unknown>,
    step_results: JSON.parse(r.step_results as string) as Record<string, StepResult>,
    started_at: r.started_at as string,
    completed_at: r.completed_at as string | null,
    error: r.error as string | null,
    triggered_by: r.triggered_by as string,
  };
}

/* ─── Pre-built Playbook Templates ───────────────────────────────────────── */

export const PLAYBOOK_TEMPLATES: Array<Omit<Playbook, 'id' | 'created_at' | 'updated_at' | 'execution_count' | 'avg_duration_seconds'>> = [
  {
    name: 'Phishing Response',
    description: 'Automated phishing email investigation and response playbook',
    category: 'incident-response',
    status: 'active',
    inputs: [
      { name: 'email_address', type: 'email', label: 'Recipient Email', required: true },
      { name: 'sender_email', type: 'email', label: 'Sender Email', required: true },
      { name: 'subject', type: 'string', label: 'Email Subject', required: true },
      { name: 'urls', type: 'string', label: 'URLs in Email (comma-separated)', required: false },
      { name: 'attachments', type: 'string', label: 'Attachment Hashes (comma-separated)', required: false },
    ],
    steps: [
      { id: 'extract_iocs', name: 'Extract IOCs', type: 'transform', config: { source_field: 'sender_email', target_field: 'sender_domain', transform: 'extract_domain' }, depends_on: [] },
      { id: 'check_sender_rep', name: 'Check Sender Reputation', type: 'enrichment', config: { provider: 'virustotal', indicator: '{{sender_email}}' }, depends_on: ['extract_iocs'] },
      { id: 'check_domain_rep', name: 'Check Domain Reputation', type: 'enrichment', config: { provider: 'virustotal', indicator: '{{sender_domain}}' }, depends_on: ['extract_iocs'] },
      { id: 'check_urls', name: 'Check URLs', type: 'enrichment', config: { provider: 'virustotal', indicator: '{{urls}}' }, depends_on: [], timeout: 30 },
      { id: 'assess_threat', name: 'Assess Threat Level', type: 'condition', config: { field: 'check_sender_rep.output.reputation', operator: 'greater_than', value: '50' }, depends_on: ['check_sender_rep', 'check_domain_rep'], branches: [{ condition: 'check_sender_rep.output.reputation gt 50', next_step: 'block_sender' }] },
      { id: 'block_sender', name: 'Block Sender', type: 'action', config: { action_type: 'block_ip', ip: '{{sender_email}}' }, depends_on: ['assess_threat'] },
      { id: 'create_case', name: 'Create IR Case', type: 'action', config: { action_type: 'create_case', title: 'Phishing: {{subject}}' }, depends_on: ['assess_threat'] },
      { id: 'notify_soc', name: 'Notify SOC', type: 'action', config: { action_type: 'notify', channel: 'email', message: 'Phishing detected from {{sender_email}}' }, depends_on: ['create_case'] },
      { id: 'generate_report', name: 'Generate Report', type: 'report', config: { format: 'markdown', template: '# Phishing Investigation Report\n\n**Sender:** {{sender_email}}\n**Subject:** {{subject}}\n**Status:** Investigated' }, depends_on: ['notify_soc'] },
    ],
    tags: ['phishing', 'email', 'incident-response'],
    mitre_techniques: ['T1566', 'T1566.001', 'T1566.002'],
    created_by: 'system',
  },
  {
    name: 'Ransomware Triage',
    description: 'Initial triage and containment for ransomware incidents',
    category: 'incident-response',
    status: 'active',
    inputs: [
      { name: 'affected_host', type: 'string', label: 'Affected Hostname/IP', required: true },
      { name: 'ransomware_family', type: 'string', label: 'Ransomware Family (if known)', required: false },
      { name: 'encrypted_extensions', type: 'string', label: 'Encrypted File Extensions', required: false },
    ],
    steps: [
      { id: 'isolate_host', name: 'Isolate Host', type: 'action', config: { action_type: 'block_ip', ip: '{{affected_host}}' }, depends_on: [] },
      { id: 'check_family', name: 'Check Ransomware Family', type: 'enrichment', config: { provider: 'malwarebazaar', indicator: '{{ransomware_family}}' }, depends_on: [] },
      { id: 'check_decryption', name: 'Check for Decryptor', type: 'enrichment', config: { provider: 'nomoreransom', indicator: '{{ransomware_family}}' }, depends_on: ['check_family'] },
      { id: 'create_case', name: 'Create IR Case', type: 'action', config: { action_type: 'create_case', title: 'Ransomware: {{ransomware_family}} on {{affected_host}}' }, depends_on: [] },
      { id: 'notify_leadership', name: 'Notify Leadership', type: 'action', config: { action_type: 'notify', channel: 'email', message: 'Ransomware incident on {{affected_host}}' }, depends_on: ['create_case'] },
      { id: 'generate_report', name: 'Generate Triage Report', type: 'report', config: { format: 'markdown', template: '# Ransomware Triage\n\n**Host:** {{affected_host}}\n**Family:** {{ransomware_family}}' }, depends_on: ['check_decryption', 'notify_leadership'] },
    ],
    tags: ['ransomware', 'incident-response', 'containment'],
    mitre_techniques: ['T1486', 'T1490', 'T1071'],
    created_by: 'system',
  },
  {
    name: 'IOC Enrichment Pipeline',
    description: 'Bulk IOC enrichment across multiple threat intel sources',
    category: 'enrichment',
    status: 'active',
    inputs: [
      { name: 'ioc_value', type: 'string', label: 'IOC Value (IP, domain, hash, URL)', required: true },
      { name: 'ioc_type', type: 'select', label: 'IOC Type', required: true, options: ['ip', 'domain', 'hash', 'url'] },
    ],
    steps: [
      { id: 'enrich_vt', name: 'VirusTotal Check', type: 'enrichment', config: { provider: 'virustotal', indicator: '{{ioc_value}}' }, depends_on: [] },
      { id: 'enrich_abuseipdb', name: 'AbuseIPDB Check', type: 'enrichment', config: { provider: 'abuseipdb', indicator: '{{ioc_value}}' }, depends_on: [] },
      { id: 'enrich_shodan', name: 'Shodan Check', type: 'enrichment', config: { provider: 'shodan', indicator: '{{ioc_value}}' }, depends_on: [] },
      { id: 'enrich_otx', name: 'OTX Check', type: 'enrichment', config: { provider: 'otx', indicator: '{{ioc_value}}' }, depends_on: [] },
      { id: 'correlate', name: 'Correlate Results', type: 'transform', config: { source_field: 'enrich_vt.output', target_field: 'correlated', transform: 'identity' }, depends_on: ['enrich_vt', 'enrich_abuseipdb', 'enrich_shodan', 'enrich_otx'] },
      { id: 'generate_report', name: 'Generate Enrichment Report', type: 'report', config: { format: 'markdown', template: '# IOC Enrichment: {{ioc_value}}\n\nSee correlated results.' }, depends_on: ['correlate'] },
    ],
    tags: ['enrichment', 'ioc', 'threat-intel'],
    mitre_techniques: [],
    created_by: 'system',
  },
  {
    name: 'BEC Investigation',
    description: 'Business Email Compromise investigation and response',
    category: 'incident-response',
    status: 'active',
    inputs: [
      { name: 'compromised_account', type: 'email', label: 'Compromised Account', required: true },
      { name: 'suspicious_recipient', type: 'email', label: 'Suspicious Recipient', required: true },
      { name: 'amount', type: 'string', label: 'Transaction Amount (if any)', required: false },
    ],
    steps: [
      { id: 'disable_account', name: 'Disable Account', type: 'action', config: { action_type: 'block_ip', ip: '{{compromised_account}}' }, depends_on: [] },
      { id: 'check_recipient', name: 'Check Recipient', type: 'enrichment', config: { provider: 'emailrep', indicator: '{{suspicious_recipient}}' }, depends_on: [] },
      { id: 'create_case', name: 'Create IR Case', type: 'action', config: { action_type: 'create_case', title: 'BEC: {{compromised_account}}' }, depends_on: [] },
      { id: 'notify_finance', name: 'Notify Finance', type: 'action', config: { action_type: 'notify', channel: 'email', message: 'BEC detected - freeze transactions to {{suspicious_recipient}}' }, depends_on: ['create_case'] },
      { id: 'generate_report', name: 'Generate Report', type: 'report', config: { format: 'markdown', template: '# BEC Investigation\n\n**Account:** {{compromised_account}}\n**Recipient:** {{suspicious_recipient}}' }, depends_on: ['notify_finance'] },
    ],
    tags: ['bec', 'email', 'fraud', 'incident-response'],
    mitre_techniques: ['T1566.002', 'T1534'],
    created_by: 'system',
  },
  {
    name: 'Malware Sample Analysis',
    description: 'Automated malware sample triage and enrichment',
    category: 'malware-analysis',
    status: 'active',
    inputs: [
      { name: 'file_hash', type: 'hash', label: 'File Hash (SHA256 preferred)', required: true },
      { name: 'filename', type: 'string', label: 'Original Filename', required: false },
    ],
    steps: [
      { id: 'check_hash', name: 'Check Hash Reputation', type: 'enrichment', config: { provider: 'virustotal', indicator: '{{file_hash}}' }, depends_on: [] },
      { id: 'check_malwarebazaar', name: 'Check MalwareBazaar', type: 'enrichment', config: { provider: 'malwarebazaar', indicator: '{{file_hash}}' }, depends_on: [] },
      { id: 'check_threatfox', name: 'Check ThreatFox', type: 'enrichment', config: { provider: 'threatfox', indicator: '{{file_hash}}' }, depends_on: [] },
      { id: 'assess', name: 'Assess Maliciousness', type: 'condition', config: { field: 'check_hash.output.malicious', operator: 'greater_than', value: '0' }, depends_on: ['check_hash', 'check_malwarebazaar', 'check_threatfox'], branches: [{ condition: 'check_hash.output.malicious gt 0', next_step: 'create_case' }] },
      { id: 'create_case', name: 'Create Malware Case', type: 'action', config: { action_type: 'create_case', title: 'Malware: {{filename}} ({{file_hash}})' }, depends_on: ['assess'] },
      { id: 'generate_report', name: 'Generate Analysis Report', type: 'report', config: { format: 'markdown', template: '# Malware Analysis\n\n**Hash:** {{file_hash}}\n**Filename:** {{filename}}' }, depends_on: ['create_case'] },
    ],
    tags: ['malware', 'analysis', 'enrichment'],
    mitre_techniques: ['T1059', 'T1204'],
    created_by: 'system',
  },
  {
    name: 'Data Breach Assessment',
    description: 'Initial assessment and response for suspected data breach',
    category: 'incident-response',
    status: 'active',
    inputs: [
      { name: 'source_system', type: 'string', label: 'Affected System', required: true },
      { name: 'data_type', type: 'select', label: 'Data Type', required: true, options: ['pii', 'financial', 'healthcare', 'intellectual-property', 'credentials', 'other'] },
      { name: 'estimated_records', type: 'string', label: 'Estimated Records Affected', required: false },
    ],
    steps: [
      { id: 'contain', name: 'Contain System', type: 'action', config: { action_type: 'block_ip', ip: '{{source_system}}' }, depends_on: [] },
      { id: 'create_case', name: 'Create IR Case', type: 'action', config: { action_type: 'create_case', title: 'Data Breach: {{source_system}} ({{data_type}})' }, depends_on: [] },
      { id: 'notify_legal', name: 'Notify Legal', type: 'action', config: { action_type: 'notify', channel: 'email', message: 'Data breach detected - {{data_type}} from {{source_system}}' }, depends_on: ['create_case'] },
      { id: 'notify_compliance', name: 'Notify Compliance', type: 'action', config: { action_type: 'notify', channel: 'email', message: 'Breach assessment needed for {{data_type}}' }, depends_on: ['create_case'] },
      { id: 'generate_report', name: 'Generate Breach Report', type: 'report', config: { format: 'markdown', template: '# Data Breach Assessment\n\n**System:** {{source_system}}\n**Data Type:** {{data_type}}\n**Records:** {{estimated_records}}' }, depends_on: ['notify_legal', 'notify_compliance'] },
    ],
    tags: ['data-breach', 'compliance', 'incident-response'],
    mitre_techniques: ['T1005', 'T1041', 'T1567'],
    created_by: 'system',
  },
];

export async function seedPlaybookTemplates(db: D1Database): Promise<number> {
  let count = 0;
  for (const template of PLAYBOOK_TEMPLATES) {
    const existing = await db.prepare('SELECT id FROM playbooks WHERE name = ?').bind(template.name).first();
    if (!existing) {
      await createPlaybook(db, template);
      count++;
    }
  }
  return count;
}
