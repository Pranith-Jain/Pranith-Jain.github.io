import { describe, it, expect } from 'vitest';
import { assembleReport } from '../../../src/lib/report/assemble';
const subject = {
    raw: 'LockBit',
    type: 'ransomware',
    canonical: 'LockBit',
    identifiers: { group: 'LockBit' },
    suggestedTemplate: 'ransomware-group',
};
const writer = {
    executive_summary: 'LockBit is an active RaaS operation.',
    sections: [
        { id: 'overview', heading: 'Group Overview', body_md: 'LockBit operates as RaaS [1]. [High]', refs: [1] },
        { id: 'ttps', heading: 'TTPs', body_md: 'Uses T1486 for impact [2].', refs: [2] },
    ],
    citations: [
        { ref: 1, sourceId: 'ransomwarelive-profile', text: 'RaaS' },
        { ref: 2, sourceId: 'mitre-group', text: 'T1486' },
    ],
    modelUsed: 'fake',
};
const sources = [
    {
        id: 'ransomwarelive-profile',
        name: 'ransomware.live',
        authority: 'B',
        fetched_at: '2026-06-04T00:00:00Z',
        status: 'ok',
        total: 1,
        items: [{ text: 'RaaS' }],
    },
    {
        id: 'mitre-group',
        name: 'MITRE',
        authority: 'A',
        fetched_at: '2026-06-04T00:00:00Z',
        status: 'ok',
        total: 1,
        items: [
            {
                text: 'T1486 Data Encrypted for Impact (Impact)',
                fields: { kind: 'mitre', id: 'T1486', name: 'Data Encrypted for Impact', tactic: 'Impact' },
            },
        ],
    },
    {
        id: 'live-iocs',
        name: 'Live IOCs',
        authority: 'C',
        fetched_at: '2026-06-04T00:00:00Z',
        status: 'ok',
        total: 1,
        items: [{ text: '1.2.3.4', fields: { value: '1.2.3.4', kind: 'ipv4' } }],
    },
];
describe('assembleReport', () => {
    const report = assembleReport({
        id: 'rep-1',
        subject,
        template: 'ransomware-group',
        tlp: 'AMBER',
        writer,
        sources,
        validatedMitre: ['T1486'],
        conflicts: [{ claim: 'ransom:acme', positions: ['1000000', '2000000'], note: 'sources disagree' }],
        generatedAt: '2026-06-04T00:00:00Z',
    });
    it('sets cover + meta with the input TLP and done status', () => {
        expect(report.cover.tlp).toBe('AMBER');
        expect(report.cover.title).toContain('LockBit');
        expect(report.meta.status).toBe('done');
        expect(report.meta.template).toBe('ransomware-group');
    });
    it('builds a sources appendix with per-source Admiralty grades', () => {
        const grades = Object.fromEntries(report.appendices.sources.map((s) => [s.name, s.authority]));
        expect(grades['ransomwarelive-profile']).toBe('B');
        expect(grades['mitre-group']).toBe('A');
    });
    it('builds mitre/ioc appendices and carries conflicts through', () => {
        expect(report.appendices.mitre.map((m) => m.technique_id)).toContain('T1486');
        expect(report.appendices.mitre[0]?.technique_name).toBe('Data Encrypted for Impact');
        expect(report.appendices.iocs.map((i) => i.value)).toContain('1.2.3.4');
        expect(report.appendices.conflicts).toHaveLength(1);
    });
    it('derives non-empty key findings with parsed confidence', () => {
        expect(report.key_findings.length).toBeGreaterThan(0);
        expect(report.key_findings[0]?.confidence).toBe('High');
        expect(report.confidence).toBeDefined();
    });
});
