/**
 * WHOIS History Service
 *
 * Stores historical WHOIS/RDAP snapshots and enables:
 *   1. Ownership change detection — compare current vs historical WHOIS
 *   2. Domain pivoting — find related domains by shared registrant email,
 *      organization, nameservers, or registrar
 *   3. Timeline visualization — track domain registration evolution
 *   4. Infrastructure fingerprinting — identify attacker infrastructure patterns
 *
 * Inspired by etugen.io's WHOIS History Explorer feature.
 *
 * Usage:
 *   import { storeWhoisSnapshot, getWhoisHistory, pivotByRegistrant } from '../lib/whois-history';
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { RdapResult } from './rdap';

// ── Types ────────────────────────────────────────────────────────

export interface WhoisSnapshot {
  id: number;
  domain: string;
  registrar?: string;
  registrant_name?: string;
  registrant_org?: string;
  registrant_email?: string;
  registrant_phone?: string;
  created_date?: string;
  expires_date?: string;
  updated_date?: string;
  nameservers: string[];
  dnssec?: string;
  status: string[];
  source: string;
  snapshot_at: string;
}

export interface WhoisChange {
  id: number;
  domain: string;
  change_type: string;
  field_name: string;
  old_value?: string;
  new_value?: string;
  detected_at: string;
}

export interface WhoisHistoryResult {
  domain: string;
  snapshots: WhoisSnapshot[];
  changes: WhoisChange[];
  current: WhoisSnapshot | null;
  ownership_transfers: number;
  registrar_changes: number;
  nameserver_changes: number;
  first_seen: string;
  last_seen: string;
}

export interface DomainPivot {
  domain: string;
  match_reason: string;
  match_value: string;
  first_seen: string;
  last_seen: string;
  snapshot_count: number;
  current_registrar?: string;
}

export interface PivotResult {
  target: string;
  pivot_type: 'email' | 'org' | 'nameserver' | 'registrar' | 'all';
  related_domains: DomainPivot[];
  total_found: number;
  query_time_ms: number;
}

// ── Fingerprinting ───────────────────────────────────────────────

/**
 * Compute a fingerprint from WHOIS fields for change detection.
 * Excludes volatile fields (updated_date, snapshot_at) so we only
 * detect meaningful ownership/infrastructure changes.
 */
async function computeFingerprint(data: {
  registrar?: string;
  registrant_name?: string;
  registrant_org?: string;
  registrant_email?: string;
  nameservers: string[];
  status: string[];
}): Promise<string> {
  const normalized = [
    data.registrar?.toLowerCase().trim() ?? '',
    data.registrant_name?.toLowerCase().trim() ?? '',
    data.registrant_org?.toLowerCase().trim() ?? '',
    data.registrant_email?.toLowerCase().trim() ?? '',
    [...data.nameservers].sort().join(',').toLowerCase(),
    [...data.status].sort().join(',').toLowerCase(),
  ].join('|');

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(normalized));
  return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Storage ──────────────────────────────────────────────────────

/**
 * Store a WHOIS snapshot and detect changes against the previous snapshot.
 *
 * Returns the number of changes detected (0 if no previous snapshot or
 * fingerprint matches — meaning no meaningful change).
 */
