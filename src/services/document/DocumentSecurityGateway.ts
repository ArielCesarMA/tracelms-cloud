import path from 'path';
import crypto from 'crypto';
import { fromBuffer } from 'file-type';
import JSZip from 'jszip';
import pdfParse from 'pdf-parse';
import type { UploadedFilePayload } from './DocumentParser';

// ─── Types ────────────────────────────────────────────────────────────────────

export enum GatewayErrorCode {
  EXT_BLOCKED        = 'EXT_BLOCKED',
  SIZE_EXCEEDED      = 'SIZE_EXCEEDED',
  DECODE_FAILED      = 'DECODE_FAILED',
  MIME_MISMATCH      = 'MIME_MISMATCH',
  STRUCTURE_INVALID  = 'STRUCTURE_INVALID',
  ENCRYPTED_DOCUMENT = 'ENCRYPTED_DOCUMENT',
  ZIP_BOMB           = 'ZIP_BOMB',
  MACRO_DETECTED     = 'MACRO_DETECTED',
}

export type GatewayOk = {
  ok: true;
  buffer: Buffer;
  hash: string;
  sizeBytes: number;
  detectedMime: string | null;
};

export type GatewayFail = {
  ok: false;
  code: GatewayErrorCode;
  reason: string;
};

export type GatewayResult = GatewayOk | GatewayFail;

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);

const SIZE_LIMITS: Record<string, number> = {
  '.pdf':  20 * 1024 * 1024, // 20 MB
  '.docx': 20 * 1024 * 1024,
  '.txt':   5 * 1024 * 1024, // 5 MB
  '.md':    5 * 1024 * 1024,
};

const ZIP_BOMB_SINGLE_ENTRY_LIMIT  = 100 * 1024 * 1024; // 100 MB
const ZIP_BOMB_TOTAL_LIMIT         = 200 * 1024 * 1024; // 200 MB

// ─── DocumentSecurityGateway ──────────────────────────────────────────────────

export class DocumentSecurityGateway {

  async validate(file: UploadedFilePayload): Promise<GatewayResult> {
    // ── Step 1: Extension whitelist ──────────────────────────────────────────
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return { ok: false, code: GatewayErrorCode.EXT_BLOCKED, reason: 'File type not supported.' };
    }

    // ── Step 2: File size pre-check (before Buffer.from) ────────────────────
    const b64 = file.contentBase64;
    const estimatedBytes = Math.ceil(b64.length * 0.75);
    const limit = SIZE_LIMITS[ext] ?? 5 * 1024 * 1024;
    if (estimatedBytes > limit) {
      const limitMb = limit / (1024 * 1024);
      return { ok: false, code: GatewayErrorCode.SIZE_EXCEEDED, reason: `File exceeds the ${limitMb} MB limit.` };
    }

    // ── Step 3: Base64 decode + integrity ───────────────────────────────────
    let buffer: Buffer;
    try {
      buffer = Buffer.from(b64, 'base64');
    } catch {
      return { ok: false, code: GatewayErrorCode.DECODE_FAILED, reason: 'File data is corrupted.' };
    }
    if (!buffer.length || Math.abs(buffer.length - estimatedBytes) > 3) {
      return { ok: false, code: GatewayErrorCode.DECODE_FAILED, reason: 'File data is corrupted.' };
    }

    // ── Step 4: Magic bytes / MIME verification ──────────────────────────────
    // file-type v16 has a known infinite-loop DoS on malformed ASF input (GHSA-5v7r-6r5c-r473).
    // v17+ is ESM-only and cannot be upgraded without validating esbuild output.
    // Compensating control: hard 3 s timeout around fromBuffer to cap worst-case exposure.
    const detectedType = await Promise.race([
      fromBuffer(buffer),
      new Promise<undefined>((_, reject) =>
        setTimeout(() => reject(new Error('file-type detection timed out')), 3000)
      ),
    ]).catch(() => undefined);
    const detectedMime = detectedType?.mime ?? null;

    if (ext === '.pdf') {
      if (detectedMime !== 'application/pdf') {
        return { ok: false, code: GatewayErrorCode.MIME_MISMATCH, reason: 'File content does not match extension.' };
      }
    } else if (ext === '.docx') {
      // OOXML files are ZIPs — detected mime is application/zip
      if (detectedMime !== 'application/zip') {
        return { ok: false, code: GatewayErrorCode.MIME_MISMATCH, reason: 'File content does not match extension.' };
      }
    }
    // .txt / .md: null MIME accepted by design — no magic bytes (see TDD Section 4.3)

