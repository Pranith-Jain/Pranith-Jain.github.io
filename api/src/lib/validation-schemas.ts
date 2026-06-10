/**
 * Zod validation schemas for API request parameters.
 *
 * Applied via the `validate('query', schema)` middleware to ensure
 * consistent input validation across all endpoints. Prevents injection
 * via oversized inputs and provides standardized error messages.
 *
 * Usage:
 *   import { validate } from '../lib/validate';
 *   import { iocCheckSchema } from '../lib/validation-schemas';
 *   app.get('/api/v1/ioc/check', validate('query', iocCheckSchema), handler);
 */

import { z } from 'zod';

// ── Common patterns ──────────────────────────────────────────────

/** IOC indicator — IP, domain, URL, hash, or email. Max 2048 chars. */
const indicatorPattern = z
  .string()
  .min(1, 'indicator is required')
  .max(2048, 'indicator too long')
  .transform((s) => s.trim());

/** Domain name — basic FQDN validation. */
const domainPattern = z
  .string()
  .min(1, 'domain is required')
  .max(253, 'domain too long')
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/,
    'invalid domain format'
  );

/** IPv4 or IPv6 address. */
const ipPattern = z
  .string()
  .min(1, 'IP address is required')
  .max(45, 'IP address too long')
  .regex(/^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/, 'invalid IP address format');

/** CVE identifier. */
const cveIdPattern = z
  .string()
  .min(1, 'CVE ID is required')
  .max(20, 'CVE ID too long')
  .regex(/^CVE-\d{4}-\d{4,7}$/i, 'invalid CVE format — expected CVE-YYYY-NNNNN');

/** Search query — general purpose. */
const searchQueryPattern = z
  .string()
  .min(1, 'query is required')
  .max(500, 'query too long')
  .transform((s) => s.trim());

