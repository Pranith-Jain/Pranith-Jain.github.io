// src/lib/dfir/report-analyzer/export-pdf.ts
//
// PDF export for the Report Analyzer. Pure data-in, blob-out — no React.
// Reuses jsPDF + jspdf-autotable (already in the bundle via report-composer).

interface Ioc {
  value: string;
  kind: string;
  confidence: number;
  confidence_band: 'high' | 'medium' | 'low';
  evidence: string;
  source: string;
}

interface Ttp {
  id: string;
  name: string;
  tactic: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
}

interface Cve {
  id: string;
  context: string;
}

interface FiveW {
  who: string;
  what: string;
  when: string;
  where: string;
  why: string;
  confidence: number;
}

interface AnalyzerOutput {
  title: string;
  source?: string;
  sourceText: string;
  textLength: number;
  generatedAt: string;
  summary: { text: string; model: string } | null;
  fiveW: FiveW | null;
  iocs: Ioc[];
  ttp: Ttp[];
  cves: Cve[];
  mindmap: unknown;
  diamond: {
    adversary: string[];
    capability: { id: string; name: string; tactic: string; evidence: string }[];
    infrastructure: string[];
    victim: { sector: string; geography: string; asset: string };
  } | null;
  attackFlow: { phase: string; techniques: { id: string; name: string; evidence: string }[] }[];
  detection: {
    siemRules: { title: string; description: string; severity: string; mitreId?: string; query?: string }[];
    monitoringGuidance: { category: string; items: string[] }[];
    cliCommands: { purpose: string; command: string; platform?: string }[];
    detectionLimitations: string[];
  } | null;
  conclusion: {
    keyTakeaways: string[];
    recommendedActions: { priority: string; action: string; rationale?: string }[];
    riskAssessment: string;
  } | null;
  errors: { branch: string; message: string }[];
  elapsed_ms: number;
}

const CONFIDENCE_RGB: Record<string, [number, number, number]> = {
  high: [220, 38, 38],
  medium: [217, 119, 6],
  low: [100, 116, 139],
};

const SEVERITY_RGB: Record<string, [number, number, number]> = {
  critical: [220, 38, 38],
  high: [234, 88, 12],
  medium: [217, 119, 6],
  low: [2, 132, 199],
};

