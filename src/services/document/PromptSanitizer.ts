// ─── PromptSanitizer ──────────────────────────────────────────────────────────
// Wraps extracted document text in a named boundary block before injection
// into any LLM prompt. Flags (but does NOT silently strip) known prompt
// injection patterns so the user can decide whether to proceed or discard.

export type SanitizerResult = {
  text: string;           // boundary-wrapped (always, regardless of clean status)
  clean: boolean;
  flaggedPatterns: string[];
  flagCount: number;
  truncated: boolean;
  originalLength: number;
};

// TDD Section 4.2 — tightened regex set (audit v0.2 applied)
const INJECTION_PATTERNS: ReadonlyArray<RegExp> = [
  /ignore\s+(previous|all|prior)\s+instructions?/i,
  /disregard\s+(all|your|the)\s+(instructions?|system|prompt)/i,
  // "you are now required to submit" → clean: true (false positive guard — persona noun required)
  /you\s+are\s+(now|actually)\s+(a\s+|an\s+)?(different|new|evil|jailbreak|unrestricted|free|DAN|hacker|bot|AI|assistant)\b/i,
  /reveal\s+(your|the)\s+(system\s+prompt|instructions?|api\s+key)/i,
  /act\s+as\s+(a\s+|an\s+)?(different|new|evil|jailbreak)/i,
  /forget\s+(everything|all)\s+(above|prior|before)/i,
  /\bDAN\b/,
  /jailbreak/i,
  /\[INST\]/,
  /<\|system\|>/,
];

const MAX_TEXT_LENGTH = 150_000;
const TRUNCATION_MARKER = '\n\n[Document truncated at 150,000 characters. Upload a shorter file for complete processing.]';

export const DOCUMENT_CONTENT_START = 'DOCUMENT_CONTENT_START';
export const DOCUMENT_CONTENT_END   = 'DOCUMENT_CONTENT_END';

export class PromptSanitizer {

  sanitize(rawText: string): SanitizerResult {
    const originalLength = rawText.length;

    // ── Length cap (before boundary wrap, before scanning) ──────────────────
    let text = rawText;
    let truncated = false;
    if (text.length > MAX_TEXT_LENGTH) {
      text = text.slice(0, MAX_TEXT_LENGTH) + TRUNCATION_MARKER;
      truncated = true;
    }

    // ── Injection pattern scan (on capped text, before boundary wrap) ────────
    const flaggedPatterns: string[] = [];
    for (const pattern of INJECTION_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        flaggedPatterns.push(match[0]);
      }
    }

    // ── Boundary wrap ────────────────────────────────────────────────────────
    const wrapped = `${DOCUMENT_CONTENT_START}\n"""\n${text}\n"""\n${DOCUMENT_CONTENT_END}`;

    return {
      text: wrapped,
      clean: flaggedPatterns.length === 0,
      flaggedPatterns,
      flagCount: flaggedPatterns.length,
      truncated,
      originalLength,
    };
  }
}
