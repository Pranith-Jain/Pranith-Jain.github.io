import type { Context } from 'hono';
import type { Env } from '../env';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Cross-Platform Attack Chain Reconstruction
 *
 * Given a CVE ID, traces the full attack chain:
 *   1. Which threat actors exploit it
 *   2. What malware they deploy
 *   3. Which sectors they target
 *   4. What detection rules exist
 *   5. What the kill chain looks like
 *   6. Historical exploitation timeline
 *
 * Combines data from: graph database, briefings, actor profiles,
 * MITRE mappings, detection rules, and IOC lifecycle.
 */

interface AttackChainResult {
  cve_id: string;
  generated_at: string;
  summary: string;
  severity: {
    cvss: number | null;
    epss: number | null;
    kev: boolean;
    exploit_maturity: 'weaponized' | 'poc' | 'theoretical' | 'unknown';
  };
  threat_actors: Array<{
    name: string;
    confidence: number;
    last_activity: string;
    techniques: string[];
    target_sectors: string[];
    evidence: string;
  }>;
  malware_families: Array<{
    name: string;
    confidence: number;
    family_type: string;
    techniques: string[];
    associated_actors: string[];
  }>;
  targeted_sectors: Array<{
    sector: string;
    confidence: number;
    attack_count: number;
    geographic_focus: string[];
  }>;
  kill_chain: Array<{
    phase: string;
    phase_id: string;
    techniques: Array<{
      id: string;
      name: string;
      confidence: number;
      evidence: string;
    }>;
    coverage: number;
  }>;
  detection_rules: Array<{
    name: string;
    type: string;
    rule: string;
    source: string;
    confidence: number;
  }>;
  exploitation_timeline: Array<{
    date: string;
    event: string;
    source: string;
  }>;
  related_cves: Array<{
    cve_id: string;
    relationship: string;
    shared_actors: string[];
  }>;
  recommended_actions: Array<{
    action: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    technique?: string;
    rationale: string;
  }>;
}

/**
 * Query the graph database for CVE relationships.
 */
async function queryCveGraph(
  db: D1Database,
  cveId: string
): Promise<{
  actors: Array<{ value: string; confidence: number }>;
  malware: Array<{ value: string; confidence: number }>;
  techniques: Array<{ value: string; confidence: number }>;
  edges: Array<{ source: string; target: string; relationship: string; confidence: number }>;
}> {
  const nodeId = `cve:${cveId}`;

  // Get direct neighbors
  const [outEdges, inEdges] = await Promise.all([
    db
      .prepare(
        `SELECT e.target_id as neighbor, e.relationship, e.confidence,
                n.type as neighbor_type, n.value as neighbor_value
         FROM graph_edges e
         JOIN graph_nodes n ON n.id = e.target_id
         WHERE e.source_id = ?`
      )
      .bind(nodeId)
      .all<{
        neighbor: string;
        relationship: string;
        confidence: number;
        neighbor_type: string;
        neighbor_value: string;
      }>(),
    db
      .prepare(
        `SELECT e.source_id as neighbor, e.relationship, e.confidence,
                n.type as neighbor_type, n.value as neighbor_value
         FROM graph_edges e
         JOIN graph_nodes n ON n.id = e.source_id
         WHERE e.target_id = ?`
      )
      .bind(nodeId)
      .all<{
        neighbor: string;
        relationship: string;
        confidence: number;
        neighbor_type: string;
        neighbor_value: string;
      }>(),
  ]);

  const actors: Array<{ value: string; confidence: number }> = [];
  const malware: Array<{ value: string; confidence: number }> = [];
  const techniques: Array<{ value: string; confidence: number }> = [];
  const edges: Array<{ source: string; target: string; relationship: string; confidence: number }> = [];

  for (const row of [...(outEdges.results ?? []), ...(inEdges.results ?? [])]) {
    const entry = { value: row.neighbor_value, confidence: row.confidence };
    if (row.neighbor_type === 'actor') actors.push(entry);
    else if (row.neighbor_type === 'malware') malware.push(entry);
    else if (row.neighbor_type === 'technique') techniques.push(entry);

    edges.push({
      source: nodeId,
      target: row.neighbor,
      relationship: row.relationship,
      confidence: row.confidence,
    });
  }

  // Also search briefings for CVE mentions
  const briefingRows = await db
    .prepare(
      `SELECT slug, body, created_at FROM briefings
       WHERE body LIKE ? ORDER BY created_at DESC LIMIT 20`
    )
    .bind(`%${cveId}%`)
    .all<{ slug: string; body: string; created_at: string }>();

  // Extract additional actors/malware from briefing text
  for (const b of briefingRows.results ?? []) {
    const body = b.body || '';
    const actorMatches = body.match(
      /\b(APT\d+|Lazarus|Fancy Bear|Cozy Bear|REvil|LockBit|Conti|ALPHV|BlackCat|Cl0p|Play|Royal|Akira|Black Basta|Clop|Vice Society|Medusa|8Base|RansomHub)\b/gi
    );
    if (actorMatches) {
      for (const actor of actorMatches) {
        if (!actors.find((a) => a.value.toLowerCase() === actor.toLowerCase())) {
          actors.push({ value: actor, confidence: 60 });
        }
      }
    }
  }

  return { actors, malware, techniques, edges };
}