/** URL — http/https only. */
const urlPattern = z
  .string()
  .min(1, 'URL is required')
  .max(2048, 'URL too long')
  .refine((s) => /^https?:\/\//i.test(s), 'URL must start with http:// or https://');

/** ASN number. */
const asnPattern = z
  .string()
  .min(1, 'ASN is required')
  .max(20, 'ASN too long')
  .transform((s) => s.replace(/^AS/i, '').trim())
  .refine((s) => /^\d+$/.test(s), 'invalid ASN format');

/** Limit parameter with default. */
const limitParam = (def: number, max: number) =>
  z
    .string()
    .optional()
    .transform((s) => (s ? Math.min(Math.max(parseInt(s, 10) || def, 1), max) : def));

/** Days lookback parameter. */
const daysParam = (def: number) =>
  z
    .string()
    .optional()
    .transform((s) => (s ? Math.min(Math.max(parseInt(s, 10) || def, 1), 365) : def));

// ── IOC Check ────────────────────────────────────────────────────

export const iocCheckSchema = z.object({
  indicator: indicatorPattern,
});

// ── Domain Lookup ────────────────────────────────────────────────

export const domainLookupSchema = z.object({
  domain: domainPattern,
});

// ── IP Geolocation ───────────────────────────────────────────────

export const ipGeoSchema = z.object({
  ip: ipPattern,
});

// ── ASN Lookup ───────────────────────────────────────────────────

export const asnLookupSchema = z.object({
  asn: asnPattern,
});

// ── CVE Lookup ───────────────────────────────────────────────────

export const cveLookupSchema = z
  .object({
    id: cveIdPattern.optional(),
    q: searchQueryPattern.optional(),
  })
  .refine((data) => data.id || data.q, {
    message: 'either id or q parameter is required',
  });

// ── MITRE Technique ──────────────────────────────────────────────

// The handler (mitre.ts mitreTechniqueHandler) reads `technique` (with `t`/`q`
// aliases) and does its own required + format validation. The prior schema
// required `id`, which the handler never reads, so every `?technique=T1059`
// was 400'd by this middleware before the handler ran. Keep these optional and
// let the handler own the required/format checks.
export const mitreTechniqueSchema = z.object({
  technique: z.string().max(20).optional(),
  t: z.string().max(20).optional(),
  q: z.string().max(20).optional(),
});

// ── Search Endpoints ─────────────────────────────────────────────

export const searchSchema = z.object({
  q: searchQueryPattern,
});

export const searchWithLimitSchema = z.object({
  q: searchQueryPattern,
  limit: limitParam(20, 200),
});

// ── Breach Check ─────────────────────────────────────────────────

export const breachEmailSchema = z.object({
  email: z.string().email('invalid email format').max(254, 'email too long'),
});

export const breachDomainSchema = z.object({
  domain: domainPattern,
});

// ── URL Analysis ─────────────────────────────────────────────────

export const urlAnalysisSchema = z.object({
  url: urlPattern,
});

// ── Wayback Machine ──────────────────────────────────────────────

export const waybackSchema = z.object({
  url: urlPattern,
});

// wayback-advanced.ts reads `domain` (required) + date_range/filter/include_suspicious
// (optional, self-validated). It never reads `url`, so reusing waybackSchema 400'd
// every valid request — this mirrors the handler's actual query reads.
export const waybackAdvancedSchema = z.object({
  domain: z.string().min(1).max(253),
  date_range: z.string().max(40).optional(),
  filter: z.string().max(50).optional(),
  include_suspicious: z.string().max(10).optional(),
});

// ── Google Dorks ─────────────────────────────────────────────────

// The handler (google-dorks.ts) reads `q` (required, self-validated) and `num`
// (parsed + clamped itself). The prior schema required `domain`/`type`, which
// the handler never reads, so every `?q=...` was 400'd before the handler ran.
export const googleDorksSchema = z.object({
  q: z.string().min(1).max(500).optional(),
  num: z.string().max(4).optional(),
});

// ── Crypto Trace ─────────────────────────────────────────────────

export const cryptoTraceSchema = z.object({
  address: z.string().min(1, 'address is required').max(200, 'address too long'),
  chain: z.enum(['bitcoin', 'ethereum', 'monero']).optional(),
});

// ── CT Monitor ───────────────────────────────────────────────────

export const ctCertsSchema = z.object({
  domain: domainPattern,
  days: daysParam(30),
  limit: limitParam(100, 500),
});

// ── Feed Endpoints ───────────────────────────────────────────────

export const feedWithLimitSchema = z.object({
  limit: limitParam(50, 500),
});

export const feedWithSearchSchema = z.object({
  q: searchQueryPattern.optional(),
  limit: limitParam(50, 500),
});

// ── IOC Lifecycle ────────────────────────────────────────────────

export const iocLifecycleSchema = z.object({
  indicator: indicatorPattern,
});

export const iocTrendingSchema = z.object({
  limit: limitParam(50, 200),
  type: z.enum(['ipv4', 'domain', 'url', 'hash']).optional(),
});

// ── Relationship Graph ───────────────────────────────────────────

// GET handler (relationship-graph.ts) reads query `q` (required) + `depth?`.
export const relationshipGraphSchema = z.object({
  q: z
    .string()
    .min(1, 'missing query param q')
    .max(2048)
    .transform((s) => s.trim()),
  depth: z.string().regex(/^\d+$/, 'depth must be a number').optional(),
});

// ── Unified Search ───────────────────────────────────────────────

export const unifiedSearchSchema = z.object({
  q: searchQueryPattern,
});

// ── Threat Hunt ──────────────────────────────────────────────────

export const threatHuntSchema = z.object({
  q: searchQueryPattern,
});

// ── RAG Query ────────────────────────────────────────────────────

export const ragQuerySchema = z.object({
  q: searchQueryPattern,
  limit: limitParam(10, 50),
});

// ── Bloom Filter ─────────────────────────────────────────────────

// Handler (bloom-filter.ts bloomCheckHandler) reads indicator (required) + type?
// (ipv4|domain|url|hash). /bloom/check binds to THIS (not hashAnalyzeSchema).
export const bloomCheckSchema = z.object({
  indicator: z.string().min(1, 'indicator required').max(2048),
  type: z.enum(['ipv4', 'domain', 'url', 'hash']).optional(),
});

// ── Hash Analysis (file/analyze) ────────────────────────────────

export const hashAnalyzeSchema = z.object({
  hash: z
    .string()
    .min(32, 'hash must be at least 32 chars (MD5/SHA-1/SHA-256)')
    .max(64, 'hash too long')
    .regex(/^[a-fA-F0-9]+$/, 'hash must be hex')
    .transform((s) => s.toLowerCase()),
});

// ── OSV Dependency Scan ─────────────────────────────────────────

export const osvScanSchema = z.object({
  packages: z
    .array(
      z.object({
        name: z.string().min(1, 'package name required').max(214, 'package name too long'),
        ecosystem: z.string().min(1, 'ecosystem required').max(50, 'ecosystem too long'),
        version: z.string().max(100, 'version too long').optional(),
      })
    )
    .min(1, 'at least one package required')
    .max(250, 'too many packages (max 250)'),
});

// ── Telegram Leak Monitor (admin) ───────────────────────────────

export const telegramChannelActionSchema = z.object({
  handle: z.string().min(1, 'handle required').max(200),
  category: z.string().max(100).optional(),
});

// Handler (telegram-leak-bot.ts) reads ONLY the `url` query param (no JSON body),
// so this is bound as validate('query', …) in index.ts.
export const telegramBotRegisterSchema = z.object({
  url: z.string().url('url must be a valid URL').max(500),
});

// ── AI / LLM Endpoints (cost-abuse guards) ─────────────────────

export const aiSummarySchema = z.object({
  surface: z.string().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  items: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        body: z.string().max(10_000),
        source: z.string().max(200).optional(),
      })
    )
    .min(1, 'items array required')
    .max(50, 'too many items (max 50)'),
});

