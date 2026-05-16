type ReadResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; tooLarge: true }
  | { ok: false; readError: true };

type StreamReader = ReadableStreamDefaultReader<Uint8Array>;

/**
 * Parses the Content-Length header. Returns the declared byte count when the
 * header is present, parseable, and within `maxBytes`. Returns `"tooLarge"`
 * when the declared size already exceeds the limit (no I/O needed). Returns
 * `null` when the header is absent or unusable — caller falls back to streaming.
 */
function parseContentLength(
  req: Request,
  maxBytes: number,
): number | "tooLarge" | null {
  const raw = req.headers.get("content-length");
  if (raw === null) return null;
  const declared = Number.parseInt(raw, 10);
  if (Number.isNaN(declared) || declared < 0) return null;
  if (declared > maxBytes) return "tooLarge";
  return declared;
}

/**
 * Fast path: pre-allocate a single Uint8Array of the declared size and fill
 * it in-place. No `chunks[]` array, no merge pass. Defends against clients
 * that lie about Content-Length (sending more or fewer bytes than declared).
 */
async function readPreAllocated(
  reader: StreamReader,
  declaredLength: number,
  maxBytes: number,
): Promise<ReadResult> {
  const buffer = new Uint8Array(declaredLength);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > declaredLength) {
        await reader.cancel();
        // Stream over-delivers vs. declared CL.
        // - If even the partial extra would push past maxBytes → tooLarge.
        // - Otherwise the body is untrustworthy: stream already consumed, can't
        //   restart; signal readError so the caller fails cleanly.
        return declaredLength + value.byteLength > maxBytes
          ? { ok: false, tooLarge: true }
          : { ok: false, readError: true };
      }
      buffer.set(value, offset);
      offset += value.byteLength;
    }
  } catch {
    return { ok: false, readError: true };
  }
  // Client under-delivered → trim.
  return {
    ok: true,
    bytes: offset === declaredLength ? buffer : buffer.subarray(0, offset),
  };
}

/**
 * Picks the next buffer size when the growing-buffer path needs more room.
 * Doubles from the current size until it fits, then caps at `maxBytes`.
 */
function nextBufferSize(
  currentSize: number,
  required: number,
  maxBytes: number,
): number {
  let next = currentSize * 2;
  while (next < required) next *= 2;
  return Math.min(next, maxBytes);
}

/**
 * Fallback path (no Content-Length): grows a single buffer by doubling.
 * Aborts as soon as the running total exceeds `maxBytes` — large payloads
 * are never fully buffered. Worst-case allocation is 2× the final size.
 */
async function readGrowingBuffer(
  reader: StreamReader,
  maxBytes: number,
): Promise<ReadResult> {
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
        const grown = new Uint8Array(
          nextBufferSize(buffer.byteLength, nextTotal, maxBytes),
        );
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
 * Reads the request body as raw bytes, enforcing a maximum size limit.
 *
 * Three-layer protection:
 * 1. Content-Length fast-path: rejects immediately when the declared size
 *    already exceeds the limit (no I/O).
 * 2. Pre-allocation when CL is valid: single Uint8Array sized exactly,
 *    filled in-place. Covers the common case (Stripe webhooks, browser fetch).
 * 3. Streaming fallback when CL is absent: single growing buffer, no
 *    chunks[] array. Aborts at maxBytes — large payloads never fully buffered.
 */
async function readBodyWithLimit(
  req: Request,
  maxBytes: number,
): Promise<ReadResult> {
  const declared = parseContentLength(req, maxBytes);
  if (declared === "tooLarge") return { ok: false, tooLarge: true };

  if (!req.body) return { ok: false, readError: true };

  const reader = req.body.getReader();
  return declared === null
    ? readGrowingBuffer(reader, maxBytes)
    : readPreAllocated(reader, declared, maxBytes);
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
