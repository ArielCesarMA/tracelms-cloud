// Converts TraceLMs_Cloud_Technical_Document_v0.1.0.md to .docx
// Run: node scripts/md-to-docx.js

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, PageBreak, ExternalHyperlink,
  TableOfContents
} = require('docx');

const MD_PATH = path.join(__dirname, '../DOCUMENTATION/TraceLMs Cloud/TraceLMs_Cloud_Technical_Document_v0.1.0.md');
const OUT_PATH = path.join(__dirname, '../DOCUMENTATION/TraceLMs Cloud/TraceLMs_Cloud_Technical_Document_v0.1.0.docx');

const raw = fs.readFileSync(MD_PATH, 'utf8');
const lines = raw.split('\n');

// ── Helpers ──────────────────────────────────────────────────────────────────

function cellBorder() {
  const b = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' };
  return { top: b, bottom: b, left: b, right: b };
}

function makeTableCell(text, isHeader = false) {
  return new TableCell({
    borders: cellBorder(),
    shading: isHeader ? { type: ShadingType.CLEAR, fill: '2D5BE3', color: 'auto' } : undefined,
    children: [new Paragraph({
      children: [new TextRun({
        text,
        bold: isHeader,
        color: isHeader ? 'FFFFFF' : '1A1A2E',
        size: 18,
        font: 'Calibri',
      })],
      spacing: { before: 60, after: 60 },
    })],
  });
}

function makeTable(headerRow, dataRows) {
  const rows = [
    new TableRow({ children: headerRow.map((h) => makeTableCell(h, true)), tableHeader: true }),
    ...dataRows.map((row) => new TableRow({ children: row.map((c) => makeTableCell(c, false)) })),
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

// Parse inline bold/code markers into TextRun[]
function parseInline(text) {
  const runs = [];
  // Split on **bold** and `code` patterns
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      runs.push(new TextRun({ text: text.slice(last, m.index), font: 'Calibri', size: 20, color: '1A1A2E' }));
    }
    const inner = m[0];
    if (inner.startsWith('**')) {
      runs.push(new TextRun({ text: inner.slice(2, -2), bold: true, font: 'Calibri', size: 20, color: '1A1A2E' }));
    } else {
      runs.push(new TextRun({ text: inner.slice(1, -1), font: 'Courier New', size: 18, color: '2D5BE3' }));
    }
    last = m.index + inner.length;
  }
  if (last < text.length) {
    runs.push(new TextRun({ text: text.slice(last), font: 'Calibri', size: 20, color: '1A1A2E' }));
  }
  return runs.length ? runs : [new TextRun({ text, font: 'Calibri', size: 20, color: '1A1A2E' })];
}

// ── Parser state ─────────────────────────────────────────────────────────────

const children = [];
let i = 0;

// Title paragraph
children.push(new Paragraph({
  children: [new TextRun({
    text: 'TraceLMs Cloud',
    bold: true,
    size: 56,
    font: 'Calibri',
    color: '2D5BE3',
  })],
  spacing: { before: 400, after: 80 },
  alignment: AlignmentType.CENTER,
}));

