import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  PageOrientation,
} from 'docx';
import type { TestPlanDocument } from '../types';

function borderBottom() {
  return {
    bottom: { style: BorderStyle.SINGLE, size: 4, color: '0D9488', space: 2 },
  };
}

export async function exportTestPlanDocx(plan: TestPlanDocument): Promise<void> {
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: plan.title, bold: true, size: 48, color: '0D9488' })],
      alignment: AlignmentType.CENTER,
    }),
  );

  // Meta block
  const metaLines = [
    `Document Type: ${plan.documentType === 'test-plan' ? 'Test Plan (IEEE 829)' : plan.documentType}`,
    `Version: ${plan.version}`,
    `Date: ${plan.date}`,
    `Project: ${plan.projectName}`,
    `Prepared By: ${plan.preparedBy}`,
  ];
  for (const line of metaLines) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: line, size: 20, color: '64748B' })],
        spacing: { after: 60 },
      }),
    );
  }

  // Divider
  children.push(new Paragraph({ border: borderBottom(), spacing: { after: 240 } }));

  // Sections
  for (const section of plan.sections) {
    // Section heading
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({ text: `${section.id}. ${section.heading}`, bold: true, size: 28, color: '1E293B' }),
        ],
        spacing: { before: 360, after: 120 },
        border: borderBottom(),
      }),
    );

    if (section.content) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: section.content, size: 22 })],
          spacing: { after: 200 },
        }),
      );
    }

    if (section.subsections) {
      for (const sub of section.subsections) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: `${sub.id} ${sub.heading}`, bold: true, size: 24, color: '374151' })],
            spacing: { before: 200, after: 80 },
          }),
        );
        children.push(
          new Paragraph({
            children: [new TextRun({ text: sub.content, size: 22 })],
            spacing: { after: 160 },
          }),
        );
      }
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = `${plan.projectName.replace(/\s+/g, '_')}_TestPlan_v${plan.version}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