export const copilotInvestigateSchema = z.object({
  query: z.string().min(1, 'query required').max(500, 'query too long'),
});

// Handler (hunting-queries.ts) reads threat (required) + platforms? (plural array).
export const huntingQuerySchema = z.object({
  threat: z.string().min(1, 'threat description required').max(2000),
  platforms: z.array(z.string().min(1).max(50)).max(7).optional(),
});

// Handler (ir-playbooks.ts) reads incident_type (required, self-validated enum)
// + context?. Kept a length-bounded string so the handler's case-insensitive
// enum check stays authoritative.
export const irPlaybookSchema = z.object({
  incident_type: z.string().min(1, 'incident_type required').max(50),
  context: z.string().max(2000).optional(),
});

export const ruleGenerateSchema = z.object({
  rule_type: z.enum(['sigma', 'yara', 'suricata', 'snort']).optional().default('sigma'),
  description: z.string().min(10, 'description too short').max(2000),
  reference: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const ruleValidateSchema = z.object({
  rule_type: z.enum(['sigma', 'yara', 'suricata', 'snort']).optional().default('sigma'),
  rule: z.string().min(1, 'rule body required').max(50_000, 'rule too long'),
});

// ── Feedback / Assessments (user data persistence) ──────────────

export const threatIntelFeedbackSchema = z.object({
  target_type: z.enum(['copilot', 'briefing', 'pir', 'finding', 'ioc', 'assessment']),
  target_id: z.string().min(1).max(200),
  rating: z.enum(['useful', 'not_useful', 'actioned', 'accurate', 'inaccurate', 'no_value']),
  comment: z.string().max(1000).optional(),
  sector: z.string().max(100).optional(),
});

// Handler (assessments.ts assessmentCreateHandler) requires title/type/topic/body;
// type mirrors AssessmentType. assessmentUpdateSchema (.partial()) inherits this.
export const assessmentSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['actor', 'campaign', 'cve', 'ransomware', 'sector', 'general']),
  topic: z.string().min(1).max(500),
  body: z.string().min(1).max(50_000),
  sources: z.array(z.string().max(200)).max(100).optional(),
  confidence_score: z.number().min(0).max(100).optional(),
  confidence_level: z.string().max(50).optional(),
  author: z.string().max(100).optional(),
  sector: z.string().max(100).optional(),
  related_pirs: z.array(z.string().max(200)).max(100).optional(),
});

// assessmentUpdateHandler spreads Partial<Assessment> — all optional, plus the
// publish-transition `status` (AssessmentStatus).
export const assessmentUpdateSchema = assessmentSchema
  .extend({
    status: z.enum(['draft', 'review', 'published', 'archived']).optional(),
  })
  .partial();

// ── PIR (Priority Intelligence Requirement) ─────────────────────

// Handler (pir.ts pirCreateHandler) requires title/consumer/decision; the rest
// optional. Enums mirror PirCategory/PirPriority/PirStatus.
export const pirCreateSchema = z.object({
  title: z.string().min(1).max(200),
  consumer: z.string().min(1).max(200),
  decision: z.string().min(1).max(2000),
  description: z.string().max(5000).optional(),
  category: z
    .enum(['ransomware', 'apt', 'phishing', 'vulnerability', 'supply_chain', 'insider', 'sector', 'general'])
    .optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
  kiqs: z.array(z.string().max(500)).max(50).optional(),
  relevant_sources: z.array(z.string().max(100)).max(100).optional(),
  coverage_score: z.number().min(0).max(100).optional(),
  min_source_ratio: z.number().min(0).max(100).optional(),
});

