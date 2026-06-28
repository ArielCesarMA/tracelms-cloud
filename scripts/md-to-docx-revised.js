// Converts TraceLMs_Cloud_Technical_Document_v0.1.0_revised.md to .docx
// Run: node scripts/md-to-docx-revised.js

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, WidthType: _W,
} = require('docx');

const MD_PATH = path.join(__dirname, '../DOCUMENTATION/TraceLMs Cloud/TraceLMs_Cloud_Technical_Document_v0.1.0_revised.md');
const OUT_PATH = path.join(__dirname, '../DOCUMENTATION/TraceLMs Cloud/TraceLMs_Cloud_Technical_Document_v0.1.0_revised.docx');

const raw = fs.readFileSync(MD_PATH, 'utf8');
const lines = raw.split('\n');

// ── Design tokens ─────────────────────────────────────────────────────────────
const BRAND_BLUE   = '1A4FA8';
const BRAND_DARK   = '0F172A';
const BRAND_MID    = '1E293B';
const ACCENT_TEAL  = '0D9488';
const ACCENT_GREEN = '065F46';
const MUTED        = '64748B';
const WHITE        = 'FFFFFF';
const SURFACE      = 'F1F5F9';
const SURFACE_2    = 'E2E8F0';
const CODE_BG      = 'F8FAFC';
const CODE_FG      = '1E293B';
const WARN_BG      = 'FFFBEB';
const WARN_BORDER  = 'F59E0B';
const NOTE_BG      = 'EFF6FF';
const NOTE_BORDER  = '3B82F6';
const MISSING_BG   = 'FEF2F2';
const MISSING_FG   = '991B1B';

// Table header palettes keyed by section context
// We cycle through a small palette for variety
const TBL_HEADERS = [
  BRAND_BLUE, '5B21B6', ACCENT_GREEN, '92400E', '9D174D', BRAND_MID,
];
let tblHeaderIdx = 0;
const nextTblColor = () => TBL_HEADERS[tblHeaderIdx++ % TBL_HEADERS.length];

// ── Helpers ───────────────────────────────────────────────────────────────────

function hex(c) { return { argb: 'FF' + c }; }

function cellBorder(color = 'CBD5E1') {
  const b = { style: BorderStyle.SINGLE, size: 4, color };
  return { top: b, bottom: b, left: b, right: b };
}

function makeTableCell(text, isHeader, headerColor) {
  const color = isHeader ? WHITE : BRAND_DARK;
  const bg    = isHeader ? (headerColor || BRAND_BLUE) : null;
  return new TableCell({
    borders: cellBorder(isHeader ? headerColor || BRAND_BLUE : 'CBD5E1'),
    shading: bg ? { type: ShadingType.CLEAR, fill: bg, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({
      children: parseInline(text, { bold: isHeader, color, size: isHeader ? 19 : 18 }),
      spacing: { before: 40, after: 40 },
    })],
  });
}

function makeTable(headerRow, dataRows, headerColor) {
  const rows = [
    new TableRow({
      children: headerRow.map(h => makeTableCell(h, true, headerColor)),
      tableHeader: true,
    }),
    ...dataRows.map((row, ri) =>
      new TableRow({
        children: row.map(c => {
          const cell = makeTableCell(c, false, null);
          // Alternate row shading
          if (ri % 2 === 1) {
            cell.options = cell.options || {};
            // attach shading via the cell properties
          }
          return cell;
        }),
      })
    ),
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

// Parse inline bold/code/italic markers into TextRun[]
function parseInline(text, defaults = {}) {
  const { bold: defBold = false, color: defColor = BRAND_DARK, size: defSize = 20 } = defaults;
  const runs = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      runs.push(new TextRun({
        text: text.slice(last, m.index),
        font: 'Calibri', size: defSize, bold: defBold, color: defColor,
      }));
    }
    const inner = m[0];
    if (inner.startsWith('**')) {
      runs.push(new TextRun({
        text: inner.slice(2, -2),
        bold: true, font: 'Calibri', size: defSize, color: defColor,
      }));
    } else if (inner.startsWith('`')) {
      runs.push(new TextRun({
        text: inner.slice(1, -1),
        font: 'Courier New', size: defSize - 1, color: ACCENT_TEAL,
        highlight: 'cyan', // fallback visual
      }));
    } else if (inner.startsWith('_')) {
      runs.push(new TextRun({
        text: inner.slice(1, -1),
        italics: true, font: 'Calibri', size: defSize, color: defColor,
      }));
    }
    last = m.index + inner.length;
  }
  if (last < text.length) {
    runs.push(new TextRun({
      text: text.slice(last),
      font: 'Calibri', size: defSize, bold: defBold, color: defColor,
    }));
  }
  return runs.length
    ? runs
    : [new TextRun({ text, font: 'Calibri', size: defSize, bold: defBold, color: defColor })];
}

