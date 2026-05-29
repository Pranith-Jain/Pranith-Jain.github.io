import type { Context } from 'hono';
import type { Env } from '../env';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Threat Actor Behavioral DNA — fingerprint actors by behavior, not just tools.
 *
 * Creates unique behavioral signatures that persist even when actors change
 * their tooling or infrastructure. Tracks:
 *   - TTP preferences and patterns
 *   - Infrastructure DNA (hosting, domains, SSL)
 *   - Operational tempo (working hours, campaign duration)
 *   - Victimology patterns
 *   - Linguistic and cultural markers
 *
 * This enables attribution based on HOW they attack, not just WHAT they use.
 */

// ── Types ───────────────────────────────────────────────────────────────

export interface ActorDNA {
  actor_id: string;
  actor_name: string;
  aliases: string[];
  
  // Behavioral patterns unique to this actor
  ttp_signature: {
    preferred_initial_access: string[];
    preferred_execution: string[];
    persistence_patterns: string[];
    evasion_techniques: string[];
    c2_channels: string[];
    tooling_preferences: string[];
    opsec_patterns: string[];
  };
  
  // Infrastructure patterns
  infrastructure_dna: {
    hosting_preferences: string[];
    domain_patterns: string[];
    ssl_patterns: string[];
    dns_patterns: string[];
    ip_range_preferences: string[];
  };
  
  // Temporal patterns
  operational_tempo: {
    active_hours_utc: [number, number];
    active_days: string[];
    campaign_duration_avg_days: number;
    dwell_time_avg_days: number;
    seasonal_pattern: string;
    response_time_hours: number;
  };
  
  // Victimology
  victimology: {
    preferred_sectors: string[];
    preferred_regions: string[];
    organization_size: string;
    data_types_targeted: string[];
    ransom_range: string;
  };
  
  // Evolution tracking
  evolution: Array<{
    timestamp: string;
    change_type: 'ttp_shift' | 'infrastructure_change' | 'new_tool' | 'target_change';
    description: string;
    confidence: number;
  }>;
  
  // Metadata
  first_seen: string;
  last_seen: string;
  confidence: number;
  sources: string[];
}

export interface DNAMatch {
  actor_id: string;
  actor_name: string;
  match_score: number;
  matching_signals: Array<{
    signal_type: string;
    description: string;
    weight: number;
  }>;
  confidence: number;
}

// ── Known Actor DNA Database ────────────────────────────────────────────

