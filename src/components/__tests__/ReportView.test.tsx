import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportView } from '../threatintel/ReportView';
import type { Report } from '../../lib/threatintel/report-client';

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
  executive_summary: 'LockBit is an active RaaS operation [1].',
  key_findings: [{ text: 'Operates as RaaS', confidence: 'High', refs: [1] }],
  sections: [
    { id: 'overview', heading: 'Group Overview', body_md: 'LockBit operates as RaaS [1].', refs: [1] },
    { id: 'ttps', heading: 'TTPs', body_md: 'Uses T1486 [2].', refs: [2] },
  ],
  appendices: {
    iocs: [{ type: 'ipv4', value: '1.2.3.4', refs: [] }],
    mitre: [{ tactic: 'Impact', technique_id: 'T1486', technique_name: 'Data Encrypted for Impact', refs: [] }],
    cves: [{ id: 'CVE-2024-1709', cvss: 10, kev: true, refs: [] }],
    sources: [
      { ref: 1, name: 'ransomwarelive-profile', authority: 'B', credibility: 2 },
      { ref: 2, name: 'mitre-group', authority: 'A', credibility: 2 },
    ],
    conflicts: [{ claim: 'ransom:acme', positions: ['1M', '2M'], note: 'sources disagree' }],
  },
  confidence: { level: 'high', admiralty: { label: 'B-2' } },
};

describe('ReportView', () => {
  it('renders the cover, TLP, sections, appendices, and citations', () => {
    render(<ReportView report={report} onExportPdf={() => {}} />);
    expect(screen.getByText('Ransomware Group Report: LockBit')).toBeInTheDocument();
    expect(screen.getByText('TLP:AMBER')).toBeInTheDocument();
    expect(screen.getByText('Executive Summary')).toBeInTheDocument();
    expect(screen.getByText('Group Overview')).toBeInTheDocument();
    expect(screen.getByText('TTPs')).toBeInTheDocument();
    expect(screen.getByText('Appendix A — Indicators')).toBeInTheDocument();
    expect(screen.getByText('Appendix B — MITRE ATT&CK')).toBeInTheDocument();
    expect(screen.getByText('Appendix D — Sources')).toBeInTheDocument();
    expect(screen.getByText('Sources Conflict')).toBeInTheDocument();
    // a citation anchor exists and points at the sources appendix
    const cite = screen.getAllByText('[1]').find((el) => el.tagName === 'A');
    expect(cite).toBeDefined();
    expect(cite).toHaveAttribute('href', '#report-src-1');
  });

  it('calls onExportPdf when the Export PDF button is clicked', () => {
    const onExportPdf = vi.fn();
    render(<ReportView report={report} onExportPdf={onExportPdf} />);
    fireEvent.click(screen.getByText('Export PDF'));
    expect(onExportPdf).toHaveBeenCalledOnce();
  });
});