// Callout paragraph (blockquote style) — used for DIAGRAM SUGGESTION, REVIEW NOTE, SECTION MISSING
function makeCallout(text) {
  // Detect type
  const upper = text.toUpperCase();
  let bg = NOTE_BG, leftColor = NOTE_BORDER, labelColor = '1D4ED8';
  if (upper.includes('DIAGRAM')) {
    bg = 'F0FDF4'; leftColor = ACCENT_GREEN; labelColor = ACCENT_GREEN;
  } else if (upper.includes('REVIEW NOTE')) {
    bg = WARN_BG; leftColor = WARN_BORDER; labelColor = '92400E';
  } else if (upper.includes('SECTION MISSING')) {
    bg = MISSING_BG; leftColor = MISSING_FG; labelColor = MISSING_FG;
  }

  // Strip the markdown > prefix
  const content = text.replace(/^>\s*/, '').replace(/\n>\s*/g, '\n');

  return new Paragraph({
    children: parseInline(content, { size: 18, color: BRAND_MID }),
    shading: { type: ShadingType.CLEAR, fill: bg, color: 'auto' },
    border: {
      left: { style: BorderStyle.THICK, size: 12, color: leftColor },
    },
    indent: { left: 360, right: 360 },
    spacing: { before: 100, after: 100, line: 276 },
  });
}

// ── Parser ────────────────────────────────────────────────────────────────────

const children = [];
let i = 0;

// Cover title
children.push(new Paragraph({
  children: [new TextRun({
    text: 'TraceLMs Cloud', bold: true, size: 72, font: 'Calibri', color: BRAND_BLUE,
  })],
  spacing: { before: 600, after: 80 },
  alignment: AlignmentType.CENTER,
}));

children.push(new Paragraph({
  children: [new TextRun({
    text: 'Technical Documentation', size: 40, font: 'Calibri', color: MUTED,
  })],
  spacing: { before: 0, after: 40 },
  alignment: AlignmentType.CENTER,
}));

children.push(new Paragraph({
  children: [new TextRun({
    text: 'Version 0.1.0  ·  Released 2026-06-24', size: 22, font: 'Calibri', color: MUTED, italics: true,
  })],
  spacing: { before: 0, after: 200 },
  alignment: AlignmentType.CENTER,
}));

// Divider line via border paragraph
children.push(new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND_BLUE } },
  spacing: { before: 0, after: 400 },
}));

// Accumulate blockquote lines
let bqBuffer = [];

function flushBlockquote() {
  if (bqBuffer.length === 0) return;
  const text = bqBuffer.join(' ');
  children.push(makeCallout(text));
  children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
  bqBuffer = [];
}