const ACTOR_DNA_DB: ActorDNA[] = [
  {
    actor_id: 'apt28',
    actor_name: 'APT28 (Fancy Bear)',
    aliases: ['Fancy Bear', 'Sofacy', 'Pawn Storm', 'Sednit', 'STRONTIUM'],
    ttp_signature: {
      preferred_initial_access: ['spearphishing_attachment', 'spearphishing_link', 'exploit_public_facing'],
      preferred_execution: ['powershell', 'cmd', 'javascript', 'vba_macros'],
      persistence_patterns: ['scheduled_task', 'registry_run_keys', 'boot_autostart'],
      evasion_techniques: ['obfuscated_files', 'deobfuscate_decode', 'process_injection'],
      c2_channels: ['https', 'dns', 'cloud_services'],
      tooling_preferences: ['X-Agent', 'X-Tunnel', 'Sofacy', 'Zebrocy', 'CompuTrace'],
      opsec_patterns: ['vpns', 'tor_exit_nodes', 'compromised_infrastructure'],
    },
    infrastructure_dna: {
      hosting_preferences: ['bulletproof_hosting', 'compromised_legitimate'],
      domain_patterns: ['typosquatting', 'legitimate_lookalikes', 'news_themed'],
      ssl_patterns: ['lets_encrypt', 'self_signed'],
      dns_patterns: ['fast_flux', 'domain_generation'],
      ip_range_preferences: ['eastern_europe', 'russia'],
    },
    operational_tempo: {
      active_hours_utc: [6, 18], // Moscow business hours
      active_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      campaign_duration_avg_days: 45,
      dwell_time_avg_days: 30,
      seasonal_pattern: 'increases_before_elections',
      response_time_hours: 4,
    },
    victimology: {
      preferred_sectors: ['government', 'military', 'defense', 'media', 'energy'],
      preferred_regions: ['europe', 'north_america', 'middle_east'],
      organization_size: 'large_enterprise',
      data_types_targeted: ['intelligence', 'political', 'military', 'credentials'],
      ransom_range: 'not_ransomware_focused',
    },
    evolution: [
      { timestamp: '2024-01-15', change_type: 'new_tool', description: 'Adopted new Go-based loader', confidence: 85 },
      { timestamp: '2024-03-20', change_type: 'ttp_shift', description: 'Increased use of cloud C2', confidence: 75 },
    ],
    first_seen: '2004-01-01',
    last_seen: '2026-05-28',
    confidence: 95,
    sources: ['MITRE', 'CrowdStrike', 'FireEye', 'Microsoft'],
  },
  {
    actor_id: 'apt29',
    actor_name: 'APT29 (Cozy Bear)',
    aliases: ['Cozy Bear', 'The Dukes', 'CozyDuke', 'YTTRIUM'],
    ttp_signature: {
      preferred_initial_access: ['supply_chain', 'spearphishing', 'trusted_relationship'],
      preferred_execution: ['powershell', 'wmi', 'rundll32'],
      persistence_patterns: ['registry_run_keys', 'scheduled_task', 'dll_side_loading'],
      evasion_techniques: ['obfuscated_files', 'process_injection', 'anti_vm'],
      c2_channels: ['https', 'dns', 'legitimate_cloud_services'],
      tooling_preferences: ['WellMess', 'WellMail', 'SUNBURST', 'EnvyScout'],
      opsec_patterns: ['high_operational_security', 'minimal_footprint', 'living_off_land'],
    },
    infrastructure_dna: {
      hosting_preferences: ['compromised_legitimate', 'cloud_services'],
      domain_patterns: ['legitimate_lookalikes', 'service_themed'],
      ssl_patterns: ['stolen_certificates', 'lets_encrypt'],
      dns_patterns: ['legitimate_dns', 'txt_record_c2'],
      ip_range_preferences: ['global', 'residential_proxies'],
    },
    operational_tempo: {
      active_hours_utc: [8, 20],
      active_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      campaign_duration_avg_days: 180,
      dwell_time_avg_days: 90,
      seasonal_pattern: 'consistent_year_round',
      response_time_hours: 2,
    },
    victimology: {
      preferred_sectors: ['government', 'think_tanks', 'healthcare', 'technology'],
      preferred_regions: ['global'],
      organization_size: 'large_enterprise',
      data_types_targeted: ['intelligence', 'research', 'vaccine_data'],
      ransom_range: 'not_ransomware_focused',
    },
    evolution: [
      { timestamp: '2023-12-01', change_type: 'ttp_shift', description: 'Shifted to supply chain attacks', confidence: 90 },
    ],
    first_seen: '2008-01-01',
    last_seen: '2026-05-28',
    confidence: 95,
    sources: ['MITRE', 'CrowdStrike', 'FireEye', 'NSA'],
  },
  {
    actor_id: 'lazarus',
    actor_name: 'Lazarus Group',
    aliases: ['Lazarus', 'HIDDEN COBRA', 'Zinc', 'Diamond Sleet'],
    ttp_signature: {
      preferred_initial_access: ['spearphishing', 'supply_chain', 'watering_hole'],
      preferred_execution: ['powershell', 'dll_side_loading', 'macros'],
      persistence_patterns: ['registry_run_keys', 'scheduled_task', 'boot_autostart'],
      evasion_techniques: ['obfuscated_files', 'process_injection', 'anti_debug'],
      c2_channels: ['https', 'dns', 'legitimate_services'],
      tooling_preferences: ['AppleJeus', 'Dtrack', 'HoaxTicket', 'Blindingcan'],
      opsec_patterns: ['false_flags', 'attribution_confusion'],
    },
    infrastructure_dna: {
      hosting_preferences: ['compromised_legitimate', 'bulletproof_hosting'],
      domain_patterns: ['crypto_themed', 'job_themed', 'legitimate_lookalikes'],
      ssl_patterns: ['lets_encrypt', 'stolen_certificates'],
      dns_patterns: ['fast_flux', 'domain_generation'],
      ip_range_preferences: ['asia', 'global'],
    },
    operational_tempo: {
      active_hours_utc: [0, 12], // Pyongyang business hours
      active_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      campaign_duration_avg_days: 90,
      dwell_time_avg_days: 60,
      seasonal_pattern: 'increases_toward_year_end',
      response_time_hours: 8,
    },
    victimology: {
      preferred_sectors: ['cryptocurrency', 'financial', 'defense', 'technology'],
      preferred_regions: ['global'],
      organization_size: 'mixed',
      data_types_targeted: ['cryptocurrency', 'financial', 'intellectual_property'],
      ransom_range: '$1M-$100M',
    },
    evolution: [
      { timestamp: '2024-02-15', change_type: 'new_tool', description: 'New macOS malware variant', confidence: 90 },
    ],
    first_seen: '2009-01-01',
    last_seen: '2026-05-28',
    confidence: 95,
    sources: ['MITRE', 'US-CERT', 'Kaspersky', 'ESET'],
  },
  {
    actor_id: 'lockbit',
    actor_name: 'LockBit',
    aliases: ['LockBit', 'LockBit 3.0', 'LockBit Black'],
    ttp_signature: {
      preferred_initial_access: ['ransomware_as_service', 'initial_access_brokers', 'exploit_public_facing'],
      preferred_execution: ['powershell', 'cmd', 'dll_side_loading'],
      persistence_patterns: ['scheduled_task', 'registry_run_keys', 'boot_autostart'],
      evasion_techniques: ['obfuscated_files', 'anti_vm', 'anti_debug'],
      c2_channels: ['tor', 'custom_panel'],
      tooling_preferences: ['LockBit 3.0', 'StealBit', 'PrivilegeEscalationTools'],
      opsec_patterns: ['ransomware_as_service', 'affiliate_model'],
    },
    infrastructure_dna: {
      hosting_preferences: ['bulletproof_hosting', 'tor_hidden_services'],
      domain_patterns: ['data_leak_sites', 'victim_portals'],
      ssl_patterns: ['lets_encrypt'],
      dns_patterns: ['tor_onion'],
      ip_range_preferences: ['global'],
    },
    operational_tempo: {
      active_hours_utc: [0, 24], // 24/7 operation
      active_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      campaign_duration_avg_days: 3,
      dwell_time_avg_days: 5,
      seasonal_pattern: 'consistent_year_round',
      response_time_hours: 1,
    },
    victimology: {
      preferred_sectors: ['healthcare', 'education', 'manufacturing', 'government', 'critical_infrastructure'],
      preferred_regions: ['global'],
      organization_size: 'mixed',
      data_types_targeted: ['all_data_types', 'double_extortion'],
      ransom_range: '$10K-$10M',
    },
    evolution: [
      { timestamp: '2024-06-01', change_type: 'ttp_shift', description: 'Adopted new encryption methods', confidence: 85 },
    ],
    first_seen: '2019-09-01',
    last_seen: '2026-05-28',
    confidence: 95,
    sources: ['MITRE', 'CISA', 'FBI', 'Europol'],
  },
];

