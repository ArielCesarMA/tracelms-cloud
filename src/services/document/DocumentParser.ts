import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { DocumentSecurityGateway } from './DocumentSecurityGateway';
import { PromptSanitizer } from './PromptSanitizer';

export type UploadedFilePayload = {
  name: string;
  mimeType: string;
  contentBase64: string;
};

export type ParsedFile = {
  name: string;
  text: string;
  error?: string;
  // Phase 2.5 security metadata
  hash?: string;
  clean?: boolean;
  flaggedPatterns?: string[];
  truncated?: boolean;
  errorCode?: string;
};

// Jira priority map per TDD Section 4.3.1
const JIRA_PRIORITY_MAP: Record<string, string> = {
  Highest: 'Critical',
  High:    'High',
  Medium:  'Medium',
  Low:     'Low',
  Lowest:  'Low',
};
export { JIRA_PRIORITY_MAP };

const gateway  = new DocumentSecurityGateway();
const sanitizer = new PromptSanitizer();

export class DocumentParser {
  public async parseFiles(files: UploadedFilePayload[]): Promise<ParsedFile[]> {
    const results: ParsedFile[] = [];

    for (const file of files) {
      // ── Gateway validation ───────────────────────────────────────────────
      const gatewayResult = await gateway.validate(file);

      if (!gatewayResult.ok) {
        results.push({
          name: file.name,
          text: '',
          error: gatewayResult.reason,
          errorCode: gatewayResult.code,
        });
        continue;
      }

      // ── Text extraction from validated buffer ────────────────────────────
      let rawText: string;
      try {
        rawText = await this.parseSingle(gatewayResult.buffer, file.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown parsing error.';
        results.push({ name: file.name, text: '', error: message, hash: gatewayResult.hash });
        continue;
      }

      // ── Prompt sanitizer (boundary wrap + injection scan + length cap) ───
      const sanitized = sanitizer.sanitize(rawText);

      results.push({
        name: file.name,
        text: sanitized.text,
        hash: gatewayResult.hash,
        clean: sanitized.clean,
        flaggedPatterns: sanitized.flaggedPatterns,
        truncated: sanitized.truncated,
      });
    }

    return results;
  }

  // Accept pre-validated Buffer instead of re-decoding base64
  private async parseSingle(buffer: Buffer, fileName: string): Promise<string> {
    const lower = fileName.toLowerCase();

    if (lower.endsWith('.txt') || lower.endsWith('.md')) {
      return buffer.toString('utf8');
    }

    if (lower.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }

    if (lower.endsWith('.pdf')) {
      const result = await pdfParse(buffer);
      return (result.text ?? '').replace(/\s+/g, ' ').trim();
    }

    if (lower.endsWith('.xlsx')) {
      return await this.parseSpreadsheet(buffer, fileName);
    }

    if (lower.endsWith('.xls')) {
      throw new Error(`Legacy .xls format is not supported. Please save your file as .xlsx and re-upload.`);
    }

    if (lower.endsWith('.csv')) {
      return this.parseCsv(buffer);
    }

    if (lower.endsWith('.pptx')) {
      return await this.parsePptx(buffer);
    }

    throw new Error(`Unsupported file type for ${fileName}.`);
  }

  private async parseSpreadsheet(buffer: Buffer, fileName: string): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    await workbook.xlsx.load(ab);
    const parts: string[] = [];

    workbook.eachSheet((worksheet) => {
      const headers: string[] = [];
      const rows: string[] = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell((cell) => {
            headers.push(String(cell.value ?? '').trim());
          });
        } else {
          const values: string[] = [];
          row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const header = headers[colNumber - 1] ?? `Col${colNumber}`;
            const val = String(cell.value ?? '').trim();
            if (val) values.push(`${header}: ${val}`);
          });
          if (values.length) rows.push(values.join(' | '));
        }
      });

      if (rows.length) {
        parts.push(`=== Sheet: "${worksheet.name}" ===\n${rows.join('\n')}`);
      }
    });

    if (!parts.length) {
      throw new Error(`No readable content found in ${fileName}.`);
    }

    return parts.join('\n\n');
  }

  private parseCsv(buffer: Buffer): string {
    const text = buffer.toString('utf8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return '';

    const parseLine = (line: string): string[] =>
      line.split(',').map((cell) => cell.replace(/^"|"$/g, '').trim());

    const headers = parseLine(lines[0]);
    return lines
      .slice(1)
      .map((line) => {
        const cells = parseLine(line);
        return headers
          .map((h, i) => (cells[i]?.trim() ? `${h}: ${cells[i].trim()}` : ''))
          .filter(Boolean)
          .join(' | ');
      })
      .filter((row) => row.trim())
      .join('\n');
  }

  private async parsePptx(buffer: Buffer): Promise<string> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      throw new Error('Failed to parse .pptx file. Ensure the file is not password-protected.');
    }

    const slideKeys = Object.keys(zip.files)
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
        const nb = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
        return na - nb;
      });

    const slideTexts: string[] = [];
    for (const key of slideKeys) {
      const xml = await zip.files[key].async('string');
      const matches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) ?? [];
      const text = matches
        .map((m) => m.replace(/<[^>]+>/g, '').trim())
        .filter((t) => t.length > 0)
        .join(' ');
      if (text) slideTexts.push(text);
    }

    if (!slideTexts.length) {
      throw new Error('No text content found in the .pptx file.');
    }

    return slideTexts.join('\n\n');
  }
}