while (i < lines.length) {
  const line = lines[i];

  // Skip H1 title (handled as cover above)
  if (/^# TraceLMs Cloud/.test(line)) { i++; continue; }

  // Skip version subtitle (handled as cover above)
  if (/^\*\*Version 0\.1\.0/.test(line)) { i++; continue; }

  // Classification line
  if (/^\*\*Classification/.test(line)) { i++; continue; }

  // HR dividers
  if (line.trim() === '---') {
    flushBlockquote();
    children.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' } },
      spacing: { before: 120, after: 120 },
    }));
    i++; continue;
  }

  // Table of Contents heading — output as H1 then skip TOC lines
  if (/^## Table of Contents/.test(line)) {
    flushBlockquote();
    children.push(new Paragraph({
      children: [new TextRun({ text: 'Table of Contents', bold: true, size: 36, font: 'Calibri', color: BRAND_BLUE })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 480, after: 200 },
    }));
    i++;
    while (i < lines.length && lines[i].trim() !== '') i++;
    continue;
  }

  // Blockquote lines — accumulate and detect end
  if (line.startsWith('> ') || line === '>') {
    bqBuffer.push(line.replace(/^>\s?/, ''));
    i++; continue;
  } else if (bqBuffer.length > 0) {
    flushBlockquote();
  }

  // Headings
  if (line.startsWith('#### ')) {
    children.push(new Paragraph({
      children: parseInline(line.slice(5), { bold: true, size: 20, color: BRAND_DARK }),
      heading: HeadingLevel.HEADING_4,
      spacing: { before: 240, after: 80 },
    }));
    i++; continue;
  }
  if (line.startsWith('### ')) {
    children.push(new Paragraph({
      children: parseInline(line.slice(4), { bold: true, size: 22, color: BRAND_MID }),
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 300, after: 100 },
    }));
    i++; continue;
  }
  if (line.startsWith('## ')) {
    children.push(new Paragraph({
      children: parseInline(line.slice(3), { bold: true, size: 32, color: BRAND_BLUE }),
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 480, after: 160 },
    }));
    i++; continue;
  }
  if (line.startsWith('# ')) {
    children.push(new Paragraph({
      children: parseInline(line.slice(2), { bold: true, size: 40, color: BRAND_BLUE }),
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 600, after: 200 },
    }));
    i++; continue;
  }

  // Tables — collect all | rows
  if (line.startsWith('|')) {
    const tableLines = [];
    while (i < lines.length && lines[i].startsWith('|')) {
      tableLines.push(lines[i]);
      i++;
    }
    const filtered = tableLines.filter(l => !/^\|[-: |]+\|$/.test(l.trim()));
    if (filtered.length < 2) continue;
    const parseRow = l => l.split('|').slice(1, -1).map(c => c.trim());
    const header = parseRow(filtered[0]);
    const data   = filtered.slice(1).map(parseRow);
    const hColor = nextTblColor();
    children.push(makeTable(header, data, hColor));
    children.push(new Paragraph({ text: '', spacing: { after: 160 } }));
    continue;
  }

  // Fenced code blocks
  if (line.startsWith('```')) {
    i++;
    const codeLines = [];
    while (i < lines.length && !lines[i].startsWith('```')) {
      codeLines.push(lines[i]);
      i++;
    }
    i++; // closing ```
    if (codeLines.length > 0) {
      // Code block container with shaded background
      codeLines.forEach(cl => {
        children.push(new Paragraph({
          children: [new TextRun({
            text: cl || ' ',
            font: 'Courier New', size: 16, color: CODE_FG,
          })],
          shading: { type: ShadingType.CLEAR, fill: CODE_BG, color: 'auto' },
          border: {
            left: { style: BorderStyle.THICK, size: 8, color: ACCENT_TEAL },
          },
          indent: { left: 280 },
          spacing: { before: 0, after: 0, line: 252 },
        }));
      });
      children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
    }
    continue;
  }

  // Checkbox list items (- [ ] or - [x])
  if (/^(\s*)-\s+\[[ xX]\]/.test(line)) {
    const checked = /\[x\]/i.test(line);
    const text = line.replace(/^\s*-\s+\[[ xX]\]\s*/, '');
    const indent = (line.match(/^(\s*)/) || ['',''])[1].length;
    children.push(new Paragraph({
      children: [
        new TextRun({ text: checked ? '☑ ' : '☐ ', font: 'Calibri', size: 20, color: checked ? ACCENT_GREEN : MUTED }),
        ...parseInline(text, { size: 20 }),
      ],
      indent: { left: 360 + Math.floor(indent / 2) * 360 },
      spacing: { before: 40, after: 40 },
    }));
    i++; continue;
  }

  // Numbered list items
  if (/^\d+\.\s/.test(line)) {
    const text = line.replace(/^\d+\.\s+/, '');
    children.push(new Paragraph({
      children: parseInline(text),
      numbering: { reference: 'numbered-list', level: 0 },
      spacing: { before: 40, after: 40 },
    }));
    i++; continue;
  }

  // Bullet list items
  if (/^(\s*)([-*])\s/.test(line)) {
    const indent = (line.match(/^(\s*)/) || ['',''])[1].length;
    const text = line.replace(/^\s*[-*]\s+/, '').replace(/^\[[ x]\]\s*/, '');
    children.push(new Paragraph({
      children: parseInline(text),
      bullet: { level: Math.min(Math.floor(indent / 2), 2) },
      spacing: { before: 40, after: 40 },
    }));
    i++; continue;
  }

  // Bold-only lines (standalone **text** — used as mini-headings in some sections)
  if (/^\*\*[^*]+\*\*$/.test(line.trim())) {
    const text = line.trim().slice(2, -2);
    children.push(new Paragraph({
      children: [new TextRun({ text, bold: true, font: 'Calibri', size: 22, color: BRAND_DARK })],
      spacing: { before: 160, after: 60 },
    }));
    i++; continue;
  }

  // Italic metadata lines (*text*)
  if (/^\*[^*]+\*$/.test(line.trim())) {
    const text = line.trim().slice(1, -1);
    children.push(new Paragraph({
      children: [new TextRun({ text, italics: true, font: 'Calibri', size: 18, color: MUTED })],
      spacing: { before: 40, after: 40 },
      alignment: AlignmentType.CENTER,
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

// Flush any trailing blockquote
flushBlockquote();

// ── Build document ─────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [{
      reference: 'numbered-list',
      levels: [{
        level: 0,
        format: 'decimal',
        text: '%1.',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 360 } } },
      }],
    }],
  },
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 20, color: BRAND_DARK } },
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal',
        run: { bold: true, size: 40, color: BRAND_BLUE, font: 'Calibri' },
        paragraph: {
          spacing: { before: 600, after: 200 },
          keepNext: true,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND_BLUE } },
        },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal',
        run: { bold: true, size: 32, color: BRAND_BLUE, font: 'Calibri' },
        paragraph: { spacing: { before: 480, after: 160 }, keepNext: true },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal',
        run: { bold: true, size: 22, color: BRAND_MID, font: 'Calibri' },
        paragraph: { spacing: { before: 300, after: 100 }, keepNext: true },
      },
      {
        id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal',
        run: { bold: true, size: 20, color: BRAND_DARK, font: 'Calibri' },
        paragraph: { spacing: { before: 240, after: 80 }, keepNext: true },
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, bottom: 1440, left: 1260, right: 1260 },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(OUT_PATH, buffer);
  console.log('Written:', OUT_PATH);
  const kb = Math.round(buffer.length / 1024);
  console.log(`File size: ${kb} KB`);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
