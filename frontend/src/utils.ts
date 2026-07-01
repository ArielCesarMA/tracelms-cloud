import { type ScenarioType, type ExtractedRequirement } from './types';

// ── Image upload constants ───────────────────────────────────────────────────

export const VISION_CAPABLE_PROVIDERS: Record<string, boolean> = {
  openai: true,
  anthropic: true,
  gemini: true,
  groq: true,
};

export const IMAGE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB

export const ACCEPTED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const ACCEPTED_IMAGE_EXTS  = ['.png', '.jpg', '.jpeg', '.webp'] as const;

// ── T-02: Client-side image resize + base64 encoding ────────────────────────
// Resizes the image if either dimension exceeds MAX_SIDE px, then returns a
// raw base64 string (no "data:..." prefix).  Uses the browser Canvas API —
// no external library needed.

export function resizeImageIfNeeded(file: File): Promise<string> {
  const MAX_SIDE = 2048;
  return new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { naturalWidth: w, naturalHeight: h } = img;
      if (w <= MAX_SIDE && h <= MAX_SIDE) {
        // No resize needed — read the file directly
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(',')[1] ?? '');
        };
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
        return;
      }
      // Resize to fit within MAX_SIDE × MAX_SIDE
      const scale = MAX_SIDE / Math.max(w, h);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 2D context unavailable.')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const outputMime = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(outputMime, 0.9);
      resolve(dataUrl.split(',')[1] ?? '');
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for resizing.'));
    };
    img.src = objectUrl;
  });
}

const EG_PATTERN = /\b(invalid|error|fail(ure|ed)?|incorrect|wrong|missing|unauthorized|forbidden|exception|reject(ed)?|denied|not found|cannot|unable|should not|negative|bad input|corrupt|expired|blocked)\b/i;
const BR_PATTERN = /\b(rule|policy|compliance|regulation|mandatory|required by|approval|workflow|permission|role|privilege|entitlement|business logic|business rule|access control|restrict)\b/i;
const EC_PATTERN = /\b(boundary|maximum|minimum|\bmax\b|\bmin\b|limit|empty|zero|\bnull\b|blank|threshold|overflow|underflow|special character|exactly|largest|smallest|upper bound|lower bound)\b/i;
const AF_PATTERN = /\b(alternative|alternate|cancel(l?ed)?|\bskip\b|optional|secondary|another way|different|bypass|partial|instead|fallback|retry)\b/i;

export function inferScenarioType(title: string, flow: string[] = [], expectedOutcome = ''): ScenarioType {
  const text = [title, ...flow, expectedOutcome].join(' ');
  if (EG_PATTERN.test(text)) return 'EG';
  if (BR_PATTERN.test(text)) return 'BR';
  if (EC_PATTERN.test(text)) return 'EC';
  if (AF_PATTERN.test(text)) return 'AF';
  return 'HP';
}

export function downloadFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildRequirementsPayload(
  uploadedReqs: ExtractedRequirement[],
  jiraReqs: ExtractedRequirement[],
  instructions: string
): string {
  const parts: string[] = [];

  if (instructions.trim()) {
    parts.push(`Instructions: ${instructions.trim()}`);
  }

  if (uploadedReqs.length) {
    const rows = uploadedReqs
      .map((r) => `${r.reqId} [${r.issueType}] [${r.requirementType}] [${r.priority}]: ${r.summary}\nDescription: ${r.description || 'No description provided.'}`)
      .join('\n\n');
    parts.push(`=== Uploaded Requirements ===\n${rows}`);
  }

  if (jiraReqs.length) {
    const rows = jiraReqs
      .map((r) => `${r.reqId} [${r.issueType}] [${r.requirementType}] [${r.priority}]: ${r.summary}\nDescription: ${r.description || 'No description provided.'}`)
      .join('\n\n');
    parts.push(`=== Jira Requirements ===\n${rows}`);
  }

  return parts.join('\n\n');
}

export function escapeCsvCell(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}
