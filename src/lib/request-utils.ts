/**
 * Reads the request body as raw bytes, enforcing a maximum size limit.
 *
 * Three-layer protection:
 * 1. Content-Length fast-path: rejects immediately (before any I/O) when the
 *    declared size already exceeds the limit.
 * 2. Pre-allocation when Content-Length is valid: a single Uint8Array sized to
 *    the declared length is filled in-place from the stream — no chunks[] array,
 *    no second-pass merge. Covers the common case (Stripe webhooks, browser fetch).
 * 3. Streaming fallback when Content-Length is absent: still aborts as soon as
 *    the running total exceeds maxBytes — so a large payload is never fully buffered.
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
  let declaredLength: number | null = null;
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number.parseInt(contentLength, 10);
    if (!Number.isNaN(declared)) {
      if (declared > maxBytes) {
        return { ok: false, tooLarge: true };
      }
      if (declared >= 0) declaredLength = declared;
    }
  }

  if (!req.body) {
    return { ok: false, readError: true };
  }

  const reader = req.body.getReader();

  // Fast path: trusted Content-Length → pre-allocate exact size, fill in-place.
  // Avoids the chunks[] + final merge double allocation entirely.
  if (declaredLength !== null) {
    const buffer = new Uint8Array(declaredLength);
    let offset = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Client lied about Content-Length (sent more than declared).
        // Cap at declared+1 so we report tooLarge consistently instead of
        // crashing with a RangeError on buffer.set.
        if (offset + value.byteLength > declaredLength) {
          await reader.cancel();
          if (declaredLength + value.byteLength > maxBytes) {
            return { ok: false, tooLarge: true };
          }
          // Declared ≤ maxBytes but actual exceeds declared and still ≤ maxBytes:
          // fall through to a fresh streaming read would require re-reading the
          // body (impossible — stream is consumed). Treat as readError.
          return { ok: false, readError: true };
        }
        buffer.set(value, offset);
        offset += value.byteLength;
      }
    } catch {
      return { ok: false, readError: true };
    }
    // Client lied (sent less than declared) → trim.
    return {
      ok: true,
      bytes: offset === declaredLength ? buffer : buffer.subarray(0, offset),
    };
  }

  // Streaming fallback (no Content-Length): grow a single buffer by doubling,
  // copying once on each grow. Worst case allocation is 2× the final size,
  // but no per-chunk array + final merge pass.
  let buffer = new Uint8Array(Math.min(4096, maxBytes));
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const nextTotal = totalBytes + value.byteLength;
      if (nextTotal > maxBytes) {
        await reader.cancel();
        return { ok: false, tooLarge: true };
      }
      if (nextTotal > buffer.byteLength) {
        let newSize = buffer.byteLength * 2;
        while (newSize < nextTotal) newSize *= 2;
        if (newSize > maxBytes) newSize = maxBytes;
        const grown = new Uint8Array(newSize);
        grown.set(buffer.subarray(0, totalBytes), 0);
        buffer = grown;
      }
      buffer.set(value, totalBytes);
      totalBytes = nextTotal;
    }
  } catch {
    return { ok: false, readError: true };
  }

  return {
    ok: true,
    bytes:
      totalBytes === buffer.byteLength
        ? buffer
        : buffer.subarray(0, totalBytes),
  };
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