export async function storeWhoisSnapshot(
  db: D1Database,
  domain: string,
  rdapData: RdapResult,
  source: string = 'rdap',
  registrant?: { name?: string; org?: string; email?: string; phone?: string }
): Promise<{ snapshotId: number; changesDetected: number }> {
  const lower = domain.toLowerCase().trim();
  const nameservers = rdapData.nameservers ?? [];
  const status = rdapData.status ?? [];
  const fingerprint = await computeFingerprint({
    registrar: rdapData.registrar,
    registrant_name: registrant?.name,
    registrant_org: registrant?.org,
    registrant_email: registrant?.email,
    nameservers,
    status,
  });

  // Check if this exact fingerprint already exists (no meaningful change).
  const existing = await db
    .prepare('SELECT id FROM whois_snapshots WHERE domain = ? AND fingerprint = ?')
    .bind(lower, fingerprint)
    .first<{ id: number }>();

  if (existing) {
    return { snapshotId: existing.id, changesDetected: 0 };
  }

  // Insert new snapshot.
  const result = await db
    .prepare(
      `INSERT INTO whois_snapshots
       (domain, registrar, registrant_name, registrant_org, registrant_email, registrant_phone,
        created_date, expires_date, updated_date, nameservers, dnssec, status, source, fingerprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      lower,
      rdapData.registrar ?? null,
      registrant?.name ?? null,
      registrant?.org ?? null,
      registrant?.email ?? null,
      registrant?.phone ?? null,
      rdapData.created ?? null,
      rdapData.expires ?? null,
      rdapData.updated ?? null,
      JSON.stringify(nameservers),
      rdapData.dnssec ?? null,
      JSON.stringify(status),
      source,
      fingerprint
    )
    .run();

  const snapshotId = result.meta.last_row_id as number;

  // Update pivot indexes.
  if (registrant?.email) {
    await db
      .prepare(
        `INSERT INTO domain_registrant_index (domain, registrant_email, registrant_org, registrant_name, first_seen, last_seen, snapshot_count)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 1)
         ON CONFLICT(domain, registrant_email) DO UPDATE SET
           last_seen = datetime('now'),
           snapshot_count = snapshot_count + 1,
           registrant_org = COALESCE(excluded.registrant_org, domain_registrant_index.registrant_org),
           registrant_name = COALESCE(excluded.registrant_name, domain_registrant_index.registrant_name)`
      )
      .bind(lower, registrant.email.toLowerCase(), registrant.org ?? null, registrant.name ?? null)
      .run();
  }

  for (const ns of nameservers) {
    await db
      .prepare(
        `INSERT INTO domain_nameserver_index (domain, nameserver, first_seen, last_seen)
         VALUES (?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(domain, nameserver) DO UPDATE SET last_seen = datetime('now')`
      )
      .bind(lower, ns.toLowerCase())
      .run();
  }

  // Detect changes against the previous snapshot.
  const previous = await db
    .prepare(
      `SELECT * FROM whois_snapshots WHERE domain = ? AND id != ? ORDER BY snapshot_at DESC LIMIT 1`
    )
    .bind(lower, snapshotId)
    .first<WhoisSnapshot>();

  let changesDetected = 0;
  if (previous) {
    const changes = detectChanges(previous, {
      id: snapshotId,
      domain: lower,
      registrar: rdapData.registrar,
      registrant_name: registrant?.name,
      registrant_org: registrant?.org,
      registrant_email: registrant?.email,
      registrant_phone: registrant?.phone,
      created_date: rdapData.created,
      expires_date: rdapData.expires,
      updated_date: rdapData.updated,
      nameservers,
      dnssec: rdapData.dnssec,
      status,
      source,
      snapshot_at: new Date().toISOString(),
    });

    for (const change of changes) {
      await db
        .prepare(
          `INSERT INTO whois_changes (domain, change_type, field_name, old_value, new_value, snapshot_id)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(lower, change.change_type, change.field_name, change.old_value, change.new_value, snapshotId)
        .run();
    }
    changesDetected = changes.length;
  }

  return { snapshotId, changesDetected };
}

/**
 * Detect meaningful changes between two WHOIS snapshots.
 */
function detectChanges(
  old: WhoisSnapshot,
  current: Partial<WhoisSnapshot>
): Array<{ change_type: string; field_name: string; old_value?: string; new_value?: string }> {
  const changes: Array<{ change_type: string; field_name: string; old_value?: string; new_value?: string }> = [];

  // Registrant changes (ownership transfer)
  const registrantFields = ['registrant_name', 'registrant_org', 'registrant_email', 'registrant_phone'] as const;
  for (const field of registrantFields) {
    const oldVal = old[field];
    const newVal = current[field];
    if (oldVal && newVal && oldVal.toLowerCase() !== newVal.toLowerCase()) {
      changes.push({
        change_type: 'registrant',
        field_name: field,
        old_value: oldVal,
        new_value: newVal,
      });
    }
  }

  // Registrar change
  if (old.registrar && current.registrar && old.registrar.toLowerCase() !== current.registrar.toLowerCase()) {
    changes.push({
      change_type: 'registrar',
      field_name: 'registrar',
      old_value: old.registrar,
      new_value: current.registrar,
    });
  }

  // Nameserver changes
  const oldNs = new Set((old.nameservers ?? []).map((n) => n.toLowerCase()));
  const newNs = new Set((current.nameservers ?? []).map((n) => n.toLowerCase()));
  const addedNs = [...newNs].filter((n) => !oldNs.has(n));
  const removedNs = [...oldNs].filter((n) => !newNs.has(n));
  if (addedNs.length > 0 || removedNs.length > 0) {
    changes.push({
      change_type: 'nameservers',
      field_name: 'nameservers',
      old_value: JSON.stringify([...oldNs]),
      new_value: JSON.stringify([...newNs]),
    });
  }

  // Status changes
  const oldStatus = new Set((old.status ?? []).map((s) => s.toLowerCase()));
  const newStatus = new Set((current.status ?? []).map((s) => s.toLowerCase()));
  if ([...oldStatus].sort().join(',') !== [...newStatus].sort().join(',')) {
    changes.push({
      change_type: 'status',
      field_name: 'status',
      old_value: JSON.stringify([...oldStatus]),
      new_value: JSON.stringify([...newStatus]),
    });
  }

  return changes;
}

