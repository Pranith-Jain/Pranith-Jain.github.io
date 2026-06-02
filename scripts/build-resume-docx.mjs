#!/usr/bin/env node
// Regenerates public/resume.docx from public/resume.md.
// Output is a single-column, table-free, graphic-free Word document with
// standard headings — deliberately ATS-clean. Keep the two files in sync.
//
//   node scripts/build-resume-docx.mjs
//
// Markdown subset understood (matches public/resume.md):
//   # H1            -> centered name (bold, 20pt)
//   **line**        -> directly under H1: centered title (bold, 11pt)
//   plain line      -> directly under title: centered contact line (9pt)
//   > quote         -> ignored (maintainer note)
//   ---             -> ignored
//   ## H2           -> section heading (bold, 12pt, uppercase as written)
//   **Bold** line   -> job/role line (bold, 10pt)
//   plain line      -> meta line, e.g. location | dates (10pt)
//   - bullet        -> bullet paragraph with hanging indent (10pt)

import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MD = join(ROOT, 'public', 'resume.md');
const OUT = join(ROOT, 'public', 'resume.docx');

const esc = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Strip markdown links [text](url) -> text, and inline bold markers.
// Palette (ATS-safe: parsers read text regardless of color).
const C = {
  navy: '1F3A5F', // name + section headings
  accent: '2C5F8A', // title, bullet glyphs, skill/project labels
  muted: '5A6675', // contact, location, dates
  body: '222222', // body text
  rule: 'C9D4E0', // heading underline + header divider
};

// Page geometry (twips). 0.5" sides, 0.42" top/bottom.
const PAGE = { w: 12240, h: 15840, mTop: 620, mBottom: 600, mSide: 760 };
const RIGHT_TAB = PAGE.w - PAGE.mSide * 2; // right-tab stop at the text margin

