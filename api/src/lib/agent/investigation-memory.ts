/**
 * Investigation memory — persists key IOCs, actors, and patterns across
 * sessions for cross-investigation context. Stored in D1 for durability.
 */

export interface InvestigationMemoryEntry {
  id: string;
  query: string;
  queryType: string;
  /** Key IOCs discovered (deduplicated). */
  iocs: Array<{ type: string; value: string; confidence: string }>;
  /** Threat actors identified. */
  actors: string[];
  /** MITRE techniques observed. */
  mitre: string[];
  /** CVEs referenced. */
  cves: string[];
  /** Key findings (one-liners). */
  keyFindings: string[];
  /** Quality score of the final report. */
  qualityScore: number;
  /** Model used for synthesis. */
  modelUsed: string;
  /** When the investigation completed. */
  completedAt: string;
}

/**
 * Save key findings from an investigation to persistent memory.
 */
export async function saveInvestigationMemory(
  db: D1Database,
  entry: Omit<InvestigationMemoryEntry, 'id'>
): Promise<void> {
  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO investigation_memory (id, query, query_type, iocs, actors, mitre, cves, key_findings, quality_score, model_used, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        entry.query,
        entry.queryType,
        JSON.stringify(entry.iocs),
        JSON.stringify(entry.actors),
        JSON.stringify(entry.mitre),
        JSON.stringify(entry.cves),
        JSON.stringify(entry.keyFindings),
        entry.qualityScore,
        entry.modelUsed,
        entry.completedAt
      )
      .run();
  } catch (err) {
    console.error('saveInvestigationMemory failed:', err);
  }
}

/**
 * Look up past investigations that involved the same IOCs or actors.
 * Returns the most recent 5 matching investigations.
 */
export async function lookupMemory(
  db: D1Database,
  indicators: { iocs?: string[]; actors?: string[]; cves?: string[] }
): Promise<InvestigationMemoryEntry[]> {
  try {
    const results: InvestigationMemoryEntry[] = [];

    // EXACT-VALUE matching (not substring). The iocs/actors/cves columns store
    // JSON arrays, so we match against the quoted JSON value boundary to avoid
    // substring collisions (e.g. searching for "1.2.3.4" must NOT match a stored
    // "10.1.2.3.45"). For the iocs column (array of {type,value,confidence}),
    // we match `"value":"<ioc>"`; for actors/cves (string arrays), `"<value>"`.
    // This is a query-level fix — a normalized junction table (migration) is
    // the long-term plan, but this prevents contamination without a schema change.

    // Search by IOCs
    if (indicators.iocs && indicators.iocs.length > 0) {
      for (const ioc of indicators.iocs.slice(0, 5)) {
        const escaped = jsonEscapeForLike(ioc);
        const { results: rows } = await db
          .prepare(`SELECT * FROM investigation_memory WHERE iocs LIKE ? ORDER BY completed_at DESC LIMIT 3`)
          .bind(`%"value":"${escaped}"%`)
          .all<Record<string, unknown>>();
        for (const row of rows) {
          results.push(rowToEntry(row));
        }
      }
    }

    // Search by actors
    if (indicators.actors && indicators.actors.length > 0) {
      for (const actor of indicators.actors.slice(0, 3)) {
        const escaped = jsonEscapeForLike(actor);
        const { results: rows } = await db
          .prepare(`SELECT * FROM investigation_memory WHERE actors LIKE ? ORDER BY completed_at DESC LIMIT 3`)
          .bind(`%"${escaped}"%`)
          .all<Record<string, unknown>>();
        for (const row of rows) {
          results.push(rowToEntry(row));
        }
      }
    }

    // Search by CVEs
    if (indicators.cves && indicators.cves.length > 0) {
      for (const cve of indicators.cves.slice(0, 3)) {
        const escaped = jsonEscapeForLike(cve);
        const { results: rows } = await db
          .prepare(`SELECT * FROM investigation_memory WHERE cves LIKE ? ORDER BY completed_at DESC LIMIT 3`)
          .bind(`%"${escaped}"%`)
          .all<Record<string, unknown>>();
        for (const row of rows) {
          results.push(rowToEntry(row));
        }
      }
    }

    // Deduplicate by id and return most recent
    const seen = new Set<string>();
    return results
      .filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, 5);
  } catch (err) {
    console.error('lookupMemory failed:', err);
    return [];
  }
}