// ── Query Functions ──────────────────────────────────────────────

/**
 * Get the full WHOIS history for a domain.
 */
export async function getWhoisHistory(db: D1Database, domain: string): Promise<WhoisHistoryResult> {
  const lower = domain.toLowerCase().trim();

  const snapshots = await db
    .prepare(
      `SELECT * FROM whois_snapshots WHERE domain = ? ORDER BY snapshot_at DESC LIMIT 50`
    )
    .bind(lower)
    .all<WhoisSnapshot>();

  const changes = await db
    .prepare(
      `SELECT * FROM whois_changes WHERE domain = ? ORDER BY detected_at DESC LIMIT 100`
    )
    .bind(lower)
    .all<WhoisChange>();

  const rows = snapshots.results ?? [];
  const changeRows = changes.results ?? [];

  // Parse JSON fields
  for (const row of rows) {
    try { row.nameservers = JSON.parse(row.nameservers as unknown as string); } catch { row.nameservers = []; }
    try { row.status = JSON.parse(row.status as unknown as string); } catch { row.status = []; }
  }

  const current = rows[0] ?? null;
  const firstSeen = rows.length > 0 ? (rows[rows.length - 1]?.snapshot_at ?? '') : '';
  const lastSeen = rows.length > 0 ? (rows[0]?.snapshot_at ?? '') : '';

  return {
    domain: lower,
    snapshots: rows,
    changes: changeRows,
    current,
    ownership_transfers: changeRows.filter((c) => c.change_type === 'registrant').length,
    registrar_changes: changeRows.filter((c) => c.change_type === 'registrar').length,
    nameserver_changes: changeRows.filter((c) => c.change_type === 'nameservers').length,
    first_seen: firstSeen,
    last_seen: lastSeen,
  };
}

/**
 * Pivot across domains by shared registrant attributes.
 *
 * Find domains that share the same registrant email, organization,
 * nameservers, or registrar — useful for mapping attacker infrastructure.
 */
