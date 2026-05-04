/**
 * Reads the request body as raw bytes, enforcing a maximum size limit.
 *
 * Two-layer protection:
 * 1. Content-Length fast-path: rejects immediately (before any I/O) when the
 *    declared size already exceeds the limit.
 * 2. Streaming read: reads the body chunk-by-chunk and aborts as soon as the
 *    running total exceeds maxBytes — so a large payload is never fully buffered.
 *
 * Returns `{ ok: true, bytes }` on success.
 * Returns `{ ok: false, tooLarge: true }` when the payload exceeds `maxBytes`.
 * Returns `{ ok: false, readError: true }` on I/O failure or missing body.
 */
async function readBodyWithLimit(
  req: Request,
  maxBytes: number,
): Promise<
  | { ok: true; bytes: Uint8Array }
  | { ok: false; tooLarge: true }
  | { ok: false; readError: true }
> {
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number.parseInt(contentLength, 10);
    if (!Number.isNaN(declared) && declared > maxBytes) {
      return { ok: false, tooLarge: true };
    }
  }

  if (!req.body) {
    return { ok: false, readError: true };
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
    return { ok: false, readError: true };
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes: combined };
}

/**
 * Reads the request body as raw text, enforcing a maximum size limit.
 *
 * Use this instead of `await req.text()` on public endpoints where the raw body
 * must be preserved (e.g. Stripe webhook signature verification requires the
 * exact bytes before any parsing).
 */
export async function readTextWithLimit(
  req: Request,
  maxBytes: number,
): Promise<
  | { ok: true; text: string }
  | { ok: false; tooLarge: true }
  | { ok: false; readError: true }
> {
  const result = await readBodyWithLimit(req, maxBytes);
  if (!result.ok) return result;
  return { ok: true, text: new TextDecoder().decode(result.bytes) };
}

/**
 * Reads the request body as JSON, enforcing a maximum size limit.
 *
 * Returns `{ parseError: true }` both for I/O failures and invalid JSON —
 * callers should treat both as "bad request" without distinction.
 */
export async function readJsonWithLimit(
  req: Request,
  maxBytes: number,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; tooLarge: true }
  | { ok: false; parseError: true }
> {
  const result = await readBodyWithLimit(req, maxBytes);
  if (!result.ok) {
    if ("tooLarge" in result) return { ok: false, tooLarge: true };
    return { ok: false, parseError: true };
  }
  try {
    const text = new TextDecoder().decode(result.bytes);
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, parseError: true };
  }
}
