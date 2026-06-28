import path from 'path';
import fs from 'fs';
import { DocumentSecurityGateway, GatewayErrorCode } from '../DocumentSecurityGateway';
import type { UploadedFilePayload } from '../DocumentParser';

const gateway = new DocumentSecurityGateway();

function b64(buf: Buffer): string {
  return buf.toString('base64');
}

function makePayload(name: string, content: Buffer): UploadedFilePayload {
  return { name, mimeType: '', contentBase64: b64(content) };
}

// ── Minimal valid .txt payload ─────────────────────────────────────────────────
const TXT_CONTENT = Buffer.from('Hello, world!', 'utf8');

// ── Extension tests ───────────────────────────────────────────────────────────
describe('DocumentSecurityGateway — extension whitelist', () => {
  test('allows .txt files', async () => {
    const result = await gateway.validate(makePayload('req.txt', TXT_CONTENT));
    expect(result.ok).toBe(true);
  });

  test('allows .md files', async () => {
    const result = await gateway.validate(makePayload('spec.md', TXT_CONTENT));
    expect(result.ok).toBe(true);
  });

  test('blocks .exe files', async () => {
    const result = await gateway.validate(makePayload('evil.exe', TXT_CONTENT));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(GatewayErrorCode.EXT_BLOCKED);
  });

  test('blocks .js files', async () => {
    const result = await gateway.validate(makePayload('script.js', TXT_CONTENT));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(GatewayErrorCode.EXT_BLOCKED);
  });

  test('blocks .html files', async () => {
    const result = await gateway.validate(makePayload('page.html', Buffer.from('<script>alert(1)</script>')));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(GatewayErrorCode.EXT_BLOCKED);
  });
});

// ── Size tests ────────────────────────────────────────────────────────────────
describe('DocumentSecurityGateway — size limit', () => {
  test('rejects .txt over 5 MB', async () => {
    const oversized = Buffer.alloc(6 * 1024 * 1024, 'a');
    const result = await gateway.validate(makePayload('big.txt', oversized));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(GatewayErrorCode.SIZE_EXCEEDED);
  });

  test('accepts .txt under 5 MB', async () => {
    const under = Buffer.alloc(1 * 1024 * 1024, 'a');
    const result = await gateway.validate(makePayload('small.txt', under));
    expect(result.ok).toBe(true);
  });
});

// ── Base64 decode test ─────────────────────────────────────────────────────────
describe('DocumentSecurityGateway — base64 decode', () => {
  test('rejects malformed base64', async () => {
    const payload: UploadedFilePayload = { name: 'bad.txt', mimeType: '', contentBase64: '!!!not-base64!!!' };
    const result = await gateway.validate(payload);
    // Either DECODE_FAILED or SIZE_EXCEEDED depending on length — both are failure paths
    expect(result.ok).toBe(false);
  });
});

// ── SHA-256 hash is returned on success ────────────────────────────────────────
describe('DocumentSecurityGateway — hash', () => {
  test('returns sha-256 hash on successful validation', async () => {
    const result = await gateway.validate(makePayload('file.txt', TXT_CONTENT));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  test('same content always produces the same hash', async () => {
    const r1 = await gateway.validate(makePayload('a.txt', TXT_CONTENT));
    const r2 = await gateway.validate(makePayload('b.txt', TXT_CONTENT));
    expect(r1.ok && r2.ok && r1.hash === r2.hash).toBe(true);
  });
});

// ── MIME mismatch ──────────────────────────────────────────────────────────────
describe('DocumentSecurityGateway — MIME check', () => {
  test('rejects .pdf extension with non-PDF bytes', async () => {
    // Pass plaintext as a .pdf — file-type will not detect application/pdf
    const result = await gateway.validate(makePayload('fake.pdf', Buffer.from('This is not a PDF')));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(GatewayErrorCode.MIME_MISMATCH);
  });
});