export async function pivotDomains(
  db: D1Database,
  domain: string,
  pivotType: 'email' | 'org' | 'nameserver' | 'registrar' | 'all' = 'all'
): Promise<PivotResult> {
  const lower = domain.toLowerCase().trim();
  const start = Date.now();
  const related: DomainPivot[] = [];
  const seenDomains = new Set<string>([lower]);

  // Get the latest snapshot for the target domain.
  const snapshot = await db
    .prepare(
      `SELECT * FROM whois_snapshots WHERE domain = ? ORDER BY snapshot_at DESC LIMIT 1`
    )
    .bind(lower)
    .first<WhoisSnapshot>();

  if (!snapshot) {
    return { target: lower, pivot_type: pivotType, related_domains: [], total_found: 0, query_time_ms: 0 };
  }

  // Pivot by registrant email
  if ((pivotType === 'email' || pivotType === 'all') && snapshot.registrant_email) {
    const emailRows = await db
      .prepare(
        `SELECT d.domain, d.first_seen, d.last_seen, d.snapshot_count,
                (SELECT registrar FROM whois_snapshots WHERE domain = d.domain ORDER BY snapshot_at DESC LIMIT 1) as current_registrar
         FROM domain_registrant_index d
         WHERE d.registrant_email = ? AND d.domain != ?
         ORDER BY d.last_seen DESC LIMIT 50`
      )
      .bind(snapshot.registrant_email.toLowerCase(), lower)
      .all<{ domain: string; first_seen: string; last_seen: string; snapshot_count: number; current_registrar?: string }>();

    for (const row of emailRows.results ?? []) {
      if (!seenDomains.has(row.domain)) {
        seenDomains.add(row.domain);
        related.push({
          domain: row.domain,
          match_reason: 'shared_registrant_email',
          match_value: snapshot.registrant_email!,
          first_seen: row.first_seen,
          last_seen: row.last_seen,
          snapshot_count: row.snapshot_count,
          current_registrar: row.current_registrar,
        });
      }
    }
  }

  // Pivot by registrant organization
  if ((pivotType === 'org' || pivotType === 'all') && snapshot.registrant_org) {
    const orgRows = await db
      .prepare(
        `SELECT d.domain, d.first_seen, d.last_seen, d.snapshot_count,
                (SELECT registrar FROM whois_snapshots WHERE domain = d.domain ORDER BY snapshot_at DESC LIMIT 1) as current_registrar
         FROM domain_registrant_index d
         WHERE d.registrant_org = ? AND d.domain != ?
         ORDER BY d.last_seen DESC LIMIT 50`
      )
      .bind(snapshot.registrant_org.toLowerCase(), lower)
      .all<{ domain: string; first_seen: string; last_seen: string; snapshot_count: number; current_registrar?: string }>();

    for (const row of orgRows.results ?? []) {
      if (!seenDomains.has(row.domain)) {
        seenDomains.add(row.domain);
        related.push({
          domain: row.domain,
          match_reason: 'shared_registrant_org',
          match_value: snapshot.registrant_org!,
          first_seen: row.first_seen,
          last_seen: row.last_seen,
          snapshot_count: row.snapshot_count,
          current_registrar: row.current_registrar,
        });
      }
    }
  }

  // Pivot by nameservers
  if (pivotType === 'nameserver' || pivotType === 'all') {
    let nameservers: string[] = [];
    try { nameservers = JSON.parse(snapshot.nameservers as unknown as string); } catch { nameservers = []; }

    for (const ns of nameservers.slice(0, 5)) { // Limit to top 5 NS to avoid query explosion
      const nsRows = await db
        .prepare(
          `SELECT d.domain, d.first_seen, d.last_seen
           FROM domain_nameserver_index d
           WHERE d.nameserver = ? AND d.domain != ?
           ORDER BY d.last_seen DESC LIMIT 20`
        )
        .bind(ns.toLowerCase(), lower)
        .all<{ domain: string; first_seen: string; last_seen: string }>();

      for (const row of nsRows.results ?? []) {
        if (!seenDomains.has(row.domain)) {
          seenDomains.add(row.domain);
          related.push({
            domain: row.domain,
            match_reason: 'shared_nameserver',
            match_value: ns,
            first_seen: row.first_seen,
            last_seen: row.last_seen,
            snapshot_count: 0,
          });
        }
      }
    }
  }

  // Pivot by registrar
  if ((pivotType === 'registrar' || pivotType === 'all') && snapshot.registrar) {
    const regRows = await db
      .prepare(
        `SELECT DISTINCT domain,
                (SELECT snapshot_at FROM whois_snapshots WHERE domain = s.domain ORDER BY snapshot_at ASC LIMIT 1) as first_seen,
                (SELECT snapshot_at FROM whois_snapshots WHERE domain = s.domain ORDER BY snapshot_at DESC LIMIT 1) as last_seen
         FROM whois_snapshots s
         WHERE registrar = ? AND domain != ?
         ORDER BY last_seen DESC LIMIT 30`
      )
      .bind(snapshot.registrar, lower)
      .all<{ domain: string; first_seen: string; last_seen: string }>();

    for (const row of regRows.results ?? []) {
      if (!seenDomains.has(row.domain)) {
        seenDomains.add(row.domain);
        related.push({
          domain: row.domain,
          match_reason: 'shared_registrar',
          match_value: snapshot.registrar!,
          first_seen: row.first_seen,
          last_seen: row.last_seen,
          snapshot_count: 0,
        });
      }
    }
  }

  return {
    target: lower,
    pivot_type: pivotType,
    related_domains: related,
    total_found: related.length,
    query_time_ms: Date.now() - start,
  };
}

/**
 * Get WHOIS history statistics for a domain.
 */
export async function getWhoisStats(db: D1Database, domain: string): Promise<{
  total_snapshots: number;
  total_changes: number;
  unique_registrars: number;
  unique_registrants: number;
  unique_nameservers: number;
  history_days: number;
}> {
  const lower = domain.toLowerCase().trim();

  const stats = await db
    .prepare(
      `SELECT
        COUNT(*) as total_snapshots,
        COUNT(DISTINCT registrar) as unique_registrars,
        COUNT(DISTINCT registrant_email) as unique_registrants,
        MIN(snapshot_at) as first_seen,
        MAX(snapshot_at) as last_seen
       FROM whois_snapshots WHERE domain = ?`
    )
    .bind(lower)
    .first<{ total_snapshots: number; unique_registrars: number; unique_registrants: number; first_seen: string; last_seen: string }>();

  const changes = await db
    .prepare('SELECT COUNT(*) as n FROM whois_changes WHERE domain = ?')
    .bind(lower)
    .first<{ n: number }>();

  const nsCount = await db
    .prepare('SELECT COUNT(DISTINCT nameserver) as n FROM domain_nameserver_index WHERE domain = ?')
    .bind(lower)
    .first<{ n: number }>();

  const historyDays = stats?.first_seen && stats?.last_seen
    ? Math.ceil((new Date(stats.last_seen).getTime() - new Date(stats.first_seen).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return {
    total_snapshots: stats?.total_snapshots ?? 0,
    total_changes: changes?.n ?? 0,
    unique_registrars: stats?.unique_registrars ?? 0,
    unique_registrants: stats?.unique_registrants ?? 0,
    unique_nameservers: nsCount?.n ?? 0,
    history_days: historyDays,
  };
}