// pirUpdateHandler spreads Partial<Pir> — all fields optional (status now lives
// in the corrected base). Adds the cadence field the update path accepts.
export const pirUpdateSchema = pirCreateSchema
  .extend({
    collection_cadence_hours: z.number().min(1).max(168).optional(),
  })
  .partial();

export const pirAlertAckSchema = z.object({
  note: z.string().max(1000).optional(),
});

// ── Investigations (user data) ──────────────────────────────────

export const investigationCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const investigationUpdateSchema = investigationCreateSchema.partial().extend({
  status: z.enum(['open', 'in_progress', 'closed']).optional(),
});

export const investigationObservableSchema = z.object({
  type: z.enum(['ip', 'domain', 'hash', 'url', 'email', 'crypto-address', 'tx-hash']),
  value: z.string().min(1).max(2048),
  notes: z.string().max(2000).optional(),
});

export const investigationTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  assignee: z.string().max(100).optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const investigationTaskUpdateSchema = investigationTaskSchema.partial().extend({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
});

// Handler (investigations.ts addNoteHandler) reads `message`, not `content`.
export const investigationNoteSchema = z.object({
  message: z.string().min(1).max(8_000),
});

// ── Feed Scheduler (admin) ──────────────────────────────────────

// Handler (feed-scheduler.ts createFeedJobHandler) reads name/source_url/parser/
// interval_minutes/tags. `enabled` is included so feedJobUpdateSchema (.partial())
// accepts it (updateFeedJobHandler reads `enabled`); create forces it true.
export const feedJobCreateSchema = z.object({
  name: z.string().min(1).max(200),
  source_url: z.string().min(1).max(2048),
  parser: z.enum(['plaintext-ips', 'plaintext-domains', 'plaintext-urls', 'plaintext-hashes', 'csv', 'json']),
  interval_minutes: z.number().int().min(1).max(525_600).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  enabled: z.boolean().optional(),
});

export const feedJobUpdateSchema = feedJobCreateSchema.partial();

// ── Observable DB (user data) ───────────────────────────────────

// Handler (observable-db.ts saveObservableHandler) reads indicator/type/...,
// not value/context/confidence-enum. observableUpdateSchema (.partial()) below
// inherits this corrected shape, which updateObservableHandler also reads.
export const observableCreateSchema = z.object({
  indicator: z.string().min(1).max(2048),
  type: z.enum(['ip', 'domain', 'url', 'hash', 'email', 'unknown']),
  composite_score: z.number().optional(),
  verdicts: z.array(z.record(z.string(), z.unknown())).max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  tlp: z.enum(['white', 'green', 'amber', 'red']).optional(),
  confidence: z.number().min(0).max(100).optional(),
});

export const observableUpdateSchema = observableCreateSchema.partial();

// Handler (observable-db.ts addObservableNoteHandler) reads text/author.
export const observableNoteSchema = z.object({
  text: z.string().min(1).max(10_000),
  author: z.string().max(200).optional(),
});

// ── Watches (user data) ─────────────────────────────────────────

// Handler (watches.ts createWatchHandler) reads label/type/value/webhook (all
// required); watchUpdateSchema (.partial()) inherits this and matches updateWatchHandler.
export const watchCreateSchema = z.object({
  label: z.string().min(1).max(200),
  type: z.enum(['ransomware-group', 'cve-keyword', 'actor', 'ioc']),
  value: z.string().min(1).max(2048),
  webhook: z.string().url('webhook must be a valid URL').max(2048),
});

export const watchUpdateSchema = watchCreateSchema.partial();

// ── External Resources (user data) ──────────────────────────────

