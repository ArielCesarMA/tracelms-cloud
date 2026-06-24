/**
 * Reads an SSE (text/event-stream) response body and yields each `data:` payload.
 * Skips `[DONE]` sentinels (used by OpenAI). Works with Gemini (alt=sse),
 * OpenAI (stream:true), and Anthropic (stream:true) streaming endpoints.
 */
export async function* parseSseLines(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6).trim();
          if (payload && payload !== '[DONE]') yield payload;
        }
      }
    }
    // Flush any remaining buffer content
    if (buffer.startsWith('data: ')) {
      const payload = buffer.slice(6).trim();
      if (payload && payload !== '[DONE]') yield payload;
    }
  } finally {
    try { reader.cancel(); } catch { /* ignore */ }
  }
}
