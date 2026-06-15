import { describe, it, expect } from 'vitest';
import * as S from '../../src/lib/validation-schemas';
import { createExternalResourceSchema } from '../../src/lib/schemas';
const CASES = [
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
    // New threat-intel routes (mounted with validate('query', ...)).
    {
        name: 'exploitDbSchema (query)',
        schema: S.exploitDbSchema,
        valid: { q: 'log4j' },
        invalid: {}, // refine: needs q or cve
    },
    {
        name: 'cisaKevSchema (query)',
        schema: S.cisaKevSchema,
        valid: { cve: 'CVE-2021-44228' },
        invalid: { cve: 'not-a-cve' },
    },
    {
        name: 'securityUpdatesSchema (query)',
        schema: S.securityUpdatesSchema,
        valid: { vendor: 'cisco' },
        invalid: { vendor: 123 },
    },
    {
        name: 'passiveDnsSchema (query)',
        schema: S.passiveDnsSchema,
        valid: { q: 'example.com' },
        invalid: {}, // q required
    },
    {
        name: 'githubSecuritySchema (query)',
        schema: S.githubSecuritySchema,
        valid: { cve: 'CVE-2021-44228' },
        invalid: { cve: 'not-a-cve' },
    },
    {
        name: 'waybackAdvancedSchema (query)',
        schema: S.waybackAdvancedSchema,
        valid: { domain: 'example.com' },
        invalid: {}, // domain required
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
