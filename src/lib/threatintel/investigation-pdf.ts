interface PdfObservable {
  value: string;
  type: string;
  description?: string;
  tags: string[];
  created_at: string;
}

interface PdfTask {
  title: string;
  description?: string;
  status: string;
  created_at: string;
}

interface PdfTimelineEvent {
  type: string;
  message: string;
  created_at: string;
}

export interface InvestigationPdfInput {
  title: string;
  description: string;
  severity: string;
  status: string;
  tlp: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  observables: PdfObservable[];
  tasks: PdfTask[];
  timeline: PdfTimelineEvent[];
  /** Explainable risk factors (dossier-style), when available. */
  factors?: { name: string; contribution: number; evidence: string }[];
  risk_score?: number;
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/, '').slice(0, 60) || 'investigation';

const TLP_RGB: Record<string, [number, number, number]> = {
  white: [100, 116, 139],
  green: [22, 163, 74],
  amber: [217, 119, 6],
  red: [220, 38, 38],
};

/** Render an investigation dossier to PDF and trigger a download (client-side, lazy jspdf). */
export async function exportInvestigationPdf(inv: InvestigationPdfInput): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;
  const [tr, tg, tb] = TLP_RGB[inv.tlp.toLowerCase()] ?? TLP_RGB.amber ?? [217, 119, 6];
  let y = margin;

  const ensure = (needed: number) => {
    if (y + needed > pageH - 40) {
      doc.addPage();
      y = margin;
    }
  };
  const para = (text: string, size = 10, gap = 6) => {
    doc.setFontSize(size);
    for (const line of doc.splitTextToSize(text, maxW) as string[]) {
      ensure(size + 4);
      doc.text(line, margin, y);
      y += size + 2;
    }
    y += gap;
  };
  const heading = (text: string) => {
    ensure(28);
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(text, margin, y);
    y += 18;
    doc.setTextColor(30, 41, 59);
  };

  // ── Cover ──
  doc.setFillColor(tr, tg, tb);
  doc.rect(0, 0, pageW, 8, 'F');
  doc.setFontSize(9);
  doc.setTextColor(tr, tg, tb);
  doc.text(`TLP:${inv.tlp.toUpperCase()}`, margin, margin);
  y = margin + 28;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(22);
  for (const line of doc.splitTextToSize(inv.title, maxW) as string[]) {
    doc.text(line, margin, y);
    y += 26;
  }
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `${inv.severity.toUpperCase()}  ·  ${inv.status}  ·  Created ${inv.created_at.slice(0, 10)}  ·  Updated ${inv.updated_at.slice(0, 10)}` +
      (inv.risk_score != null ? `  ·  Risk ${inv.risk_score}/100` : ''),
    margin,
    y
  );
  y += 16;
  if (inv.tags.length > 0) {
    doc.setFontSize(9);
    doc.text(inv.tags.join('  ·  ').slice(0, 140), margin, y);
    y += 16;
  }
  y += 8;
  doc.setTextColor(30, 41, 59);

  if (inv.description) {
    heading('Summary');
    para(inv.description);
  }

  if (inv.factors && inv.factors.length > 0) {
    heading('Risk Factors (explainable)');
    autoTable(doc, {
      startY: y,
      head: [['Factor', 'Points', 'Evidence']],
      body: inv.factors.map((f) => [f.name, String(f.contribution), f.evidence]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 8 },
    });
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    y = (finalY ?? y) + 20;
  }

  if (inv.observables.length > 0) {
    ensure(60);
    heading('Observables');
    autoTable(doc, {
      startY: y,
      head: [['Value', 'Type', 'Tags']],
      body: inv.observables.map((o) => [o.value, o.type, o.tags.join(', ')]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 8 },
    });
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    y = (finalY ?? y) + 20;
  }

  if (inv.tasks.length > 0) {
    ensure(60);
    heading('Tasks');
    autoTable(doc, {
      startY: y,
      head: [['Task', 'Status']],
      body: inv.tasks.map((t) => [t.title, t.status]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 8 },
    });
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    y = (finalY ?? y) + 20;
  }

  if (inv.timeline.length > 0) {
    ensure(60);
    heading('Timeline');
    autoTable(doc, {
      startY: y,
      head: [['When', 'Event']],
      body: inv.timeline.slice(0, 100).map((e) => [e.created_at.slice(0, 16).replace('T', ' '), `${e.type}: ${e.message}`.slice(0, 160)]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 8 },
    });
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    y = (finalY ?? y) + 20;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(tr, tg, tb);
    doc.text(`TLP:${inv.tlp.toUpperCase()}  ·  pranithjain.qzz.io  ·  page ${i}/${pages}`, margin, pageH - 20);
  }

  doc.save(`investigation-${slug(inv.title)}.pdf`);
}
