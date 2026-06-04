import type { Report, Tlp } from './report-client';

const TLP_RGB: Record<Tlp, [number, number, number]> = {
  CLEAR: [100, 116, 139],
  GREEN: [22, 163, 74],
  AMBER: [217, 119, 6],
  RED: [220, 38, 38],
};

const slug = (s: string) => s.replace(/[^a-z0-9]/gi, '_').slice(0, 60);

/** Render a Report to a print-quality A4 PDF and trigger a download. */
export async function exportReportPdf(report: Report): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;
  const tlp = report.cover.tlp;
  const [tr, tg, tb] = TLP_RGB[tlp] ?? TLP_RGB.AMBER;
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
  const cleanInline = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1');
  const bulletPara = (text: string, size = 10) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxW - 14) as string[];
    lines.forEach((line, i) => {
      ensure(size + 4);
      if (i === 0) doc.text('•', margin, y);
      doc.text(line, margin + 14, y);
      y += size + 2;
    });
    y += 2;
  };
  // Render a markdown section body: strip bold markers, headings → bold-ish line,
  // `- `/`* ` → bullets, else paragraphs.
  const mdBlock = (md: string) => {
    for (const raw of md.split('\n')) {
      const line = raw.trim();
      if (!line) {
        y += 3;
        continue;
      }
      const h = /^#{1,6}\s+(.*)$/.exec(line);
      if (h) {
        para(cleanInline(h[1]), 11, 3);
        continue;
      }
      const b = /^[-*]\s+(.*)$/.exec(line);
      if (b) {
        bulletPara(cleanInline(b[1]));
        continue;
      }
      para(cleanInline(line), 10, 4);
    }
  };

  // ── Cover ──
  doc.setFillColor(tr, tg, tb);
  doc.rect(0, 0, pageW, 8, 'F');
  doc.setFontSize(9);
  doc.setTextColor(tr, tg, tb);
  doc.text(`TLP:${tlp}`, margin, margin);
  y = margin + 28;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(22);
  for (const line of doc.splitTextToSize(report.cover.title, maxW) as string[]) {
    doc.text(line, margin, y);
    y += 26;
  }
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(report.cover.subtitle, margin, y);
  y += 18;
  doc.setFontSize(9);
  doc.text(
    `Generated ${report.cover.generated_at}  ·  ${report.cover.subject_badges.join(' · ')}  ·  Confidence: ${report.confidence.admiralty?.label ?? report.confidence.level ?? 'n/a'}`,
    margin,
    y
  );
  y += 24;
  doc.setTextColor(30, 41, 59);

  // ── Executive summary ──
  heading('Executive Summary');
  mdBlock(report.executive_summary || '—');

  // ── Sections ──
  for (const sec of report.sections) {
    heading(sec.heading);
    mdBlock(sec.body_md.replace(/\s*\[(\d+)\]/g, '[$1]'));
  }

  // ── Appendix tables ──
  const afterTable = () => {
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    y = (finalY ?? y) + 20;
  };
  if (report.appendices.iocs.length) {
    ensure(60);
    heading('Appendix A — Indicators');
    autoTable(doc, {
      startY: y,
      head: [['Type', 'Value']],
      body: report.appendices.iocs.map((i) => [i.type, i.value]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 8 },
    });
    afterTable();
  }
  if (report.appendices.mitre.length) {
    ensure(60);
    heading('Appendix B — MITRE ATT&CK');
    autoTable(doc, {
      startY: y,
      head: [['Technique', 'Name', 'Tactic']],
      body: report.appendices.mitre.map((m) => [m.technique_id, m.technique_name, m.tactic]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 8 },
    });
    afterTable();
  }
  if (report.appendices.cves.length) {
    ensure(60);
    heading('Appendix C — CVEs');
    autoTable(doc, {
      startY: y,
      head: [['CVE', 'CVSS', 'EPSS', 'KEV']],
      body: report.appendices.cves.map((c) => [c.id, c.cvss ?? '', c.epss ?? '', c.kev ? 'yes' : '']),
      margin: { left: margin, right: margin },
      styles: { fontSize: 8 },
    });
    afterTable();
  }
  if (report.appendices.sources.length) {
    ensure(60);
    heading('Appendix D — Sources (Admiralty)');
    autoTable(doc, {
      startY: y,
      head: [['#', 'Source', 'Reliability']],
      body: report.appendices.sources.map((s) => [String(s.ref), s.name, s.authority]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 8 },
    });
    afterTable();
  }

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(tr, tg, tb);
    doc.text(`TLP:${tlp}  ·  pranithjain.qzz.io  ·  page ${i}/${pages}`, margin, pageH - 20);
  }

  doc.save(`report-${slug(report.meta.subject)}.pdf`);
}
