# Image & Screenshot Upload Support

**Feature Name:** Image & Screenshot Upload Support
**TDD Version:** v0.5
**Delivery Date:** 2026-06-26
**Last Updated:** 2026-06-26
**Status:** CLOSED — All 6 atomic tasks implemented. `npm run typecheck:all` → 0 errors.

---

## T-01 — Constants, Types, Client-Side Size/Type Validation

**Task Description:** Extend `frontend/src/types.ts` with image-related fields on `UploadDraft`. Add `VISION_CAPABLE_PROVIDERS`, `IMAGE_SIZE_LIMIT_BYTES`, `ACCEPTED_IMAGE_MIMES`, and `ACCEPTED_IMAGE_EXTS` constants to `frontend/src/utils.ts`.

**Criterion:** Type system knows which upload drafts are images; constants drive all image-gate logic from a single source of truth; no hardcoded values in components.

**Delivered:**
- `frontend/src/types.ts`: extended `UploadDraft` with `isImage?: boolean`, `thumbnailUrl?: string`, `sizeError?: string`
- `frontend/src/utils.ts`: added `VISION_CAPABLE_PROVIDERS` (`{ openai: true, anthropic: true, google: true, groq: false }`), `IMAGE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024`, `ACCEPTED_IMAGE_MIMES`, `ACCEPTED_IMAGE_EXTS`
- `frontend/src/App.tsx` `handleFileChange`: for image MIME types, performs client-side 10MB size check before any API call; sets `isImage: true`, `thumbnailUrl: URL.createObjectURL(file)`, `sizeError` message on oversized files; non-image files continue through existing `toBase64` path unchanged

---

## T-02 — Client-Side Image Resize + Base64 Encoding Utility

**Task Description:** Add `resizeImageIfNeeded(file: File): Promise<string>` to `frontend/src/utils.ts`. Uses the browser Canvas API to resize images exceeding 2048px on their longest edge before encoding. Returns a raw base64 string (no `data:` prefix). No external library required.

**Criterion:** Images wider or taller than 2048px are downscaled before encoding; images within the limit are encoded directly without canvas overhead; function returns raw base64 suitable for the backend vision endpoint.

**Delivered:**
- `resizeImageIfNeeded(file)` in `frontend/src/utils.ts`: loads image via `URL.createObjectURL`, checks `naturalWidth`/`naturalHeight` against 2048px, skips resize if within bounds (reads directly via `FileReader`), else renders to `document.createElement('canvas')` scaled by `MAX_SIDE / Math.max(w, h)`, outputs `canvas.toDataURL(outputMime, 0.9)` split at `','` to return raw base64
- `frontend/src/App.tsx` `handleFileChange`: calls `resizeImageIfNeeded(file)` for image MIME types instead of `toBase64`

---

## T-03 — Backend Vision Branch, Prompt, and LLM Vision Methods

**Task Description:** Create `src/prompts/image-requirement-extraction.txt` vision prompt. Add `POST /api/generate/extract-image-requirements` endpoint to `src/routes/generate.ts` with `imageBase64` branch. Add `completeVision` to the `LLMProvider` interface and implement for OpenAI and Anthropic. Stub Gemini (blocked by v0.4 LLM Hardening Area 3 — `inlineData` parts format requires `@google/generative-ai` SDK). Expose via `LLMService.completeVision`.

**Criterion:** Vision endpoint accepts `{ imageBase64, mimeType, settings }` and returns `{ requirements: ExtractedRequirement[] }`; OpenAI and Anthropic vision calls use correct per-provider content part format; Groq and Gemini fall back gracefully; body parser already at 50mb (confirmed in server.ts before implementation).

