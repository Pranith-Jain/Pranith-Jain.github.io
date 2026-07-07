// src/lib/dfir/report-composer/export-docx.ts
//
// DOCX export for the Report Composer. A .docx file is a zip of
// well-formed Office Open XML parts. We build the minimum parts
// (Content_Types, rels, document.xml, styles.xml) and pack them
// with JSZip, which is already in the bundle (used by apk-analysis).
//
// Pure data → Blob. No jsPDF, no React.

import JSZip from 'jszip';
import type { ReportDoc, Tlp } from './schema';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Inline: support `code` and *em* and **bold**. */
function inlineRuns(text: string): string {
  // escape first, then re-inject tags
  let s = esc(text);
  s = s.replace(
    /`([^`]+)`/g,
    '<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:color w:val="0F172A"/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>'
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>');
  s = s.replace(/\*([^*]+)\*/g, '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>');
  // segments not wrapped become plain runs
  s = s
    .split(/(<w:r>.*?<\/w:r>)/g)
    .map((seg) => (seg.startsWith('<w:r>') ? seg : `<w:r><w:t xml:space="preserve">${seg}</w:t></w:r>`))
    .join('');
  return s;
}

function para(text: string, style = 'Normal'): string {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${inlineRuns(text)}</w:p>`;
}

function heading(text: string, level: 1 | 2 | 3): string {
  return `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>${inlineRuns(text)}</w:p>`;
}

