import { describe, it, expect, vi } from 'vitest';
import type { Report } from './report-client';

const save = vi.fn();
const autoTable = vi.fn();

vi.mock('jspdf', () => {
  class FakeDoc {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
    lastAutoTable = { finalY: 100 };
    setFillColor() {}
    rect() {}
    setFontSize() {}
    setTextColor() {}
    text() {}
    splitTextToSize(t: string) {
      return [t];
    }
    addPage() {}
    getNumberOfPages() {
      return 1;
    }
    setPage() {}
    save = save;
  }
  return { jsPDF: FakeDoc };
});

vi.mock('jspdf-autotable', () => ({ default: autoTable }));

const report: Report = {
  meta: {
    id: 'r1',
    subject: 'LockBit',
    subject_type: 'ransomware',
    template: 'ransomware-group',
    tlp: 'AMBER',
    status: 'done',
    phase: 'done',
    generated_at: '2026-06-04',
  },
  cover: {
    title: 'Ransomware Group Report: LockBit',
    subtitle: 'RANSOMWARE · ransomware-group',
    tlp: 'AMBER',
    subject_badges: ['ransomware', 'ransomware-group'],
    generated_at: '2026-06-04',
  },
  executive_summary: 'LockBit is active.',
  key_findings: [{ text: 'RaaS', confidence: 'High', refs: [1] }],
  sections: [{ id: 'overview', heading: 'Group Overview', body_md: 'Operates as RaaS [1].', refs: [1] }],
  appendices: {
    iocs: [{ type: 'ipv4', value: '1.2.3.4', refs: [] }],
    mitre: [{ tactic: 'Impact', technique_id: 'T1486', technique_name: 'Data Encrypted for Impact', refs: [] }],
    cves: [{ id: 'CVE-2024-1709', cvss: 10, kev: true, refs: [] }],
    sources: [{ ref: 1, name: 'ransomwarelive-profile', authority: 'B', credibility: 2 }],
    conflicts: [],
  },
  confidence: { level: 'high', admiralty: { label: 'B-2' } },
};

describe('exportReportPdf', () => {
  it('renders without throwing and saves a PDF + emits appendix tables', async () => {
    const { exportReportPdf } = await import('./report-pdf');
    await exportReportPdf(report);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0]).toMatch(/report-LockBit\.pdf/);
    // IOC + MITRE + CVE + sources appendices → 4 autoTable calls
    expect(autoTable).toHaveBeenCalledTimes(4);
  });
});
