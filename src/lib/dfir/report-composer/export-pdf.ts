// src/lib/dfir/report-composer/export-pdf.ts
//
// PDF export for the Report Composer. Pure data-in, blob-out —
// no React. The dynamic imports of jspdf + jspdf-autotable keep the
// ~600KB jsPDF bundle out of the page chunk; it only loads when the
// user actually exports.

import type { ReportDoc, Tlp } from './schema';

const TLP_RGB: Record<Tlp, [number, number, number]> = {
  CLEAR: [100, 116, 139],
  GREEN: [22, 163, 74],
  AMBER: [217, 119, 6],
  RED: [220, 38, 38],
};

const CONFIDENCE_RGB = {
  High: [220, 38, 38],
  Medium: [217, 119, 6],
  Low: [100, 116, 139],
} as const;

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

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Strip simple markdown bold markers. Heading/bullet logic handled separately. */
function cleanInline(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
}

export async function exportReportPdf(report: ReportDoc): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;
  const tlp = report.meta.tlp;
  const [tr, tg, tb] = TLP_RGB[tlp];
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

  const heading = (text: string, size = 14): void => {
    ensure(size + 8);
    doc.setFontSize(size);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(text, margin, y);
    y += size + 4;
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
      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        heading(cleanInline(h[2]), Math.max(11, 14 - h[1].length));
        continue;
      }
      const b = /^[-*]\s+(.*)$/.exec(line);
      if (b) {
        doc.setFontSize(10);
        const lines = doc.splitTextToSize(cleanInline(b[1]), maxW - 14) as string[];
        lines.forEach((ln, i) => {
          ensure(12);
          if (i === 0) doc.text('•', margin, y);
          doc.text(ln, margin + 12, y);
          y += 12;
        });
        y += 2;
        continue;
      }
      para(cleanInline(line), 10, 4);
    }
  };

  // ── Cover header band (TLP stripe) ─────────────────────────────
  doc.setFillColor(tr, tg, tb);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`TLP:${tlp}`, margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);

  y = margin + 8;

  // ── Title ───────────────────────────────────────────────────────
  heading(report.meta.title, 22);
  if (report.meta.subject) para(`Subject: ${report.meta.subject}`, 11, 2);
  y += 4;

  // ── Meta block ──────────────────────────────────────────────────
  const meta: Array<[string, string]> = [
    ['Case ID', report.meta.caseId || '—'],
    ['Classification', report.meta.classification || '—'],
    ['Author', report.meta.author || '—'],
    ['Generated', fmtDate(report.meta.generatedAt)],
    [
      'TL;DR',
      `${report.findings.length} finding(s), ${report.sections.length} section(s), ${report.iocs.length} IOC(s)`,
    ],
  ];
  autoTable(doc, {
    startY: y,
    body: meta.map(([k, v]) => [k, v]),
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 100 } },
    margin: { left: margin, right: margin },
  });
  y = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 16;

  // ── Executive summary ──────────────────────────────────────────
  if (report.executiveSummary.trim()) {
    heading('Executive Summary', 14);
    renderMarkdown(report.executiveSummary);
  }

  // ── Key findings ────────────────────────────────────────────────
  if (report.findings.length) {
    heading('Key Findings', 14);
    autoTable(doc, {
      startY: y,
      head: [['#', 'Finding', 'Confidence']],
      body: report.findings.map((f, i) => [String(i + 1), f.text, f.confidence]),
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 4, valign: 'top' },
      columnStyles: { 0: { cellWidth: 24, halign: 'center' }, 2: { cellWidth: 70 } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2 && data.cell.raw) {
          const v = data.cell.raw as string;
          const rgb = CONFIDENCE_RGB[v as keyof typeof CONFIDENCE_RGB];
          if (rgb) {
            data.cell.styles.textColor = [...rgb];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 16;
  }

  // ── Sections ────────────────────────────────────────────────────
  for (const sec of report.sections) {
    if (!sec.heading && !sec.body.trim()) continue;
    heading(sec.heading || 'Section', 13);
    renderMarkdown(sec.body);
  }

  // ── IOCs ────────────────────────────────────────────────────────
  if (report.iocs.length) {
    heading('Indicators of Compromise', 14);
    autoTable(doc, {
      startY: y,
      head: [['Type', 'Value', 'Context']],
      body: report.iocs.map((i) => [i.type, i.value, i.context]),
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 180 } },
      margin: { left: margin, right: margin },
    });
    y = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 16;
  }

  // ── Sources ─────────────────────────────────────────────────────
  if (report.sources.length) {
    heading('Sources', 14);
    autoTable(doc, {
      startY: y,
      head: [['#', 'Name', 'URL', 'Retrieved']],
      body: report.sources.map((s) => [String(s.ref), s.name, s.url, s.retrieved]),
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 24, halign: 'center' }, 2: { cellWidth: 200 } },
      margin: { left: margin, right: margin },
    });
  }

  // ── Footer (TLP) on every page ──────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`TLP:${tlp} · ${report.meta.title} · Page ${i}/${total}`, margin, pageH - 16);
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

export function pdfFilename(report: ReportDoc): string {
  return `${slug(report.meta.caseId || report.meta.title || 'report')}.pdf`;
}

export { escapeXml };
