/**
 * Idle timeout for streaming LLM calls.
 *
 * Unlike a wall-clock AbortController (which fires N seconds after the request
 * starts regardless of activity), an idle timeout only fires if NO chunk has
 * been received for `idleMs` milliseconds.
 *
 * This is the correct model for streaming: an active stream should never be
 * aborted — only a silent/hung connection should be.
 *
 * Usage:
 *   const { signal, touch, cancel } = makeIdleTimeout(45_000);
 *   // pass `signal` to fetch
 *   // call touch() inside the chunk loop to reset the window
 *   // call cancel() in the finally block
 */
export function makeIdleTimeout(idleMs: number): {
  signal: AbortSignal;
  touch: () => void;
  cancel: () => void;
} {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const touch = (): void => {
    if (controller.signal.aborted) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), idleMs);
  };

  const cancel = (): void => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };

  // Arm immediately — if the LLM never responds at all, abort after idleMs.
  touch();

  return { signal: controller.signal, touch, cancel };
}
