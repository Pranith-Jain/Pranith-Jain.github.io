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

export const mitreTechniqueSchema = z.object({
  id: z
    .string()
    .min(1, 'technique ID is required')
    .max(20, 'technique ID too long')
    .regex(/^T\d{4}(\.\d{3})?$/, 'invalid MITRE technique format — expected TNNNN or TNNNN.NNN'),
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

// ── Google Dorks ─────────────────────────────────────────────────

export const googleDorksSchema = z.object({
  domain: domainPattern,
  type: z.enum(['files', 'login', 'sensitive', 'all']).optional().default('all'),
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

export const relationshipGraphSchema = z.object({
  indicator: indicatorPattern,
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

export const bloomCheckSchema = z.object({
  type: z.enum(['ip', 'domain', 'hash']),
  value: indicatorPattern,
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
  channel_id: z.string().min(1, 'channel_id required').max(200),
  reason: z.string().max(500).optional(),
});

export const telegramBotRegisterSchema = z.object({
  bot_token: z.string().min(20, 'bot token too short').max(100, 'bot token too long'),
  webhook_url: z.string().url('webhook_url must be a valid URL').max(500),
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

export const huntingQuerySchema = z.object({
  platform: z.enum(['splunk', 'elastic', 'kql', 'sigma', 'kusto']).optional(),
  hypothesis: z.string().min(10, 'hypothesis too short').max(2000),
  data_sources: z.array(z.string().max(100)).max(20).optional(),
});

export const irPlaybookSchema = z.object({
  scenario: z.string().min(10, 'scenario too short').max(2000),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
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

export const assessmentSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['actor', 'campaign', 'ttp', 'infrastructure', 'malware']).optional(),
  summary: z.string().max(5000).optional(),
  findings: z.array(z.string().max(1000)).max(50).optional(),
  indicators: z.array(indicatorPattern).max(100).optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
});

export const assessmentUpdateSchema = assessmentSchema.partial();

// ── PIR (Priority Intelligence Requirement) ─────────────────────

export const pirCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  sector: z.string().max(100).optional(),
  indicators: z.array(indicatorPattern).max(100).optional(),
});

export const pirUpdateSchema = pirCreateSchema.partial().extend({
  status: z.enum(['open', 'investigating', 'resolved', 'closed']).optional(),
});

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
  type: z.enum(['ip', 'domain', 'hash', 'url', 'email']),
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

export const investigationNoteSchema = z.object({
  content: z.string().min(1).max(10_000),
});

// ── Feed Scheduler (admin) ──────────────────────────────────────

export const feedJobCreateSchema = z.object({
  name: z.string().min(1).max(200),
  source: z.string().min(1).max(200),
  schedule: z.string().min(1).max(100),
  enabled: z.boolean().optional().default(true),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const feedJobUpdateSchema = feedJobCreateSchema.partial();

// ── Observable DB (user data) ───────────────────────────────────

export const observableCreateSchema = z.object({
  type: z.enum(['ip', 'domain', 'hash', 'url', 'email', 'cve']),
  value: z.string().min(1).max(2048),
  tags: z.array(z.string().max(50)).max(20).optional(),
  context: z.string().max(2000).optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
});

export const observableUpdateSchema = observableCreateSchema.partial();

export const observableNoteSchema = z.object({
  content: z.string().min(1).max(10_000),
});

// ── Watches (user data) ─────────────────────────────────────────

export const watchCreateSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['indicator', 'actor', 'campaign', 'cve']),
  target: z.string().min(1).max(2048),
  threshold: z.number().int().min(1).max(100).optional(),
  enabled: z.boolean().optional().default(true),
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

export const campaignCreateSchema = z.object({
  name: z.string().min(1).max(200),
  actor: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  indicators: z.array(indicatorPattern).max(100).optional(),
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

export const predictiveAttributionSchema = z.object({
  indicator: indicatorPattern,
  candidate_actors: z.array(z.string().min(1).max(200)).min(1).max(20),
});

export const attackChainReconstructSchema = z.object({
  incident_id: z.string().min(1).max(200).optional(),
  events: z
    .array(
      z.object({
        timestamp: z.string().max(50),
        event_type: z.string().max(100),
        description: z.string().max(1000),
        source: z.string().max(200).optional(),
      })
    )
    .min(1)
    .max(500),
});

export const actorDnaMatchSchema = z.object({
  indicator: indicatorPattern,
  candidate_actors: z.array(z.string().min(1).max(200)).min(1).max(20).optional(),
});

export const correlationSchema = z.object({
  indicators: z.array(indicatorPattern).min(1).max(50),
  timeframe: z
    .string()
    .regex(/^\d+[hd]$/)
    .optional(),
});

export const noveltyBatchSchema = z.object({
  indicators: z
    .array(
      z.object({
        type: z.enum(['ip', 'domain', 'hash', 'url']),
        value: z.string().min(1).max(2048),
      })
    )
    .min(1)
    .max(500),
});

export const campaignAnalyzeSchema = z.object({
  campaign_id: z.string().min(1).max(200).optional(),
  indicators: z.array(indicatorPattern).max(100).optional(),
  actor: z.string().max(200).optional(),
});

export const threatIntelEntityExtractSchema = z.object({
  text: z.string().min(1).max(100_000, 'text too long'),
  types: z
    .array(z.enum(['actor', 'malware', 'tool', 'cve', 'campaign']))
    .max(20)
    .optional(),
});

export const threatIntelEntityProfileSchema = z.object({
  entity_type: z.enum(['actor', 'malware', 'tool', 'campaign']),
  entity_name: z.string().min(1).max(200),
});

export const achGenerateSchema = z.object({
  actor: z.string().min(1).max(200),
  format: z.enum(['stix', 'mitre', 'narrative']).optional().default('stix'),
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

export const graphIngestSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(500),
        type: z.string().min(1).max(100),
        properties: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .max(1000),
  edges: z
    .array(
      z.object({
        source: z.string().min(1).max(500),
        target: z.string().min(1).max(500),
        relationship: z.string().min(1).max(100),
      })
    )
    .max(2000),
});

// ── MISP / Webhook / Admin ──────────────────────────────────────

export const mispProxySchema = z.object({
  method: z.enum(['GET', 'POST']),
  path: z.string().min(1).max(500),
  body: z.record(z.string(), z.unknown()).optional(),
});

export const actorEnrichStreamSchema = z.object({
  actor: z.string().min(1).max(200),
  stream_type: z.enum(['pulse', 'indicators', 'malware']).optional().default('pulse'),
});

export const campaignGeneratorSchema = z.object({
  topic: z.string().min(3).max(200),
  format: z.enum(['briefing', 'report', 'executive']).optional().default('briefing'),
  context: z.string().max(5000).optional(),
});

export const automationRunSchema = z.object({
  workflow: z.string().min(1).max(200),
  params: z.record(z.string(), z.unknown()).optional(),
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

export const adminPurgeSchema = z.object({
  target: z.enum(['cache', 'kv', 'r2']),
  pattern: z.string().max(500).optional(),
});

export const adminRetentionSchema = z.object({
  dry_run: z.boolean().optional().default(false),
  max_age_days: z.number().int().min(1).max(3650).optional(),
});

export const adminApiKeyCreateSchema = z.object({
  name: z.string().min(1).max(200),
  scope: z.enum(['read', 'write', 'admin']).optional().default('read'),
  expires_in_days: z.number().int().min(1).max(3650).optional(),
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