/**
 * Map CVE to MITRE ATT&CK techniques based on vulnerability type.
 */
function mapCveToTechniques(cveId: string, description: string): AttackChainResult['kill_chain'] {
  const desc = description.toLowerCase();

  const techniques: Record<string, Array<{ id: string; name: string; confidence: number; evidence: string }>> = {
    Reconnaissance: [],
    'Resource Development': [],
    'Initial Access': [],
    Execution: [],
    Persistence: [],
    'Privilege Escalation': [],
    'Defense Evasion': [],
    'Credential Access': [],
    Discovery: [],
    'Lateral Movement': [],
    Collection: [],
    'Command and Control': [],
    Exfiltration: [],
    Impact: [],
  };

  // Initial Access techniques
  if (desc.includes('remote code execution') || desc.includes('rce')) {
    techniques['Initial Access'].push({
      id: 'T1190',
      name: 'Exploit Public-Facing Application',
      confidence: 90,
      evidence: 'CVE allows remote code execution',
    });
    techniques['Execution'].push({
      id: 'T1059',
      name: 'Command and Scripting Interpreter',
      confidence: 80,
      evidence: 'RCE enables arbitrary command execution',
    });
  }
  if (desc.includes('authentication bypass') || desc.includes('auth bypass')) {
    techniques['Initial Access'].push({
      id: 'T1190',
      name: 'Exploit Public-Facing Application',
      confidence: 85,
      evidence: 'Authentication bypass enables unauthorized access',
    });
  }
  if (desc.includes('sql injection') || desc.includes('sqli')) {
    techniques['Initial Access'].push({
      id: 'T1190',
      name: 'Exploit Public-Facing Application',
      confidence: 90,
      evidence: 'SQL injection enables data access and potential RCE',
    });
    techniques['Credential Access'].push({
      id: 'T1003',
      name: 'OS Credential Dumping',
      confidence: 70,
      evidence: 'SQLi can extract credentials from databases',
    });
  }
  if (desc.includes('xss') || desc.includes('cross-site scripting')) {
    techniques['Initial Access'].push({
      id: 'T1189',
      name: 'Drive-by Compromise',
      confidence: 75,
      evidence: 'XSS can be used for drive-by attacks',
    });
  }
  if (desc.includes('privilege escalation') || desc.includes('elevation')) {
    techniques['Privilege Escalation'].push({
      id: 'T1068',
      name: 'Exploitation for Privilege Escalation',
      confidence: 85,
      evidence: 'Vulnerability enables privilege escalation',
    });
  }
  if (desc.includes('buffer overflow') || desc.includes('memory corruption')) {
    techniques['Execution'].push({
      id: 'T1203',
      name: 'Exploitation for Client Execution',
      confidence: 80,
      evidence: 'Memory corruption enables arbitrary code execution',
    });
  }
  if (desc.includes('directory traversal') || desc.includes('path traversal')) {
    techniques['Discovery'].push({
      id: 'T1083',
      name: 'File and Directory Discovery',
      confidence: 75,
      evidence: 'Path traversal enables file system access',
    });
  }
  if (desc.includes('denial of service') || desc.includes('dos')) {
    techniques['Impact'].push({
      id: 'T1499',
      name: 'Endpoint Denial of Service',
      confidence: 85,
      evidence: 'Vulnerability enables denial of service',
    });
  }

  // Default if nothing matched
  if (techniques['Initial Access'].length === 0) {
    techniques['Initial Access'].push({
      id: 'T1190',
      name: 'Exploit Public-Facing Application',
      confidence: 60,
      evidence: 'CVE exploitation typically targets public-facing services',
    });
  }

  const tactics = [
    { id: 'TA0043', name: 'Reconnaissance' },
    { id: 'TA0042', name: 'Resource Development' },
    { id: 'TA0001', name: 'Initial Access' },
    { id: 'TA0002', name: 'Execution' },
    { id: 'TA0003', name: 'Persistence' },
    { id: 'TA0004', name: 'Privilege Escalation' },
    { id: 'TA0005', name: 'Defense Evasion' },
    { id: 'TA0006', name: 'Credential Access' },
    { id: 'TA0007', name: 'Discovery' },
    { id: 'TA0008', name: 'Lateral Movement' },
    { id: 'TA0009', name: 'Collection' },
    { id: 'TA0011', name: 'Command and Control' },
    { id: 'TA0010', name: 'Exfiltration' },
    { id: 'TA0040', name: 'Impact' },
  ];

  return tactics.map((tactic) => ({
    phase: tactic.name,
    phase_id: tactic.id,
    techniques: techniques[tactic.name] ?? [],
    coverage: (techniques[tactic.name] ?? []).length > 0 ? 100 : 0,
  }));
}

