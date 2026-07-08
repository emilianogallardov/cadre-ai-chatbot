import { NextRequest } from "next/server";
import { ChatMessage, ErrorCode, StreamEvent } from "@/lib/chat/types";
import { validateMessages, ValidationError } from "@/lib/chat/validate";

export const runtime = "nodejs";

/**
 * Phase 1 mock endpoint: validates the request shape and streams a canned
 * NDJSON response so the UI, streaming, and error paths can be built and
 * deployed before any model spend. The real OpenRouter gateway replaces the
 * mock generator in Phase 2 behind the same wire protocol.
 */
export async function POST(req: NextRequest) {
  let messages: ChatMessage[];
  try {
    const body = (await req.json()) as { messages?: unknown };
    messages = validateMessages(body.messages);
  } catch (err) {
    return errorResponse(
      "invalid_request",
      err instanceof ValidationError
        ? err.message
        : "Request body must be JSON with a messages array.",
      400,
    );
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const reply = mockReply(lastUser?.content ?? "");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: StreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      // Stream word-by-word to exercise the client's incremental rendering.
      for (const word of reply.split(/(?<=\s)/)) {
        send({ type: "text", delta: word });
        await new Promise((r) => setTimeout(r, 15));
      }
      send({
        type: "action",
        card: {
          kind: "strategy_contact",
          title: "Talk with an AI strategist",
          body: "The fastest way to get real answers about your use case.",
          url: "https://www.cadreai.com/contact",
        },
      });
      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function errorResponse(code: ErrorCode, message: string, status: number) {
  const event: StreamEvent = { type: "error", code, message };
  return new Response(JSON.stringify(event) + "\n", {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

function mockReply(userText: string): string {
  return (
    "(Mock response — model gateway lands in Phase 2.) You asked: " +
    `"${userText.slice(0, 120)}". ` +
    "Cadre AI is an AI strategy and implementation consultancy that helps " +
    "organizations identify high-ROI opportunities, implement workflows and " +
    "AI agents, and train teams so changes stick."
  );
}