**Delivered:**
- `src/prompts/image-requirement-extraction.txt`: enterprise-grade vision prompt — instructs LLM to read all visible text, classify each requirement with all 6 `ExtractedRequirement` fields, return a JSON array (not NDJSON), handle empty-result case with `[]`, applies same 12-type requirementType taxonomy as text extraction prompt
- `src/services/llm/LLMProvider.ts`: added `completeVision?(imageBase64, mimeType, systemPrompt): Promise<LLMResponse>` optional method to interface
- `src/services/llm/OpenAIProvider.ts`: `completeVision` sends `messages[].content` array with `{ type: 'image_url', image_url: { url: 'data:{mime};base64,...', detail: 'auto' } }` per OpenAI vision format; defaults model to `gpt-4o`
- `src/services/llm/AnthropicProvider.ts`: `completeVision` sends `messages[].content` array with `{ type: 'image', source: { type: 'base64', media_type, data } }` per Anthropic vision format; defaults model to `claude-sonnet-4-6`
- `src/services/llm/LLMService.ts`: `completeVision` delegates to provider; if provider has no `completeVision` method, rejects with clear user-facing message directing to switch provider
- `src/routes/generate.ts`: added `POST /api/generate/extract-image-requirements` — validates `imageBase64` + `mimeType`, calls `LLMService.completeVision`, parses JSON array from LLM response (handles ``` fences), returns `{ requirements: ExtractedRequirement[] }`; `src/server.ts` body limit already `50mb` — no change needed

---

## T-04 — Frontend Hook: Vision Extraction Path + Mixed File Handling

**Task Description:** Rewrite `parseSelectedFiles` in `frontend/src/hooks/useTraceLMMessages.ts` to detect image MIME types and route to the vision extraction path. Mixed extractions (images + documents + manual text) run concurrently via `Promise.all`. All results are merged with sequential REQ-IDs assigned after all promises resolve.

**Criterion:** Image files call `extractImageRequirements` (one call per image, concurrent — Q1 decision); document + manual text uses existing SSE path; `Promise.all([textCall, ...imageCalls])` runs all concurrently; REQ-IDs are reassigned sequentially across all sources after merge; `sizeError` drafts are excluded from processing.

**Delivered:**
- `frontend/src/api/client.ts`: added `extractImageRequirements(imageBase64, mimeType, settings): Promise<ExtractedRequirement[]>` — POSTs to `/generate/extract-image-requirements`, returns `requirements` array
- `frontend/src/hooks/useTraceLMMessages.ts` `parseSelectedFiles` rewritten:
  - Splits `uploadDraftsRef.current` into `imageDrafts[]` and `docDrafts[]`; excludes `sizeError` drafts from both
  - Progress feedback: "Parsing documents…  |  Analysing images…" shown simultaneously while both paths are in-flight
  - Text call (docs + manual concatenated) wrapped in a `Promise<ExtractedRequirement[]>`; resolves to `[]` when no text input
  - Vision calls: `Promise.all(imageDrafts.map(img => api.extractImageRequirements(...)))` — one concurrent call per image per Q1 decision; individual image failures caught and surfaced as inline feedback without stopping other calls
  - Final merge: `[...textRows, ...imageRowSets.flat()]` with REQ-IDs reassigned `REQ-001, REQ-002…` sequentially across all sources

---

## T-05 — RequirementsTab UI: Drop Zone, Image Chips, Provider Warning, Loading State

**Task Description:** Update `frontend/src/tabs/RequirementsTab.tsx` — extend `accept` attribute, add camera icon to drop zone, add sub-label for image types, show 32×32px thumbnail on image chips, show `sizeError` inline under chip, add amber vision warning banner when Groq is selected with images staged. Update CSS in `frontend/src/styles.css`.

**Criterion:** Drop zone accepts `.png,.jpg,.jpeg,.webp` in addition to document types; image chips show thumbnail preview; oversized files show inline error under chip; Groq + images → amber warning with link text to switch provider; warning auto-dismisses when provider changes; no new component — all changes within existing `RequirementsTab.tsx`.

**Delivered:**
- `frontend/src/tabs/RequirementsTab.tsx`:
  - `ACCEPTED_EXTS` extended with `.png,.jpg,.jpeg,.webp`
  - Added `selectedProvider: string` prop; computed `hasImageDrafts` and `showVisionWarning` (`hasImageDrafts && !VISION_CAPABLE_PROVIDERS[selectedProvider.toLowerCase()]`)
  - Drop zone inner: dual icons — document SVG + camera SVG (dimmed at 0.65 opacity)
  - Sub-label below drop zone: `.txt .md .docx .pdf .xlsx .csv · Screenshots & scans: .png .jpg .webp`
  - Image chip: renders `<img src={f.thumbnailUrl}>` at 32×32px (`.req-img-chip-thumb`) when `isImage && thumbnailUrl && !sizeError`
  - Size error chip: `.upload-draft-chip--error` modifier + `.req-chip-error` span below filename
  - Amber vision warning: `.req-vision-warning` banner with triangle warning icon, renders when `showVisionWarning`, `role="alert"`, names the three capable providers; positioned above drop zone
  - Extract button adaptive label: `'Analysing…'` added to isBusy branch check
  - `extractLabel` guard updated: shows busy state on `'Extracting'` OR `'Analysing'` feedback prefix
- `frontend/src/App.tsx`: passes `selectedProvider={settings.llmProvider}` to RequirementsTab
- `frontend/src/styles.css`: added `.req-dropzone-sublabel`, `.upload-draft-chip--error`, `.req-chip-error`, `.req-img-chip-thumb`, `.req-vision-warning`

---

## T-06 — Test Coverage Update

**Task Description:** Update `frontend/src/tabs/__tests__/RequirementsTab.test.tsx` — add `selectedProvider` to `baseProps`; add new test cases for image staging, Groq vision warning, size error chip, and no-warning cases.

**Criterion:** All existing tests continue to pass; new tests cover the 5 new image-related behaviors; `npm run typecheck:all` passes with zero errors.

**Delivered:**
- `baseProps`: added `selectedProvider: 'OpenAI'`
- **New tests (5):**
  - Image chip renders file name when `isImage: true` draft is staged
  - Vision warning (`role="alert"`) shown when Groq selected + image draft staged
  - Vision warning NOT shown when OpenAI selected + image draft staged
  - Size error message rendered inline when `sizeError` is set on draft
  - Vision warning NOT shown when only document files staged (even with Groq)

---

## Architecture Notes

| Decision | Detail |
|---|---|
| One call per image, concurrent | Q1 decision locked in TDD — `Promise.all(imageDrafts.map(...))` — sequential per-image execution prohibited |
| Gemini vision deferred | Blocked by v0.4 LLM Hardening Area 3 (Gemini SDK migration). `LLMService.completeVision` rejects with user-facing message. Re-implement after v0.4 Area 3. |
| Groq excluded | No production vision model as of June 26, 2026. `VISION_CAPABLE_PROVIDERS.groq = false`. Amber warning shown. |
| Body parser limit | `src/server.ts` already had `express.json({ limit: '50mb' })` — no change required |
| REQ-ID reassignment | All image + text + manual rows merged and renumbered after `Promise.all` resolves — sequential IDs across all sources |

---

## Files Modified / Created

| File | Change |
|---|---|
| `frontend/src/types.ts` | Extended `UploadDraft` with `isImage?`, `thumbnailUrl?`, `sizeError?` |
| `frontend/src/utils.ts` | Added `VISION_CAPABLE_PROVIDERS`, `IMAGE_SIZE_LIMIT_BYTES`, `ACCEPTED_IMAGE_MIMES/EXTS`, `resizeImageIfNeeded()` |
| `frontend/src/App.tsx` | Updated `handleFileChange` for image detection, resize, size gate, thumbnail; added `selectedProvider` prop pass-through |
| `src/prompts/image-requirement-extraction.txt` | Created — vision LLM system prompt (JSON array output, 12-type taxonomy, empty-result handling) |
| `src/services/llm/LLMProvider.ts` | Added optional `completeVision` method to interface |
| `src/services/llm/OpenAIProvider.ts` | Implemented `completeVision` — `image_url` content part, `detail: 'auto'` |
| `src/services/llm/AnthropicProvider.ts` | Implemented `completeVision` — `image` source `base64` content part |
| `src/services/llm/LLMService.ts` | Exposed `completeVision` with graceful fallback for providers without vision support |
| `src/routes/generate.ts` | Added `POST /api/generate/extract-image-requirements` non-SSE endpoint |
| `frontend/src/api/client.ts` | Added `extractImageRequirements()` function |
| `frontend/src/hooks/useTraceLMMessages.ts` | Rewrote `parseSelectedFiles` — image/doc split, concurrent Promise.all, sequential REQ-ID reassignment |
| `frontend/src/tabs/RequirementsTab.tsx` | Drop zone icons + sub-label, image chip thumbnails, size error chips, vision warning banner, `selectedProvider` prop |
| `frontend/src/styles.css` | Added `.req-dropzone-sublabel`, `.upload-draft-chip--error`, `.req-chip-error`, `.req-img-chip-thumb`, `.req-vision-warning` |
| `frontend/src/tabs/__tests__/RequirementsTab.test.tsx` | Added `selectedProvider` to baseProps + 5 new image-related tests |