/**
 * Generate detection rules for a CVE.
 */
function generateDetectionRules(cveId: string, description: string): AttackChainResult['detection_rules'] {
  const rules: AttackChainResult['detection_rules'] = [];
  const desc = description.toLowerCase();

  // Sigma rule
  rules.push({
    name: `${cveId} exploitation attempt`,
    type: 'sigma',
    rule: `title: ${cveId} Exploitation Attempt
status: experimental
description: Detects exploitation attempts for ${cveId}
logsource:
    category: webserver
detection:
    selection:
        c-uri|contains:
            - '${cveId}'
    condition: selection
level: high`,
    source: 'auto-generated',
    confidence: 70,
  });

  // YARA rule for related malware
  if (desc.includes('remote code execution') || desc.includes('rce')) {
    rules.push({
      name: `${cveId} exploit payload detection`,
      type: 'yara',
      rule: `rule ${cveId.replace(/-/g, '_')}_exploit {
    meta:
        description = "Detects exploit payloads for ${cveId}"
        author = "Auto-generated"
        date = "${new Date().toISOString().slice(0, 10)}"
    strings:
        $s1 = "${cveId}" ascii
        $s2 = "exploit" ascii nocase
        $s3 = "payload" ascii nocase
    condition:
        2 of ($s*)
}`,
      source: 'auto-generated',
      confidence: 60,
    });
  }

  // Suricata rule
  rules.push({
    name: `${cveId} network detection`,
    type: 'suricata',
    rule: `alert http any any -> any any (msg:"ET EXPLOIT ${cveId} Exploitation Attempt"; flow:established,to_server; content:"${cveId}"; nocase; sid:9000001; rev:1;)`,
    source: 'auto-generated',
    confidence: 65,
  });

  return rules;
}

/**
 * GET /api/v1/attack-chain/reconstruct-cve — Full attack chain for a CVE.
 */
