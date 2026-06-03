/**
 * Shared Zod schemas for API request validation.
 *
 * Import and apply with the `validate` middleware:
 *
 *   import { validate } from '../lib/validate';
 *   import { createExternalResourceSchema } from '../lib/schemas';
 *   app.post('/api/v1/foo', validate('json', schema), handler);
 *
 * ⚠ Schema field names MUST match what the route handler reads from the
 * parsed body. If the handler does `body.name`, the schema must use `name`,
 * not `title`. Mismatched schemas pass validation but attach wrong data.
 */

import { z } from 'zod';

// ─── External Resources ──────────────────────────────────────────
// Handler uses safeJsonBody and reads: name, url, kind, description, why
// See routes/external-resources.ts:createExternalResourceHandler

// Handler treats description as OPTIONAL (defaults to name) and trims url to 600.
export const createExternalResourceSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url().max(600),
  kind: z.enum(['training', 'lab', 'tool', 'dashboard', 'directory', 'samples', 'community', 'research']),
  description: z.string().max(600).optional(),
  why: z.string().max(600).optional(),
});

// ─── Telegram Custom Channels ────────────────────────────────────
// Handler reads: handle, name (optional)
// Handle validation: /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/ (stripped of @ prefix)

export const telegramCustomChannelSchema = z.object({
  handle: z
    .string()
    .regex(
      /^@?[a-zA-Z][a-zA-Z0-9_]{3,31}$/,
      'invalid handle — must be 4-32 alphanumeric chars, starting with a letter'
    ),
  name: z.string().min(1).max(100).optional(),
});

// ─── Campaign Generator ──────────────────────────────────────────

export const campaignGeneratorSchema = z.object({
  technique: z.string().min(1).max(200),
  title: z.string().min(1).max(200).optional(),
  persona: z.string().max(500).optional(),
  target_role: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
});

// ─── Campaign Save ────────────────────────────────────────────────

export const saveCampaignSchema = z.object({
  title: z.string().min(1).max(200),
  technique: z.string().min(1).max(200),
  content: z.string().min(1).max(100_000),
  persona: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
});

// ─── Intel Bundle ────────────────────────────────────────────────

export const intelBundleSchema = z.object({
  source: z.string().min(1).max(100),
  external_id: z.string().max(200).optional(),
  objects: z.array(z.record(z.string(), z.any())).min(1).max(5000),
});
