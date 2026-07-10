/**
 * Bounded request-body reading.
 *
 * `Content-Length` is a client-supplied claim — missing, wrong, or absent on
 * chunked encoding — so byte limits are enforced on the actual stream. When
 * the cap is crossed the read stops immediately (the remainder is cancelled,
 * not buffered) and the route answers 413.
 */

export class BodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes.`);
    this.name = "BodyTooLargeError";
  }
}

/**
 * Read and JSON-parse a request body of at most `maxBytes` actual bytes.
 *
 * Throws BodyTooLargeError past the cap and SyntaxError on invalid JSON;
 * callers map those to 413 / 400.
 */
export async function readJsonBounded(
  req: Request,
  maxBytes: number,
): Promise<unknown> {
  const body = req.body;
  if (!body) return JSON.parse("");

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new BodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(merged));
}