    // ── Step 6: ZIP bomb protection (MUST run before Step 5 loadAsync) ───────
    if (ext === '.docx') {
      const zipBombCheck = this.checkZipBomb(buffer);
      if (!zipBombCheck.safe) {
        return { ok: false, code: GatewayErrorCode.ZIP_BOMB, reason: 'Document ZIP structure exceeds safe decompression limits.' };
      }
    }

    // ── Step 5: Document structure validation ────────────────────────────────
    let zip: JSZip | null = null;

    if (ext === '.docx') {
      try {
        zip = await JSZip.loadAsync(buffer);
      } catch {
        return { ok: false, code: GatewayErrorCode.STRUCTURE_INVALID, reason: 'Document is corrupted or malformed.' };
      }
      if (!zip.files['[Content_Types].xml'] || !zip.files['word/document.xml']) {
        return { ok: false, code: GatewayErrorCode.STRUCTURE_INVALID, reason: 'Document is corrupted or malformed.' };
      }
    }

    if (ext === '.pdf') {
      if (!buffer.slice(0, 5).toString('ascii').startsWith('%PDF-')) {
        return { ok: false, code: GatewayErrorCode.STRUCTURE_INVALID, reason: 'Document is corrupted or malformed.' };
      }
      try {
        await pdfParse(buffer, { max: 1 });
      } catch (err) {
        const msg = err instanceof Error ? err.message.toLowerCase() : '';
        if (msg.includes('encrypt') || msg.includes('password')) {
          return { ok: false, code: GatewayErrorCode.ENCRYPTED_DOCUMENT, reason: 'Password-protected documents cannot be processed. Remove encryption before uploading.' };
        }
        return { ok: false, code: GatewayErrorCode.STRUCTURE_INVALID, reason: 'Document is corrupted or malformed.' };
      }
    }

    // ── Step 7: Macro detection (reuses JSZip instance from Step 5) ──────────
    if (ext === '.docx' && zip) {
      if (zip.files['word/vbaProject.bin'] || zip.files['xl/vbaProject.bin']) {
        return { ok: false, code: GatewayErrorCode.MACRO_DETECTED, reason: 'Macro-enabled documents are not supported.' };
      }
    }

    // ── Step 8: SHA-256 hash ─────────────────────────────────────────────────
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    return { ok: true, buffer, hash, sizeBytes: buffer.length, detectedMime };
  }

  // ── ZIP central directory inspection (raw buffer read, no decompression) ───
  // Reads the EOCD record, iterates central directory headers, sums
  // uncompressedSize values. Rejects before any JSZip.loadAsync() call.

  private checkZipBomb(buffer: Buffer): { safe: boolean } {
    // Find EOCD signature (PK\x05\x06 = 0x06054b50) searching backward from end
    const EOCD_SIG = 0x06054b50;
    const CD_HEADER_SIG = 0x02014b50;

    let eocdOffset = -1;
    // EOCD is at most 22 + 65535 bytes from the end (comment length is 2 bytes)
    const searchStart = Math.max(0, buffer.length - 65557);
    for (let i = buffer.length - 22; i >= searchStart; i--) {
      if (buffer.readUInt32LE(i) === EOCD_SIG) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) return { safe: false }; // malformed ZIP

    // Read central directory offset and size from EOCD
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
    const cdSize   = buffer.readUInt32LE(eocdOffset + 12);

    if (cdOffset + cdSize > buffer.length) return { safe: false };

    let totalUncompressed = 0;
    let pos = cdOffset;
    const cdEnd = cdOffset + cdSize;

    while (pos + 46 <= cdEnd) {
      if (buffer.readUInt32LE(pos) !== CD_HEADER_SIG) break;

      const uncompressedSize = buffer.readUInt32LE(pos + 24);
      const fileNameLen      = buffer.readUInt16LE(pos + 28);
      const extraLen         = buffer.readUInt16LE(pos + 30);
      const commentLen       = buffer.readUInt16LE(pos + 32);

      if (uncompressedSize > ZIP_BOMB_SINGLE_ENTRY_LIMIT) {
        return { safe: false };
      }
      totalUncompressed += uncompressedSize;
      if (totalUncompressed > ZIP_BOMB_TOTAL_LIMIT) {
        return { safe: false };
      }

      pos += 46 + fileNameLen + extraLen + commentLen;
    }

    return { safe: true };
  }
}
