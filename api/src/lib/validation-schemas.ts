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
  .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/, 'invalid domain format');

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

export const cveLookupSchema = z.object({
  id: cveIdPattern.optional(),
  q: searchQueryPattern.optional(),
}).refine((data) => data.id || data.q, {
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
  q: z.string().email('invalid email format').max(254, 'email too long'),
});

export const breachDomainSchema = z.object({
  q: domainPattern,
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