// ── Analysis Functions ──────────────────────────────────────────────────

/**
 * Match observed TTPs against actor DNA database.
 */
export async function matchActorDNA(
  observedTTPs: string[],
  observedInfrastructure?: string[],
  observedVictimology?: { sectors?: string[]; regions?: string[] }
): Promise<DNAMatch[]> {
  const matches: DNAMatch[] = [];

  for (const actor of ACTOR_DNA_DB) {
    const signals: DNAMatch['matching_signals'] = [];
    let totalWeight = 0;
    let matchWeight = 0;

    // TTP matching (weight: 40%)
    const ttpWeight = 40;
    totalWeight += ttpWeight;
    const allTTPs = [
      ...actor.ttp_signature.preferred_initial_access,
      ...actor.ttp_signature.preferred_execution,
      ...actor.ttp_signature.persistence_patterns,
      ...actor.ttp_signature.evasion_techniques,
      ...actor.ttp_signature.c2_channels,
    ];
    const ttpMatches = observedTTPs.filter(t => 
      allTTPs.some(at => at.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(at.toLowerCase()))
    );
    if (ttpMatches.length > 0) {
      matchWeight += (ttpMatches.length / Math.max(observedTTPs.length, 1)) * ttpWeight;
      signals.push({
        signal_type: 'ttp_overlap',
        description: `Matched ${ttpMatches.length} TTPs: ${ttpMatches.slice(0, 3).join(', ')}`,
        weight: ttpWeight,
      });
    }

    // Infrastructure matching (weight: 30%)
    if (observedInfrastructure) {
      const infraWeight = 30;
      totalWeight += infraWeight;
      const allInfra = [
        ...actor.infrastructure_dna.hosting_preferences,
        ...actor.infrastructure_dna.domain_patterns,
        ...actor.infrastructure_dna.ip_range_preferences,
      ];
      const infraMatches = observedInfrastructure.filter(i =>
        allInfra.some(ai => ai.toLowerCase().includes(i.toLowerCase()) || i.toLowerCase().includes(ai.toLowerCase()))
      );
      if (infraMatches.length > 0) {
        matchWeight += (infraMatches.length / Math.max(observedInfrastructure.length, 1)) * infraWeight;
        signals.push({
          signal_type: 'infrastructure_overlap',
          description: `Matched ${infraMatches.length} infrastructure patterns`,
          weight: infraWeight,
        });
      }
    }

    // Victimology matching (weight: 30%)
    if (observedVictimology) {
      const victimWeight = 30;
      totalWeight += victimWeight;
      let victimMatches = 0;
      
      if (observedVictimology.sectors) {
        const sectorMatches = observedVictimology.sectors.filter(s =>
          actor.victimology.preferred_sectors.some(ps => ps.toLowerCase().includes(s.toLowerCase()))
        );
        victimMatches += sectorMatches.length;
      }
      
      if (observedVictimology.regions) {
        const regionMatches = observedVictimology.regions.filter(r =>
          actor.victimology.preferred_regions.some(pr => pr.toLowerCase().includes(r.toLowerCase()) || pr === 'global')
        );
        victimMatches += regionMatches.length;
      }

      if (victimMatches > 0) {
        matchWeight += (victimMatches / 4) * victimWeight; // Normalize
        signals.push({
          signal_type: 'victimology_match',
          description: `Matches known targeting patterns`,
          weight: victimWeight,
        });
      }
    }

    const matchScore = totalWeight > 0 ? Math.round((matchWeight / totalWeight) * 100) : 0;

    if (matchScore > 20) { // Minimum threshold
      matches.push({
        actor_id: actor.actor_id,
        actor_name: actor.actor_name,
        match_score: matchScore,
        matching_signals: signals,
        confidence: Math.min(95, actor.confidence * (matchScore / 100)),
      });
    }
  }

  return matches.sort((a, b) => b.match_score - a.match_score);
}