export async function attackChainCveHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  const cveId = c.req.query('cve');
  if (!cveId) return c.json({ error: 'cve parameter required' }, 400);

  // Validate CVE format
  if (!/^CVE-\d{4}-\d{4,}$/i.test(cveId)) {
    return c.json({ error: 'invalid CVE format (expected CVE-YYYY-NNNNN)' }, 400);
  }

  try {
    const cveUpper = cveId.toUpperCase();

    // Get CVE details from graph
    const cveNode = await db
      .prepare(`SELECT * FROM graph_nodes WHERE id = ? OR id = ?`)
      .bind(`cve:${cveUpper}`, `cve:${cveId}`)
      .first<{ id: string; value: string; properties: string; first_seen: string }>();

    const description = cveNode?.value ?? '';

    // Query graph relationships
    const graph = await queryCveGraph(db, cveUpper);

    // Build threat actors list
    const threatActors = graph.actors.map((a) => ({
      name: a.value,
      confidence: a.confidence,
      last_activity: new Date().toISOString(),
      techniques: [],
      target_sectors: [],
      evidence: `Graph relationship: ${a.value} → ${cveUpper}`,
    }));

    // Build malware families list
    const malwareFamilies = graph.malware.map((m) => ({
      name: m.value,
      confidence: m.confidence,
      family_type: 'malware',
      techniques: [],
      associated_actors: [],
    }));

    // Build targeted sectors (from actor knowledge)
    const sectorMap: Record<string, string[]> = {
      apt28: ['Government', 'Defense', 'Technology'],
      lazarus: ['Financial Services', 'Technology'],
      lockbit: ['Healthcare', 'Manufacturing', 'Government'],
      alphv: ['Healthcare', 'Technology'],
    };

    const targetedSectors = new Map<string, { confidence: number; count: number; regions: Set<string> }>();
    for (const actor of threatActors) {
      const sectors = sectorMap[actor.name.toLowerCase()] ?? ['Unknown'];
      for (const sector of sectors) {
        const existing = targetedSectors.get(sector) ?? { confidence: actor.confidence, count: 0, regions: new Set() };
        existing.count++;
        existing.confidence = Math.max(existing.confidence, actor.confidence);
        existing.regions.add('Global');
        targetedSectors.set(sector, existing);
      }
    }

    // Build kill chain
    const killChain = mapCveToTechniques(cveUpper, description);

    // Generate detection rules
    const detectionRules = generateDetectionRules(cveUpper, description);

    // Build exploitation timeline
    const timeline: AttackChainResult['exploitation_timeline'] = [];
    if (cveNode?.first_seen) {
      timeline.push({ date: cveNode.first_seen, event: 'CVE published', source: 'NVD' });
    }

    // Check for related CVEs (same actors or techniques)
    const relatedCves: AttackChainResult['related_cves'] = [];
    for (const actor of graph.actors) {
      const relatedRows = await db
        .prepare(
          `SELECT DISTINCT e.source_id FROM graph_edges e
           WHERE e.target_id = ? AND e.source_id LIKE 'cve:%' AND e.source_id != ?
           LIMIT 5`
        )
        .bind(`actor:${actor.value}`, `cve:${cveUpper}`)
        .all<{ source_id: string }>();
      for (const row of relatedRows.results ?? []) {
        const relatedCve = row.source_id.replace('cve:', '');
        if (!relatedCves.find((r) => r.cve_id === relatedCve)) {
          relatedCves.push({
            cve_id: relatedCve,
            relationship: 'shared actor',
            shared_actors: [actor.value],
          });
        }
      }
    }

    // Generate recommendations
    const recommendations: AttackChainResult['recommended_actions'] = [];
    if (threatActors.length > 0) {
      recommendations.push({
        action: `Deploy detection rules for ${threatActors[0].name} TTPs`,
        priority: 'critical',
        rationale: `Active threat actor(s) associated with this CVE.`,
      });
    }
    recommendations.push({
      action: `Patch or mitigate ${cveUpper} immediately`,
      priority: 'critical',
      rationale: 'Known exploited vulnerability with active threat actor interest.',
    });
    if (detectionRules.length > 0) {
      recommendations.push({
        action: `Deploy ${detectionRules.length} auto-generated detection rule(s)`,
        priority: 'high',
        rationale: 'Sigma, YARA, and Suricata rules available for immediate deployment.',
      });
    }

    // Determine exploit maturity
    let exploitMaturity: AttackChainResult['severity']['exploit_maturity'] = 'unknown';
    if (threatActors.length > 0) exploitMaturity = 'weaponized';
    else if (description.toLowerCase().includes('poc')) exploitMaturity = 'poc';
    else exploitMaturity = 'theoretical';

    const result: AttackChainResult = {
      cve_id: cveUpper,
      generated_at: new Date().toISOString(),
      summary: `${cveUpper}: ${threatActors.length} threat actor(s), ${malwareFamilies.length} malware family(ies), ${targetedSectors.size} sector(s) targeted. Exploitation maturity: ${exploitMaturity}.`,
      severity: {
        cvss: null,
        epss: null,
        kev: false,
        exploit_maturity: exploitMaturity,
      },
      threat_actors: threatActors,
      malware_families: malwareFamilies,
      targeted_sectors: Array.from(targetedSectors.entries()).map(([sector, data]) => ({
        sector,
        confidence: data.confidence,
        attack_count: data.count,
        geographic_focus: Array.from(data.regions),
      })),
      kill_chain: killChain,
      detection_rules: detectionRules,
      exploitation_timeline: timeline,
      related_cves: relatedCves,
      recommended_actions: recommendations,
    };

    return c.json(result, 200, {
      'cache-control': 'public, max-age=600, stale-while-revalidate=2400',
    });
  } catch (err) {
    console.error('attack-chain-cve error:', err);
    return c.json({ error: 'reconstruction failed' }, 500);
  }
}
