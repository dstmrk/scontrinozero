/**
 * Reads the request body as JSON, enforcing a maximum size limit.
 *
 * Returns the parsed body on success.
 * Returns `{ tooLarge: true }` when the payload exceeds `maxBytes`.
 * Returns `{ parseError: true }` when the body is not valid JSON.
 *
 * Two-layer protection:
 * 1. Content-Length fast-path: rejects immediately (before any I/O) when the
 *    declared size already exceeds the limit.
 * 2. Streaming read: reads the body chunk-by-chunk and aborts as soon as the
 *    running total exceeds maxBytes — so a large payload is never fully buffered.
 */
export async function readJsonWithLimit(
  req: Request,
  maxBytes: number,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; tooLarge: true }
  | { ok: false; parseError: true }
> {
  // Fast-path: reject before any I/O when Content-Length is present and
  // already exceeds the limit. Clients that lie about Content-Length will
  // still be caught by the streaming check below.
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    const declared = parseInt(contentLength, 10);
    if (!Number.isNaN(declared) && declared > maxBytes) {
      return { ok: false, tooLarge: true };
    }
  }

  if (!req.body) {
    return { ok: false, parseError: true };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, tooLarge: true };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, parseError: true };
  }

  // Concatenate chunks into a single buffer and decode.
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(combined);

  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, parseError: true };
  }
}