/**
 * Get actor DNA by ID.
 */
export function getActorDNA(actorId: string): ActorDNA | null {
  return ACTOR_DNA_DB.find(a => a.actor_id === actorId) ?? null;
}

/**
 * Get all actors DNA.
 */
export function getAllActorsDNA(): ActorDNA[] {
  return ACTOR_DNA_DB;
}

/**
 * Calculate behavioral similarity between two actors.
 */
export function calculateSimilarity(actor1Id: string, actor2Id: string): {
  similarity_score: number;
  shared_patterns: string[];
  differences: string[];
} | null {
  const a1 = getActorDNA(actor1Id);
  const a2 = getActorDNA(actor2Id);
  if (!a1 || !a2) return null;

  const shared: string[] = [];
  const differences: string[] = [];

  // Compare TTPs
  const ttp1 = new Set([
    ...a1.ttp_signature.preferred_initial_access,
    ...a1.ttp_signature.tooling_preferences,
  ]);
  const ttp2 = new Set([
    ...a2.ttp_signature.preferred_initial_access,
    ...a2.ttp_signature.tooling_preferences,
  ]);

  for (const t of ttp1) {
    if (ttp2.has(t)) shared.push(`Shared TTP: ${t}`);
    else differences.push(`Only ${a1.actor_name}: ${t}`);
  }
  for (const t of ttp2) {
    if (!ttp1.has(t)) differences.push(`Only ${a2.actor_name}: ${t}`);
  }

  // Compare victimology
  const sectors1 = new Set(a1.victimology.preferred_sectors);
  const sectors2 = new Set(a2.victimology.preferred_sectors);
  for (const s of sectors1) {
    if (sectors2.has(s)) shared.push(`Shared target sector: ${s}`);
  }

  const similarityScore = Math.round(
    (shared.length / Math.max(shared.length + differences.length, 1)) * 100
  );

  return {
    similarity_score: similarityScore,
    shared_patterns: shared,
    differences,
  };
}

