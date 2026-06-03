import { describe, it, expect } from 'vitest';
import type { ZodTypeAny } from 'zod';
import * as S from '../../src/lib/validation-schemas';
import { createExternalResourceSchema } from '../../src/lib/schemas';

// Regression guard for the systemic validate()-schema ↔ handler drift: each
// corrected schema must ACCEPT a body/query the handler actually reads and
// REJECT a clearly-invalid one. Every `valid` case below would have FAILED
// against the pre-fix schema (the bug: middleware 400'd valid requests).
interface Case {
  name: string;
  schema: ZodTypeAny;
  valid: unknown;
  invalid: unknown;
}

const CASES: Case[] = [
  { name: 'adminPurgeSchema', schema: S.adminPurgeSchema, valid: { urls: ['https://e.com/a'] }, invalid: {} },
  {
    name: 'mispProxySchema',
    schema: S.mispProxySchema,
    valid: { baseUrl: 'https://m.com', apiKey: 'k', endpoint: '/x' },
    invalid: { baseUrl: 'https://m.com', apiKey: 'k' },
  },
  {
    name: 'observableCreateSchema',
    schema: S.observableCreateSchema,
    valid: { indicator: '1.2.3.4', type: 'ip' },
    invalid: { indicator: '1.2.3.4', type: 'cve' },
  },
  { name: 'observableNoteSchema', schema: S.observableNoteSchema, valid: { text: 'x' }, invalid: { text: '' } },
  {
    name: 'investigationNoteSchema',
    schema: S.investigationNoteSchema,
    valid: { message: 'x' },
    invalid: { content: 'x' },
  },
  {
    name: 'watchCreateSchema',
    schema: S.watchCreateSchema,
    valid: { label: 'x', type: 'ioc', value: 'y', webhook: 'https://h/x' },
    invalid: { label: 'x', type: 'indicator', value: 'y', webhook: 'https://h/x' },
  },
  {
    name: 'automationRunSchema',
    schema: S.automationRunSchema,
    valid: { target: '8.8.8.8' },
    invalid: { workflow: 'x' },
  },
  { name: 'achGenerateSchema', schema: S.achGenerateSchema, valid: { topic: 'abc' }, invalid: { topic: 'ab' } },
  {
    name: 'feedJobCreateSchema',
    schema: S.feedJobCreateSchema,
    valid: { name: 'x', source_url: 'https://e.com/f', parser: 'plaintext-ips' },
    invalid: { name: 'x', source_url: 'https://e.com/f', parser: 'xml' },
  },
  {
    name: 'actorEnrichStreamSchema',
    schema: S.actorEnrichStreamSchema,
    valid: { actors: [{ slug: 'apt28', name: 'APT28' }] },
    invalid: { limit: 10 },
  },
  {
    name: 'attackChainReconstructSchema',
    schema: S.attackChainReconstructSchema,
    valid: { indicators: ['1.2.3.4'] },
    invalid: { actors: ['x'] },
  },
  {
    name: 'actorDnaMatchSchema',
    schema: S.actorDnaMatchSchema,
    valid: { ttps: ['powershell'] },
    invalid: { infrastructure: ['x'] },
  },
  {
    name: 'threatIntelEntityProfileSchema',
    schema: S.threatIntelEntityProfileSchema,
    valid: { ids: ['apt29'] },
    invalid: { entity_type: 'actor', entity_name: 'X' },
  },
  {
    name: 'predictiveAttributionSchema',
    schema: S.predictiveAttributionSchema,
    valid: {}, // handler treats all fields optional
    invalid: { technical: [{ type: 'ip' }] }, // element missing required `indicator`
  },
  { name: 'noveltyBatchSchema', schema: S.noveltyBatchSchema, valid: { texts: ['a'] }, invalid: { texts: [] } },
  { name: 'correlationSchema', schema: S.correlationSchema, valid: { sector: 'finance' }, invalid: { sector: 12345 } },
  {
    name: 'campaignAnalyzeSchema',
    schema: S.campaignAnalyzeSchema,
    valid: { indicators: [{ value: '1.2.3.4', type: 'ip' }] },
    invalid: { indicators: [] },
  },
  {
    name: 'huntingQuerySchema',
    schema: S.huntingQuerySchema,
    valid: { threat: 'x' },
    invalid: { platforms: ['Splunk'] },
  },
  {
    name: 'irPlaybookSchema',
    schema: S.irPlaybookSchema,
    valid: { incident_type: 'ransomware' },
    invalid: { context: 'x' },
  },
  {
    name: 'pirCreateSchema',
    schema: S.pirCreateSchema,
    valid: { title: 't', consumer: 'c', decision: 'd' },
    invalid: { title: 't', consumer: 'c' },
  },
  { name: 'pirUpdateSchema', schema: S.pirUpdateSchema, valid: { status: 'paused' }, invalid: { status: 'open' } },
  {
    name: 'assessmentSchema',
    schema: S.assessmentSchema,
    valid: { title: 't', type: 'actor', topic: 'x', body: 'b' },
    invalid: { title: 't', type: 'actor', topic: 'x' },
  },
  {
    name: 'assessmentUpdateSchema',
    schema: S.assessmentUpdateSchema,
    valid: { status: 'published' },
    invalid: { type: 'ttp' },
  },
  {
    name: 'relationshipGraphSchema',
    schema: S.relationshipGraphSchema,
    valid: { q: '8.8.8.8' },
    invalid: { depth: '2' },
  },
  {
    name: 'campaignCreateSchema',
    schema: S.campaignCreateSchema,
    valid: { campaign: { campaign_name: 'x' } },
    invalid: { input: { actor: 'x' } },
  },
  {
    name: 'bloomCheckSchema',
    schema: S.bloomCheckSchema,
    valid: { indicator: 'e.com' },
    invalid: { indicator: 'e.com', type: 'ip' },
  },
  {
    name: 'graphIngestSchema (query)',
    schema: S.graphIngestSchema,
    valid: { source: 'ioc' },
    invalid: { source: 'bogus' },
  },
  {
    name: 'telegramBotRegisterSchema (query)',
    schema: S.telegramBotRegisterSchema,
    valid: { url: 'https://e.com/x' },
    invalid: { url: 'not-a-url' },
  },
  {
    name: 'createExternalResourceSchema',
    schema: createExternalResourceSchema,
    valid: { name: 'x', url: 'https://e.com', kind: 'samples' },
    invalid: { name: 'x', url: 'https://e.com', kind: 'blog' },
  },
];

describe('route validate() schemas match their handlers', () => {
  for (const c of CASES) {
    it(`${c.name}: accepts a valid body, rejects an invalid one`, () => {
      expect(c.schema.safeParse(c.valid).success, `${c.name} should ACCEPT valid`).toBe(true);
      expect(c.schema.safeParse(c.invalid).success, `${c.name} should REJECT invalid`).toBe(false);
    });
  }
});
