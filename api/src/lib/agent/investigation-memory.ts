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

    // Search by IOCs
    if (indicators.iocs && indicators.iocs.length > 0) {
      for (const ioc of indicators.iocs.slice(0, 5)) {
        const { results: rows } = await db
          .prepare(`SELECT * FROM investigation_memory WHERE iocs LIKE ? ORDER BY completed_at DESC LIMIT 3`)
          .bind(`%${ioc}%`)
          .all<Record<string, unknown>>();
        for (const row of rows) {
          results.push(rowToEntry(row));
        }
      }
    }

    // Search by actors
    if (indicators.actors && indicators.actors.length > 0) {
      for (const actor of indicators.actors.slice(0, 3)) {
        const { results: rows } = await db
          .prepare(`SELECT * FROM investigation_memory WHERE actors LIKE ? ORDER BY completed_at DESC LIMIT 3`)
          .bind(`%${actor}%`)
          .all<Record<string, unknown>>();
        for (const row of rows) {
          results.push(rowToEntry(row));
        }
      }
    }

    // Search by CVEs
    if (indicators.cves && indicators.cves.length > 0) {
      for (const cve of indicators.cves.slice(0, 3)) {
        const { results: rows } = await db
          .prepare(`SELECT * FROM investigation_memory WHERE cves LIKE ? ORDER BY completed_at DESC LIMIT 3`)
          .bind(`%${cve}%`)
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