// ── Route Handlers ──────────────────────────────────────────────────────

/** POST /api/v1/threat-intel/actor-dna/match */
export async function actorDnaMatchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json<{
    ttps: string[];
    infrastructure?: string[];
    sectors?: string[];
    regions?: string[];
  }>();

  if (!body.ttps || body.ttps.length === 0) {
    return c.json({ error: 'ttps array required' }, 400);
  }

  const matches = await matchActorDNA(
    body.ttps,
    body.infrastructure,
    { sectors: body.sectors, regions: body.regions }
  );

  return c.json({ matches, count: matches.length });
}

/** GET /api/v1/threat-intel/actor-dna/:actorId */
export async function actorDnaGetHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const actorId = c.req.param('actorId') ?? '';
  if (!actorId) {
    return c.json({ error: 'actorId parameter required' }, 400);
  }
  const dna = getActorDNA(actorId);

  if (!dna) {
    return c.json({ error: 'Actor not found' }, 404);
  }

  return c.json(dna);
}

/** GET /api/v1/threat-intel/actor-dna */
export async function actorDnaListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const actors = getAllActorsDNA();
  return c.json({
    actors: actors.map(a => ({
      actor_id: a.actor_id,
      actor_name: a.actor_name,
      aliases: a.aliases,
      first_seen: a.first_seen,
      last_seen: a.last_seen,
      confidence: a.confidence,
      primary_sectors: a.victimology.preferred_sectors.slice(0, 3),
    })),
    count: actors.length,
  });
}

/** GET /api/v1/threat-intel/actor-dna/compare/:actor1/:actor2 */
export async function actorDnaCompareHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const actor1 = c.req.param('actor1') ?? '';
  const actor2 = c.req.param('actor2') ?? '';

  if (!actor1 || !actor2) {
    return c.json({ error: 'Both actor1 and actor2 parameters required' }, 400);
  }

  const comparison = calculateSimilarity(actor1, actor2);
  if (!comparison) {
    return c.json({ error: 'One or both actors not found' }, 404);
  }

  return c.json({
    actor1: getActorDNA(actor1)?.actor_name ?? actor1,
    actor2: getActorDNA(actor2)?.actor_name ?? actor2,
    ...comparison,
  });
}