export const externalResourceCreateSchema = z.object({
  url: urlPattern,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

// ── Campaigns (user data) ───────────────────────────────────────

// Handler (campaigns.ts saveCampaignHandler) requires a `campaign` object with
// `campaign_name`; nested doc fields are trusted (passthrough). Plus input?/
// generated_at?/model_used?.
export const campaignCreateSchema = z.object({
  campaign: z
    .object({
      campaign_name: z.string().min(1).max(300),
    })
    .passthrough(),
  input: z
    .object({
      actor: z.string().max(200).optional(),
      sector: z.string().max(200).optional(),
      ttps: z.string().max(3000).optional(),
      notes: z.string().max(2000).optional(),
      iocs: z.array(z.string().max(300)).max(100).optional(),
    })
    .passthrough()
    .optional(),
  generated_at: z.string().max(50).optional(),
  model_used: z.string().max(100).optional(),
});

// ── Dashboard Watchlist ─────────────────────────────────────────

export const watchlistUpdateSchema = z.object({
  add: z.array(z.string().min(1).max(200)).max(50).optional(),
  remove: z.array(z.string().min(1).max(200)).max(50).optional(),
});

// ── Intel Bundle Build ──────────────────────────────────────────

export const intelBundleBuildSchema = z.object({
  indicator: indicatorPattern.optional(),
  actor: z.string().max(200).optional(),
  cve: cveIdPattern.optional(),
  include_relationships: z.boolean().optional().default(true),
});

// ── Predictive / Threat Intel POST endpoints ────────────────────

// Handler (predictive-intel.ts) reads technical?/behavioral?/actors? — all
// optional (an empty body is valid and returns an assessment).
export const predictiveAttributionSchema = z.object({
  technical: z
    .array(z.object({ indicator: z.string().min(1).max(2048), type: z.string().min(1).max(50) }))
    .max(500)
    .optional(),
  behavioral: z
    .array(z.object({ pattern: z.string().min(1).max(500) }))
    .max(500)
    .optional(),
  actors: z.array(z.string().min(1).max(200)).max(50).optional(),
});

// Handler (attack-chain.ts) reads indicators[] (required) + actors?/malware?.
export const attackChainReconstructSchema = z.object({
  indicators: z.array(indicatorPattern).min(1).max(500),
  actors: z.array(z.string().min(1).max(200)).max(50).optional(),
  malware: z.array(z.string().min(1).max(200)).max(50).optional(),
});

// Handler (actor-dna.ts) reads ttps[] (required) + infrastructure?/sectors?/regions?.
export const actorDnaMatchSchema = z.object({
  ttps: z.array(z.string().min(1).max(200)).min(1).max(100),
  infrastructure: z.array(z.string().min(1).max(200)).max(100).optional(),
  sectors: z.array(z.string().min(1).max(100)).max(50).optional(),
  regions: z.array(z.string().min(1).max(100)).max(50).optional(),
});

// Handler (cross-correlate.ts correlateHandler) reads sector?/actor?/cve_id? —
// all optional (tolerates an empty body).
export const correlationSchema = z.object({
  sector: z.string().max(100).optional(),
  actor: z.string().max(200).optional(),
  cve_id: z.string().max(20).optional(),
});

// Handler (novelty.ts noveltyBatchHandler) reads texts[] (required) + mark_seen?.
export const noveltyBatchSchema = z.object({
  texts: z.array(z.string().min(1).max(10_000)).min(1, 'texts[] required').max(500),
  mark_seen: z.boolean().optional(),
});

// Handler (campaign-lifecycle.ts) reads indicators[] as OBJECTS {value,type,...}
// (required) + name?/actor?.
export const campaignAnalyzeSchema = z.object({
  indicators: z
    .array(
      z.object({
        value: z.string().min(1).max(2048),
        type: z.string().min(1).max(20),
        first_seen: z.string().max(40).optional(),
        score: z.number().optional(),
      })
    )
    .min(1, 'indicators array required')
    .max(500),
  name: z.string().max(200).optional(),
  actor: z.string().max(200).optional(),
});

export const threatIntelEntityExtractSchema = z.object({
  text: z.string().min(1).max(100_000, 'text too long'),
  types: z
    .array(z.enum(['actor', 'malware', 'tool', 'cve', 'campaign']))
    .max(20)
    .optional(),
});

// Handler (entity-resolver.ts entityProfileHandler) reads ids[] (required).
export const threatIntelEntityProfileSchema = z.object({
  ids: z.array(z.string().min(1).max(200)).min(1).max(20),
});

// Handler (ach.ts) reads only `topic` (min 3 chars), not actor/format.
export const achGenerateSchema = z.object({
  topic: z.string().min(3).max(2000),
});

// ── Domain / Misc ───────────────────────────────────────────────

export const domainSnapshotSchema = z.object({
  domain: domainPattern,
});

export const openDirScanSchema = z.object({
  url: urlPattern,
  depth: z.number().int().min(1).max(5).optional().default(2),
  extensions: z.array(z.string().max(20)).max(50).optional(),
});

// Handler (graph-ingest.ts) reads ONLY the `source` query param (no JSON body),
// so this is bound as validate('query', …) in index.ts.
export const graphIngestSchema = z.object({
  source: z.enum(['all', 'ioc', 'phishing', 'telegram', 'ransomware']).optional(),
});

// ── MISP / Webhook / Admin ──────────────────────────────────────

// Handler (misp.ts) reads baseUrl/apiKey/endpoint/params, not method/path/body.
export const mispProxySchema = z.object({
  baseUrl: z.string().min(1).max(2048),
  apiKey: z.string().min(1).max(500),
  endpoint: z.string().min(1).max(500),
  params: z.record(z.string(), z.string()).optional(),
});

// Handler (actor-enrich-stream.ts) reads actors[] (each {slug,name,aliases?}) + limit.
export const actorEnrichStreamSchema = z.object({
  actors: z
    .array(
      z.object({
        slug: z.string().min(1).max(64),
        name: z.string().min(1).max(200),
        aliases: z.array(z.string().max(200)).max(50).optional(),
      })
    )
    .min(1)
    .max(200),
  limit: z.number().int().min(1).max(50).optional(),
});

export const campaignGeneratorSchema = z.object({
  input: z
    .object({
      actor: z.string().max(200).optional(),
      sector: z.string().max(200).optional(),
      ttps: z.string().max(3000).optional(),
      iocs: z.array(z.string().max(300)).max(30).optional(),
      notes: z.string().max(2000).optional(),
    })
    .optional()
    .default({}),
});

// Handler (automation.ts) reads only `target`; `workflow` is derived server-side.
export const automationRunSchema = z.object({
  target: z.string().min(1).max(500),
});

// ── Agent Investigate ────────────────────────────────────────────

export const agentInvestigateSchema = z.object({
  query: z
    .string()
    .min(1, 'query is required')
    .max(2000, 'query too long (max 2000 chars)')
    .transform((s) => s.trim()),
  queryType: z.string().max(50).optional(),
  maxSteps: z.number().int().min(1).max(10).optional(),
});

// ── Briefings (query-param validated) ────────────────────────────

export const briefingBuildSchema = z.object({
  type: z.enum(['daily', 'weekly', 'landscape']),
  live: z.literal('1').optional(),
});

export const briefingBackfillSchema = z.object({
  days: z
    .string()
    .optional()
    .transform((s) => (s ? Math.min(Math.max(parseInt(s, 10) || 14, 0), 21) : 14)),
  weeks: z
    .string()
    .optional()
    .transform((s) => (s ? Math.min(Math.max(parseInt(s, 10) || 3, 0), 4) : 3)),
  force: z.literal('1').optional(),
});

export const briefingDeleteSchema = z.object({
  slug: z
    .string()
    .min(1, 'slug is required')
    .regex(/^[a-z0-9-]+$/i, 'invalid slug format'),
});

export const ragIndexSchema = z.object({
  source: z.string().min(1).max(200),
  documents: z
    .array(
      z.object({
        id: z.string().min(1).max(500),
        text: z.string().min(1).max(50_000),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .min(1)
    .max(100),
});

// Mirrors the handler's internal purgeSchema (admin-purge.ts): it reads
// `urls`/`prefix` (one required), never `target`/`pattern`.
export const adminPurgeSchema = z
  .object({
    urls: z.array(z.string().url()).max(100).optional(),
    prefix: z.string().min(1).max(500).optional(),
  })
  .refine((d) => d.urls || d.prefix, { message: 'provide either "urls" or "prefix"' });

// Mirror the retention handler's contract (admin-retention.ts) and the
// RetentionTab UI, both of which use `days` (NOT `max_age_days`). The prior
// `max_age_days` field matched nothing and was silently stripped, so a custom
// retention window from the UI was being dropped by this middleware.
export const adminRetentionSchema = z.object({
  days: z.number().int().min(1).max(3650).optional(),
  dry_run: z.boolean().optional().default(false),
});

// Mirror the api-key handler's contract (admin-keys.ts createKeySchema), the
// ApiKeysTab UI, and the D1 schema (migration 0006: `label`, `role` ∈
// {admin, readonly}). The prior name/scope/expires_in_days shape matched
// nothing implemented, so this middleware 400'd every create request before
// the handler ran — that was the "API key creator throwing an error" bug.
export const adminApiKeyCreateSchema = z.object({
  label: z.string().min(1).max(100),
  role: z.enum(['admin', 'readonly']).default('readonly'),
});

// ── Dashboard Watchlist (alt name) ──────────────────────────────

export { watchlistUpdateSchema as dashboardWatchlistSchema };

// ── Raw-Text Body Endpoints (phishing, cti, report, stealer) ──
//
// These four routes accept non-JSON request bodies — email RFC 822
// headers, raw STIX JSON, threat report text, stealer log dumps — and
// were the last gap in the audit's Zod coverage list. The matching
// middleware is `validateText(schema, { maxBytes })` in
// `api/src/lib/validate.ts`; it reads the body as a string, enforces a
// byte cap, and attaches the Zod-validated value to `c.parsed`.

/**
 * Phishing email analyzer. Validates raw email text (RFC 822 headers
 * plus optional body). Capped at 64 KB to match the original handler
 * limit — anything bigger is almost certainly an attachment, not an
 * email to score.
 */
export const phishingEmailTextSchema = z
  .string()
  .min(1, 'email body is required')
  .max(65536, 'email body too long (max 64KB)');

/**
 * STIX 2.1 bundle as a JSON-encoded string. Validates the *text* size
 * here; the structural validation (type === 'bundle', objects is an
 * array) happens after `JSON.parse` in the handler — see
 * `stixBundleObjectSchema` below. Keeping the text-level and object-
 * level schemas separate avoids the (de)serialization cost of running
 * JSON.parse twice in the middleware.
 */
export const stixBundleTextSchema = z
  .string()
  .min(2, 'STIX bundle required (min 2 chars)')
  .max(1_048_576, 'STIX bundle too large (max 1MB)');

/**
 * STIX 2.1 bundle *object* schema — applied to `JSON.parse(bundleText)`
 * in the handler. We don't enforce full STIX spec compliance (that
 * would balloon the schema and reject valid bundles the parser handles
 * gracefully); we only check the top-level shape the parser relies on.
 */
export const stixBundleObjectSchema = z
  .object({
    type: z.literal('bundle'),
    id: z.string().optional(),
    objects: z.array(z.record(z.string(), z.unknown())).max(100_000, 'bundle has too many objects'),
  })
  .passthrough();

/**
 * Threat report parser. Accepts either inline `text` or a `url` to
 * fetch. The handler does the dual-format routing (text/plain vs
 * application/json); the JSON case is validated here.
 */
export const reportParserJsonSchema = z
  .object({
    text: z
      .string()
      .min(1, 'text is required when no url is given')
      .max(100_000, 'text too long (max 100KB)')
      .optional(),
    url: urlPattern.optional(),
  })
  .refine((d) => d.text || d.url, {
    message: 'either text or url is required',
  });

/**
 * Stealer log parser. Same shape as report-parser (text or url).
 * The text cap here is higher (500 KB) because stealer dumps are
 * much larger than threat reports.
 */
export const stealerParserJsonSchema = z
  .object({
    text: z
      .string()
      .min(1, 'text is required when no url is given')
      .max(500_000, 'text too long (max 500KB)')
      .optional(),
    url: urlPattern.optional(),
  })
  .refine((d) => d.text || d.url, {
    message: 'either text or url is required',
  });

/**
 * Stealer / report text body when sent as `text/plain`. The cap is the
 * higher of the two so the same schema works for both routes via
 * `validateText()`.
 */
export const rawLogTextSchema = z.string().min(1, 'log body is required').max(500_000, 'log body too long (max 500KB)');

/** Copilot full-report build request. */
export const reportBuildSchema = z.object({
  subject: z.string().min(1, 'subject is required').max(200, 'subject too long'),
  template: z.enum(['ransomware-group', 'threat-actor', 'cve', 'ioc']).optional(),
  tlp: z.enum(['CLEAR', 'GREEN', 'AMBER', 'RED']).optional().default('AMBER'),
});

// ── New Security Routes ─────────────────────────────────────────────
// exploit-db.ts reads q (keyword), cve (exact CVE id), and type (exploit type:
// remote/dos/webapps/local/shellcode). At least one of q/cve must be present.
export const exploitDbSchema = z
  .object({
    q: z.string().min(1).max(200).optional(),
    cve: cveIdPattern.optional(),
    type: z.enum(['remote', 'dos', 'webapps', 'local', 'shellcode']).optional(),
    // latest=1 returns the newest exploits (optionally filtered by type) with no
    // keyword/cve filter — used by the Global Pulse "exploit" layer.
    latest: z.enum(['1', 'true']).optional(),
  })
  .refine((v) => Boolean(v.q || v.cve || v.latest), { message: 'q, cve, or latest is required' });

export const cisaKevSchema = z.object({
  q: z.string().max(200).optional(),
  cve: cveIdPattern.optional(),
  vendor: z.string().max(100).optional(),
  product: z.string().max(100).optional(),
  days: z.string().regex(/^\d+$/).optional(),
  ransomware_only: z.string().optional(),
});

// supplychainattack.org incident catalog query filters. MUST mirror the exact
// c.req.query reads in routes/supply-chain-attacks.ts (validate() schema parity).
export const supplyChainAttacksSchema = z.object({
  ecosystem: z.string().max(40).optional(),
  status: z.string().max(20).optional(),
  severity: z.string().max(20).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

export const securityUpdatesSchema = z.object({
  q: z.string().max(200).optional(),
  vendor: z.string().max(100).optional(),
  product: z.string().max(100).optional(),
});

export const passiveDnsSchema = z.object({
  q: z.string().min(1, 'query required').max(253),
});

export const githubSecuritySchema = z.object({
  q: z.string().max(200).optional(),
  cve: cveIdPattern.optional(),
  ghsa: z.string().max(20).optional(),
  ecosystem: z.string().max(50).optional(),
  package: z.string().max(100).optional(),
});

// ── Crypto Tracer (Phase A/B) ───────────────────────────────────

export const tracerExpandSchema = z
  .object({
    address: z.string().min(1, 'address is required').max(200, 'address too long'),
    chain: z.enum(['evm', 'btc', 'tron']),
    direction: z.enum(['in', 'out', 'both']).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    around: z.string().datetime().optional(),
    toleranceMin: z.number().int().positive().max(10080).optional(),
    token: z.string().max(20).optional(),
    minAmount: z.number().nonnegative().optional(),
    maxTransfers: z.number().int().positive().max(100).optional(),
  })
  .refine((d) => !d.around || d.toleranceMin !== undefined, {
    message: 'toleranceMin is required when around is set',
    path: ['toleranceMin'],
  });
export type TracerExpandInput = z.infer<typeof tracerExpandSchema>;

export const tracerLabelSchema = z.object({
  address: z.string().min(1, 'address is required').max(200, 'address too long'),
  chain: z.enum(['evm', 'btc', 'tron']),
});
export type TracerLabelInput = z.infer<typeof tracerLabelSchema>;

export const tracerLabelAddSchema = z.object({
  address: z.string().min(1, 'address is required').max(200, 'address too long'),
  chain: z.enum(['evm', 'btc', 'tron']),
  label: z.string().min(1, 'label is required').max(80, 'label too long'),
  category: z.enum([
    'exchange',
    'mixer',
    'bridge',
    'defi',
    'contract',
    'ransomware',
    'scammer',
    'sanctioned',
    'wallet',
  ]),
});
export type TracerLabelAddInput = z.infer<typeof tracerLabelAddSchema>;

export const tracerCalldataSchema = z.object({
  chain: z.enum(['evm', 'tron']),
  hash: z.string().min(1, 'hash is required').max(80, 'hash too long'),
});
export type TracerCalldataInput = z.infer<typeof tracerCalldataSchema>;

// ── Crypto Tracer — saved graphs (Phase C) ──────────────────────
export const tracerGraphSaveSchema = z.object({
  title: z.string().min(1, 'title is required').max(120, 'title too long'),
  seed_address: z.string().min(1).max(200),
  chain: z.enum(['evm', 'btc', 'tron']),
  graph_json: z
    .string()
    .min(1)
    .max(512 * 1024, 'graph too large — prune it first'),
  investigation_id: z.string().max(64).optional(),
});
export type TracerGraphSaveInput = z.infer<typeof tracerGraphSaveSchema>;