/**
 * Get recent investigation history.
 */
export async function getRecentInvestigations(db: D1Database, limit = 20): Promise<InvestigationMemoryEntry[]> {
  try {
    const { results: rows } = await db
      .prepare(`SELECT * FROM investigation_memory ORDER BY completed_at DESC LIMIT ?`)
      .bind(limit)
      .all<Record<string, unknown>>();
    return rows.map(rowToEntry);
  } catch (err) {
    console.error('getRecentInvestigations failed:', err);
    return [];
  }
}

function rowToEntry(row: Record<string, unknown>): InvestigationMemoryEntry {
  return {
    id: String(row.id ?? ''),
    query: String(row.query ?? ''),
    queryType: String(row.query_type ?? ''),
    iocs: parseJsonArray<{ type: string; value: string; confidence: string }>(row.iocs),
    actors: parseJsonArray<string>(row.actors),
    mitre: parseJsonArray<string>(row.mitre),
    cves: parseJsonArray<string>(row.cves),
    keyFindings: parseJsonArray<string>(row.key_findings),
    qualityScore: Number(row.quality_score ?? 0),
    modelUsed: String(row.model_used ?? ''),
    completedAt: String(row.completed_at ?? ''),
  };
}

function parseJsonArray<T>(val: unknown): T[] {
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Escape a value for safe embedding inside a JSON-string LIKE pattern.
 *
 * The iocs/actors/cves columns store JSON arrays, so we match against the
 * quoted value boundary (`"value":"<ioc>"` or `"<actor>"`). This function
 * escapes the characters that would break JSON string parsing or SQLite LIKE
 * matching (backslash, double-quote, and the LIKE wildcards % and _).
 *
 * This is a query-level guard against substring contamination (e.g. searching
 * for "1.2.3.4" must not match a stored "10.1.2.3.45"). A normalized junction
 * table is the long-term fix; this prevents contamination without a migration.
 *
 * Exported for unit testing — the exact-value matching contract must not
 * silently regress to bare `LIKE '%ioc%'` substring matching.
 */
export function jsonEscapeForLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Render related past investigations as a planner hint so a new investigation
 * builds on prior work instead of re-discovering known facts. Pure + tested.
 */
export function buildPriorIntelNote(entries: InvestigationMemoryEntry[], max = 3): string {
  if (entries.length === 0) return '';
  // AUDIT FIX (2026-08): order by quality score desc (then recency) so the
  // highest-quality prior intel wins the `max` slice. Previously the caller
  // (lookupMemory) sorted by completedAt desc only, so a low-quality or
  // superseded investigation could anchor the planner over a better one.
  // Re-sorting here keeps the contract pure (the caller's sort is preserved
  // for other consumers) while ensuring the note surfaces the best evidence.
  const ranked = [...entries].sort((a, b) => {
    if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
    return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
  });
  const lines: string[] = ['<prior_intelligence>You have investigated related indicators before:'];
  for (const e of ranked.slice(0, max)) {
    const parts: string[] = [];
    if (e.actors.length > 0) parts.push(`actors: ${e.actors.slice(0, 3).join(', ')}`);
    if (e.cves.length > 0) parts.push(`CVEs: ${e.cves.slice(0, 3).join(', ')}`);
    if (e.mitre.length > 0) parts.push(`MITRE: ${e.mitre.slice(0, 4).join(', ')}`);
    if (e.keyFindings.length > 0) parts.push(`findings: ${e.keyFindings.slice(0, 2).join('; ')}`);
    lines.push(
      `- "${e.query}" (${e.queryType}, quality ${e.qualityScore}/100)${parts.length > 0 ? `: ${parts.join(' | ')}` : ''}`
    );
  }
  // AUDIT FIX (2026-08): reframe as a hint to VERIFY, not established fact.
  // The previous instruction ("do not re-discover what is already known")
  // risked the planner re-asserting a stale or wrong prior attribution. Prior
  // intel is a starting point — the planner must confirm each fact against
  // current tool data before relying on it.
  lines.push(
    'Treat this as a starting point to build on, NOT as established fact — verify each prior finding against current tool data before relying on it; if a tool contradicts a prior finding, the current tool wins. Focus on the gaps the prior investigation left open.</prior_intelligence>'
  );
  return '\n' + lines.join('\n');
}