const stripLinks = (s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
const stripMd = (s) => stripLinks(s).replace(/\*\*/g, ''); // also drop bold markers

const run = (text, { bold = false, italic = false, sz = 20, color, spacing } = {}) => {
  const rpr =
    `<w:rPr>` +
    (bold ? '<w:b/>' : '') +
    (italic ? '<w:i/>' : '') +
    (color ? `<w:color w:val="${color}"/>` : '') +
    (spacing ? `<w:spacing w:val="${spacing}"/>` : '') +
    `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
  return `<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
};

const tab = () => `<w:r><w:tab/></w:r>`;

// Render `**bold**` segments inline; bold segments take `boldColor`.
const inline = (text, { sz = 20, color = C.body, boldColor } = {}) =>
  stripLinks(text)
    .split('**')
    .map((seg, i) =>
      seg === '' ? '' : run(seg, { sz, color: i % 2 ? boldColor || color : color, bold: i % 2 === 1 }),
    )
    .join('');

const para = (
  inner,
  { center = false, after = 40, before = 0, bullet = false, border = false, rightTab = false } = {},
) => {
  let ppr = '<w:pPr>';
  if (border) ppr += `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="3" w:color="${C.rule}"/></w:pBdr>`;
  if (center) ppr += '<w:jc w:val="center"/>';
  if (rightTab) ppr += `<w:tabs><w:tab w:val="right" w:pos="${RIGHT_TAB}"/></w:tabs>`;
  ppr += `<w:spacing w:before="${before}" w:after="${after}" w:line="276" w:lineRule="auto"/>`;
  if (bullet) ppr += '<w:ind w:left="216" w:hanging="216"/>';
  ppr += '</w:pPr>';
  return `<w:p>${ppr}${inner}</w:p>`;
};

function build(md) {
  const lines = md.split('\n');
  const body = [];
  let headerStage = 0; // 0=expect H1, 1=title, 2=contact, 3=done
  let expectMeta = false; // next plain line is a location/date line, not body copy

  for (const raw of lines) {
    const t = raw.replace(/\r$/, '').trim();
    if (t === '' || t === '---' || t.startsWith('>')) continue;

    // Name
    if (t.startsWith('# ')) {
      body.push(
        para(run(stripLinks(t.slice(2)), { bold: true, sz: 46, color: C.navy, spacing: 30 }), {
          center: true,
          after: 30,
        }),
      );
      headerStage = 1;
      continue;
    }
    // Section heading (ruled)
    if (t.startsWith('## ')) {
      body.push(
        para(run(stripLinks(t.slice(3)), { bold: true, sz: 23, color: C.navy, spacing: 16 }), {
          before: 200,
          after: 70,
          border: true,
        }),
      );
      expectMeta = false;
      continue;
    }
    // Title line (under name)
    if (headerStage === 1) {
      body.push(
        para(run(stripMd(t), { bold: true, sz: 21, color: C.accent, spacing: 14 }), {
          center: true,
          after: 40,
        }),
      );
      headerStage = 2;
      continue;
    }
    // Contact line (under title) — divider rule below it
    if (headerStage === 2) {
      body.push(
        para(run(stripLinks(t), { sz: 17, color: C.muted }), { center: true, after: 60, border: true }),
      );
      headerStage = 3;
      continue;
    }
    // Bullet — colored glyph + inline-bold content
    if (t.startsWith('- ')) {
      const content = inline(t.slice(2), { sz: 20, color: C.body, boldColor: C.accent });
      body.push(
        para(run('▪', { sz: 18, color: C.accent, bold: true }) + run('   ', { sz: 20 }) + content, {
          after: 64,
          bullet: true,
        }),
      );
      expectMeta = false;
      continue;
    }
    // Role/degree line (**bold**)
    if (t.startsWith('**')) {
      body.push(
        para(inline(t, { sz: 21, color: C.body, boldColor: C.navy }), { before: 60, after: 24 }),
      );
      expectMeta = true;
      continue;
    }
    // Meta line (location | dates) — left muted, date right-aligned via tab
    if (expectMeta) {
      const parts = t.split(' | ');
      let inner;
      if (parts.length > 1) {
        const date = parts.pop();
        inner =
          run(parts.join(' | '), { sz: 18, italic: true, color: C.muted }) +
          tab() +
          run(date, { sz: 18, italic: true, color: C.muted });
        body.push(para(inner, { after: 60, rightTab: true }));
      } else {
        body.push(para(run(t, { sz: 18, italic: true, color: C.muted }), { after: 60 }));
      }
      expectMeta = false;
      continue;
    }
    // Body copy (e.g. professional summary)
    body.push(para(run(stripLinks(t), { sz: 20, color: C.body }), { after: 80 }));
    expectMeta = false;
  }

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body.join('')}` +
    `<w:sectPr><w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}"/>` +
    `<w:pgMar w:top="${PAGE.mTop}" w:right="${PAGE.mSide}" w:bottom="${PAGE.mBottom}" w:left="${PAGE.mSide}" w:header="480" w:footer="480" w:gutter="0"/></w:sectPr>` +
    `</w:body></w:document>`
  );
}

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
  `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
  `</Types>`;

const RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
  `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
  `</Relationships>`;

const DOC_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
  `</w:styles>`;

const CORE =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
  `<dc:title>Pranith Jain — Resume</dc:title><dc:creator>Pranith Jain</dc:creator></cp:coreProperties>`;

const APP =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>resume-builder</Application></Properties>`;

const md = readFileSync(MD, 'utf8');
const documentXml = build(md);

const tmp = mkdtempSync(join(tmpdir(), 'resume-docx-'));
try {
  const write = (rel, content) => {
    const p = join(tmp, rel);
    execFileSync('mkdir', ['-p', p.slice(0, p.lastIndexOf('/'))]);
    writeFileSync(p, content);
  };
  write('[Content_Types].xml', CONTENT_TYPES);
  write('_rels/.rels', RELS);
  write('word/document.xml', documentXml);
  write('word/_rels/document.xml.rels', DOC_RELS);
  write('word/styles.xml', STYLES);
  write('docProps/core.xml', CORE);
  write('docProps/app.xml', APP);

  // Zip with the mimetype-style ordering Word expects (Content_Types first is fine).
  const files = [];
  const walk = (dir, base = '') => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const relPath = base ? `${base}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, relPath);
      else files.push(relPath);
    }
  };
  walk(tmp);
  rmSync(OUT, { force: true });
  execFileSync('zip', ['-X', '-q', OUT, ...files], { cwd: tmp });
  console.log(`Wrote ${OUT}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
