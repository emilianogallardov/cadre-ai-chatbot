import { describe, expect, it } from "vitest";
import { BodyTooLargeError, readJsonBounded } from "../body";

function requestWithBody(body: string): Request {
  return new Request("http://localhost/test", { method: "POST", body });
}

describe("readJsonBounded", () => {
  it("parses a body within the cap", async () => {
    await expect(
      readJsonBounded(requestWithBody('{"a":1}'), 1024),
    ).resolves.toEqual({ a: 1 });
  });

  it("throws BodyTooLargeError past the cap regardless of Content-Length", async () => {
    const big = JSON.stringify({ pad: "x".repeat(2048) });
    await expect(
      readJsonBounded(requestWithBody(big), 1024),
    ).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("enforces the cap on actual streamed bytes with no Content-Length", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 40; i++) {
          controller.enqueue(encoder.encode("x".repeat(100)));
        }
        controller.close();
      },
    });
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: stream,
      // @ts-expect-error duplex is required for streaming bodies in Node
      duplex: "half",
    });
    await expect(readJsonBounded(req, 1024)).rejects.toBeInstanceOf(
      BodyTooLargeError,
    );
  });

  it("propagates SyntaxError on invalid JSON within the cap", async () => {
    await expect(
      readJsonBounded(requestWithBody("{nope"), 1024),
    ).rejects.toBeInstanceOf(SyntaxError);
  });
});