function slug(s: string): string {
  return s.replace(/[^a-z0-9]/gi, '_').slice(0, 60) || 'report';
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export async function exportAnalyzerPdf(data: AnalyzerOutput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;
  let y = margin;

  const ensure = (needed: number): void => {
    if (y + needed > pageH - 40) {
      doc.addPage();
      y = margin;
    }
  };

  const para = (text: string, size = 10, gap = 6): void => {
    doc.setFontSize(size);
    doc.setTextColor(30, 41, 59);
    for (const line of doc.splitTextToSize(text, maxW) as string[]) {
      ensure(size + 4);
      doc.text(line, margin, y);
      y += size + 2;
    }
    y += gap;
  };

  const heading = (text: string, size = 14, accent: [number, number, number] = [59, 130, 246]): void => {
    ensure(size + 12);
    // Accent bar
    doc.setFillColor(...accent);
    doc.rect(margin, y - size + 2, 3, size - 2, 'F');
    doc.setFontSize(size);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(text, margin + 8, y);
    y += size + 6;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
  };

  const renderMarkdown = (md: string): void => {
    for (const raw of md.split('\n')) {
      const line = raw.trim();
      if (!line) {
        y += 3;
        continue;
      }
      const b = /^[-*]\s+(.*)$/.exec(line);
      if (b) {
        doc.setFontSize(10);
        const lines = doc.splitTextToSize(b[1] ?? '', maxW - 14) as string[];
        lines.forEach((ln, idx) => {
          ensure(12);
          if (idx === 0) doc.text('\u2022', margin, y);
          doc.text(ln, margin + 12, y);
          y += 12;
        });
        y += 2;
        continue;
      }
      para(line, 10, 4);
    }
  };

  // ── Cover header band ──────────────────────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('THREAT INTELLIGENCE REPORT', margin, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated ${fmtDate(data.generatedAt)}  |  ${data.textLength.toLocaleString()} chars  |  ${data.elapsed_ms} ms`, margin, 30);

  // Thin accent line
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 40, pageW, 2, 'F');

  doc.setTextColor(30, 41, 59);
  y = 56;

  // ── Title ───────────────────────────────────────────────────────
  heading(data.title, 20);
  y += 4;

  // ── Stats row ───────────────────────────────────────────────────
  const stats = [
    { label: 'IOCs', value: String(data.iocs.length), color: [2, 132, 199] as [number, number, number] },
    { label: 'TTPs', value: String(data.ttp.length), color: [124, 58, 237] as [number, number, number] },
    { label: 'CVEs', value: String(data.cves.length), color: [217, 119, 6] as [number, number, number] },
  ];
  if (data.errors.length > 0) {
    stats.push({ label: 'Degraded', value: `${data.errors.length}`, color: [234, 88, 12] as [number, number, number] });
  }
  const statW = (maxW - (stats.length - 1) * 8) / stats.length;
  for (let si = 0; si < stats.length; si++) {
    const sx = margin + si * (statW + 8);
    const s = stats[si]!;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(sx, y, statW, 24, 3, 3, 'F');
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...s.color);
    doc.text(s.value, sx + 6, y + 11);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(s.label.toUpperCase(), sx + 6, y + 19);
  }
  y += 32;

  // ── Summary ─────────────────────────────────────────────────────
  if (data.summary) {
    heading('Executive Summary', 14, [59, 130, 246]);
    renderMarkdown(data.summary.text);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    para(`Model: ${data.summary.model ?? 'unknown'}`, 8, 8);
  }

  // ── 5W Context ──────────────────────────────────────────────────
  if (data.fiveW) {
    heading('5W Context', 14, [168, 85, 247]);
    const fwRows: Array<[string, string]> = [
      ['Who', data.fiveW.who],
      ['What', data.fiveW.what],
      ['When', data.fiveW.when],
      ['Where', data.fiveW.where],
      ['Why', data.fiveW.why],
    ];
    autoTable(doc, {
      startY: y,
      head: [['Field', 'Value']],
      body: fwRows,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 3, valign: 'top' },
      columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } },
      margin: { left: margin, right: margin },
    });
    y = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 16;
  }

  // ── IOCs ────────────────────────────────────────────────────────
  if (data.iocs.length) {
    heading('Indicators of Compromise', 14, [2, 132, 199]);
    autoTable(doc, {
      startY: y,
      head: [['Kind', 'Value', 'Confidence', 'Source']],
      body: data.iocs.map((i) => [
        i.kind,
        i.value,
        `${Math.round(i.confidence * 100)}% (${i.confidence_band})`,
        i.source,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 200 }, 2: { cellWidth: 80 } },
      didParseCell: (data2) => {
        if (data2.section === 'body' && data2.column.index === 2 && data2.cell.raw) {
          const v = String(data2.cell.raw);
          const band = /high/i.test(v) ? 'high' : /medium/i.test(v) ? 'medium' : 'low';
          const rgb = CONFIDENCE_RGB[band];
          if (rgb) {
            data2.cell.styles.textColor = [...rgb];
            data2.cell.styles.fontStyle = 'bold';
          }
        }
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 16;
  }

  // ── TTPs ────────────────────────────────────────────────────────
  if (data.ttp.length) {
    heading('MITRE ATT&CK Techniques', 14, [124, 58, 237]);
    autoTable(doc, {
      startY: y,
      head: [['ID', 'Name', 'Tactic', 'Confidence']],
      body: data.ttp.map((t) => [t.id, t.name, t.tactic, t.confidence]),
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 60 }, 3: { cellWidth: 70 } },
      didParseCell: (data2) => {
        if (data2.section === 'body' && data2.column.index === 3 && data2.cell.raw) {
          const band = String(data2.cell.raw).toLowerCase() as keyof typeof CONFIDENCE_RGB;
          const rgb = CONFIDENCE_RGB[band];
          if (rgb) {
            data2.cell.styles.textColor = [...rgb];
            data2.cell.styles.fontStyle = 'bold';
          }
        }
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 16;
  }

  // ── CVEs ────────────────────────────────────────────────────────
  if (data.cves.length) {
    heading('CVEs', 14, [217, 119, 6]);
    autoTable(doc, {
      startY: y,
      head: [['CVE ID', 'Context']],
      body: data.cves.map((c) => [c.id, c.context]),
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 110 } },
      margin: { left: margin, right: margin },
    });
    y = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 16;
  }

  // ── Diamond Model ───────────────────────────────────────────────
  if (data.diamond) {
    heading('Diamond Model', 14, [236, 72, 153]);
    const dRows: Array<[string, string]> = [];
    if (data.diamond.adversary.length) dRows.push(['Adversary', data.diamond.adversary.join(', ')]);
    if (data.diamond.capability.length)
      dRows.push([
        'Capability',
        data.diamond.capability
          .slice(0, 8)
          .map((c) => c.name)
          .join(', '),
      ]);
    if (data.diamond.infrastructure.length)
      dRows.push(['Infrastructure', data.diamond.infrastructure.slice(0, 8).join(', ')]);
    dRows.push(['Sector', data.diamond.victim.sector]);
    dRows.push(['Geography', data.diamond.victim.geography]);
    dRows.push(['Asset', data.diamond.victim.asset]);
    autoTable(doc, {
      startY: y,
      head: [['Pillar', 'Details']],
      body: dRows,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 3, valign: 'top' },
      columnStyles: { 0: { cellWidth: 90, fontStyle: 'bold' } },
      margin: { left: margin, right: margin },
    });
    y = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 16;
  }

  // ── Detection ───────────────────────────────────────────────────
  if (data.detection && data.detection.siemRules.length > 0) {
    heading('Detection Opportunities', 14, [16, 185, 129]);
    autoTable(doc, {
      startY: y,
      head: [['Rule', 'Severity', 'MITRE ID', 'Description']],
      body: data.detection.siemRules.map((r) => [r.title, r.severity, r.mitreId ?? '—', r.description]),
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 1: { cellWidth: 60 }, 2: { cellWidth: 70 } },
      didParseCell: (data2) => {
        if (data2.section === 'body' && data2.column.index === 1 && data2.cell.raw) {
          const sev = String(data2.cell.raw).toLowerCase() as keyof typeof SEVERITY_RGB;
          const rgb = SEVERITY_RGB[sev];
          if (rgb) {
            data2.cell.styles.textColor = [...rgb];
            data2.cell.styles.fontStyle = 'bold';
          }
        }
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 16;
  }

  // ── Conclusion ──────────────────────────────────────────────────
  if (data.conclusion) {
    if (data.conclusion.riskAssessment) {
      heading('Risk Assessment', 13, [239, 68, 68]);
      para(data.conclusion.riskAssessment, 10, 6);
    }
    if (data.conclusion.keyTakeaways.length) {
      heading('Key Takeaways', 13, [59, 130, 246]);
      for (const t of data.conclusion.keyTakeaways) {
        ensure(12);
        doc.setFontSize(10);
        doc.text('\u2022', margin, y);
        const lines = doc.splitTextToSize(t, maxW - 14) as string[];
        lines.forEach((ln) => {
          ensure(12);
          doc.text(ln, margin + 12, y);
          y += 12;
        });
        y += 2;
      }
      y += 8;
    }
    if (data.conclusion.recommendedActions.length) {
      heading('Recommended Actions', 13, [16, 185, 129]);
      autoTable(doc, {
        startY: y,
        head: [['Priority', 'Action', 'Rationale']],
        body: data.conclusion.recommendedActions.map((a) => [a.priority, a.action, a.rationale ?? '']),
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        styles: { fontSize: 8, cellPadding: 3, valign: 'top' },
        columnStyles: { 0: { cellWidth: 70 } },
        margin: { left: margin, right: margin },
      });
      y = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
      y += 16;
    }
  }

  // ── Footer on every page ────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    // Footer line
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(margin, pageH - 28, pageW - margin, pageH - 28);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`${data.title}`, margin, pageH - 20);
    doc.text(`Page ${i}/${total}`, pageW - margin, pageH - 20, { align: 'right' });
  }

  return doc.output('blob');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pdfFilename(data: AnalyzerOutput): string {
  return `${slug(data.title || 'report')}.pdf`;
}