function bulletPara(text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="ListBullet"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${inlineRuns(text)}</w:p>`;
}

function renderMarkdown(md: string): string {
  const out: string[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) {
      out.push('<w:p/>');
      continue;
    }
    const h1 = /^#\s+(.*)$/.exec(line);
    if (h1) {
      out.push(heading(h1[1]!, 1));
      continue;
    }
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      out.push(heading(h2[1]!, 2));
      continue;
    }
    const h3 = /^###\s+(.*)$/.exec(line);
    if (h3) {
      out.push(heading(h3[1]!, 3));
      continue;
    }
    const b = /^[-*]\s+(.*)$/.exec(line);
    if (b) {
      out.push(bulletPara(b[1]!));
      continue;
    }
    out.push(para(line));
  }
  return out.join('');
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="708"/>
  <w:characterSpacingControl w:val="doNotCompress"/>
</w:settings>`;

function buildStylesXml(tlp: Tlp): string {
  const colorByTlp: Record<Tlp, string> = {
    CLEAR: '64748B',
    GREEN: '16A34A',
    AMBER: 'D97706',
    RED: 'DC2626',
  };
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="${colorByTlp[tlp]}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="160" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="1E293B"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet">
    <w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="TlpBanner">
    <w:name w:val="TLP Banner"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:shd w:val="clear" w:color="auto" w:fill="${colorByTlp[tlp]}"/><w:spacing w:before="0" w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr>
  </w:style>
</w:styles>`;
}

function buildDocumentXml(report: ReportDoc): string {
  const parts: string[] = [];
  // TLP banner
  parts.push(
    `<w:p><w:pPr><w:pStyle w:val="TlpBanner"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t xml:space="preserve">TLP:${report.meta.tlp} · ${esc(report.meta.title || 'Investigation Report')}</w:t></w:r></w:p>`
  );
  // Title
  parts.push(heading(report.meta.title || 'Investigation Report', 1));
  // Meta
  const meta: Array<[string, string]> = [
    ['Subject', report.meta.subject],
    ['Case ID', report.meta.caseId],
    ['Author', report.meta.author],
    ['Classification', report.meta.classification],
    ['Generated', report.meta.generatedAt],
  ];
  for (const [k, v] of meta) {
    if (!v) continue;
    parts.push(
      `<w:p><w:pPr><w:spacing w:after="40"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(k)}: </w:t></w:r><w:r><w:t xml:space="preserve">${esc(v)}</w:t></w:r></w:p>`
    );
  }
  parts.push('<w:p/>');

  // Executive summary
  if (report.executiveSummary.trim()) {
    parts.push(heading('Executive Summary', 2));
    parts.push(renderMarkdown(report.executiveSummary));
  }

  // Key findings
  if (report.findings.length) {
    parts.push(heading('Key Findings', 2));
    parts.push(
      `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/></w:tblBorders></w:tblPr>` +
        `<w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="1E293B"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>#</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:tcPr><w:tcW w:w="6500" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="1E293B"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Finding</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="1E293B"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Confidence</w:t></w:r></w:p></w:tc></w:tr>`
    );
    report.findings.forEach((f, i) => {
      parts.push(
        `<w:tr><w:tc><w:p>${i + 1}</w:p></w:tc><w:tc>${para(f.text)}</w:tc><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${esc(f.confidence)}</w:t></w:r></w:p></w:tc></w:tr>`
      );
    });
    parts.push('</w:tbl>');
    parts.push('<w:p/>');
  }

  // Sections
  for (const sec of report.sections) {
    if (!sec.heading && !sec.body.trim()) continue;
    parts.push(heading(sec.heading || 'Section', 2));
    parts.push(renderMarkdown(sec.body));
  }

  // IOCs
  if (report.iocs.length) {
    parts.push(heading('Indicators of Compromise', 2));
    parts.push(
      `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/></w:tblBorders></w:tblPr>` +
        `<w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="1E293B"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Type</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="1E293B"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Value</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="1E293B"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Context</w:t></w:r></w:p></w:tc></w:tr>`
    );
    for (const ioc of report.iocs) {
      parts.push(
        `<w:tr><w:tc><w:p>${esc(ioc.type)}</w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr><w:t>${esc(ioc.value)}</w:t></w:r></w:p></w:tc><w:tc>${para(ioc.context)}</w:tc></w:tr>`
      );
    }
    parts.push('</w:tbl>');
    parts.push('<w:p/>');
  }

  // Sources
  if (report.sources.length) {
    parts.push(heading('Sources', 2));
    for (const s of report.sources) {
      parts.push(
        `<w:p><w:pPr><w:spacing w:after="40"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">[${s.ref}] </w:t></w:r><w:r><w:t xml:space="preserve">${esc(s.name)}</w:t></w:r></w:p>` +
          (s.url
            ? `<w:p><w:pPr><w:spacing w:after="80"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr><w:t xml:space="preserve">${esc(s.url)}</w:t></w:r></w:p>`
            : '') +
          (s.retrieved
            ? `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr><w:t xml:space="preserve">Retrieved ${esc(s.retrieved)}</w:t></w:r></w:p>`
            : '')
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${parts.join('\n')}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
}

function buildCoreXml(report: ReportDoc): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/">
  <dc:title>${esc(report.meta.title)}</dc:title>
  <dc:creator>${esc(report.meta.author || 'Anonymous')}</dc:creator>
  <cp:lastModifiedBy>${esc(report.meta.author || 'Anonymous')}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${esc(report.meta.generatedAt)}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${esc(report.meta.generatedAt)}</dcterms:modified>
</cp:coreProperties>`;
}

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>pranithjain-dfir Report Composer</Application>
</Properties>`;

export async function exportReportDocx(report: ReportDoc): Promise<Blob> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.folder('_rels')!.file('.rels', ROOT_RELS);
  zip.folder('word')!.file('_rels/document.xml.rels', DOC_RELS);
  zip.folder('word')!.file('document.xml', buildDocumentXml(report));
  zip.folder('word')!.file('styles.xml', buildStylesXml(report.meta.tlp));
  zip.folder('word')!.file('numbering.xml', NUMBERING_XML);
  zip.folder('word')!.file('settings.xml', SETTINGS_XML);
  zip.folder('docProps')!.file('core.xml', buildCoreXml(report));
  zip.folder('docProps')!.file('app.xml', APP_XML);
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]/gi, '_').slice(0, 60) || 'report';
}

export function docxFilename(report: ReportDoc): string {
  return `${slug(report.meta.caseId || report.meta.title || 'report')}.docx`;
}
