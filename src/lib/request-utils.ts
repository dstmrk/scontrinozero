/**
 * Reads the request body as JSON, enforcing a maximum size limit.
 *
 * Returns the parsed body on success.
 * Returns `{ tooLarge: true }` when the payload exceeds `maxBytes`.
 * Returns `{ parseError: true }` when the body is not valid JSON.
 */
export async function readJsonWithLimit(
  req: Request,
  maxBytes: number,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; tooLarge: true }
  | { ok: false; parseError: true }
> {
  let buf: ArrayBuffer;
  try {
    buf = await req.arrayBuffer();
  } catch {
    return { ok: false, parseError: true };
  }

  if (buf.byteLength > maxBytes) {
    return { ok: false, tooLarge: true };
  }

  const text = new TextDecoder().decode(buf);
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, parseError: true };
  }
}