while (i < lines.length) {
  const line = lines[i];

  // Skip the first H1 (already handled as title above) and H2 version line
  if (line.startsWith('# TraceLMs Cloud')) { i++; continue; }
  if (line.startsWith('## Version')) {
    children.push(new Paragraph({
      children: [new TextRun({ text: line.replace('## ', ''), size: 24, color: '666666', font: 'Calibri' })],
      spacing: { before: 0, after: 80 },
      alignment: AlignmentType.CENTER,
    }));
    i++; continue;
  }

  // HR dividers
  if (line.trim() === '---') { i++; continue; }

  // Table of Contents label
  if (line.startsWith('## Table of Contents')) {
    children.push(new Paragraph({
      text: 'Table of Contents',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    }));
    i++;
    // Skip TOC lines
    while (i < lines.length && lines[i].trim() !== '') i++;
    continue;
  }

  // Headings
  if (line.startsWith('### ')) {
    children.push(new Paragraph({
      children: parseInline(line.slice(4)),
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 300, after: 100 },
    }));
    i++; continue;
  }
  if (line.startsWith('## ')) {
    children.push(new Paragraph({
      children: parseInline(line.slice(3)),
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 150 },
    }));
    i++; continue;
  }
  if (line.startsWith('# ')) {
    children.push(new Paragraph({
      children: parseInline(line.slice(2)),
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 500, after: 200 },
    }));
    i++; continue;
  }

  // Tables — collect all rows until blank line
  if (line.startsWith('|')) {
    const tableLines = [];
    while (i < lines.length && lines[i].startsWith('|')) {
      tableLines.push(lines[i]);
      i++;
    }
    // Filter out separator row (---|---|...)
    const filtered = tableLines.filter((l) => !/^\|[-: |]+\|$/.test(l.trim()));
    if (filtered.length < 2) continue;

    const parseRow = (l) => l.split('|').slice(1, -1).map((c) => c.trim());
    const header = parseRow(filtered[0]);
    const data = filtered.slice(1).map(parseRow);
    children.push(makeTable(header, data));
    children.push(new Paragraph({ text: '', spacing: { after: 160 } }));
    continue;
  }

  // Fenced code block
  if (line.startsWith('```')) {
    i++;
    const codeLines = [];
    while (i < lines.length && !lines[i].startsWith('```')) {
      codeLines.push(lines[i]);
      i++;
    }
    i++; // skip closing ```
    codeLines.forEach((cl) => {
      children.push(new Paragraph({
        children: [new TextRun({
          text: cl || ' ',
          font: 'Courier New',
          size: 16,
          color: '2D2D2D',
        })],
        spacing: { before: 0, after: 0 },
        shading: { type: ShadingType.CLEAR, fill: 'F4F4F8' },
        indent: { left: 360 },
      }));
    });
    children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
    continue;
  }

  // Numbered list items (1. 2. 3. ...)
  if (/^\d+\.\s/.test(line)) {
    const text = line.replace(/^\d+\.\s+/, '');
    children.push(new Paragraph({
      children: parseInline(text),
      numbering: { reference: 'numbered-list', level: 0 },
      spacing: { before: 40, after: 40 },
    }));
    i++; continue;
  }

  // Bullet list items (- or *)
  if (/^(\s*)([-*])\s/.test(line)) {
    const indent = line.match(/^(\s*)/)[1].length;
    const text = line.replace(/^\s*[-*]\s+/, '');
    // skip checkbox items [ ] [x]
    const cleanText = text.replace(/^\[[ x]\]\s*/, '');
    children.push(new Paragraph({
      children: parseInline(cleanText),
      bullet: { level: Math.floor(indent / 2) },
      spacing: { before: 40, after: 40 },
    }));
    i++; continue;
  }

  // Blank line
  if (line.trim() === '') {
    children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
    i++; continue;
  }

  // Normal paragraph
  children.push(new Paragraph({
    children: parseInline(line),
    spacing: { before: 0, after: 100 },
  }));
  i++;
}

// ── Build document ────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [{
      reference: 'numbered-list',
      levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 360 } } } }],
    }],
  },
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 20, color: '1A1A2E' } },
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal',
        run: { bold: true, size: 36, color: '2D5BE3', font: 'Calibri' },
        paragraph: { spacing: { before: 480, after: 200 }, keepNext: true },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal',
        run: { bold: true, size: 28, color: '1A1A2E', font: 'Calibri' },
        paragraph: { spacing: { before: 360, after: 160 }, keepNext: true },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal',
        run: { bold: true, size: 22, color: '444466', font: 'Calibri' },
        paragraph: { spacing: { before: 280, after: 100 }, keepNext: true },
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUT_PATH, buffer);
  console.log('Written:', OUT_PATH);
}).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
