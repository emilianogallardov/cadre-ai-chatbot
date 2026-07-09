import { NextRequest } from "next/server";
import { ChatMessage, ErrorCode, StreamEvent } from "@/lib/chat/types";
import { validateMessages, ValidationError } from "@/lib/chat/validate";
import { assemblePrompt } from "@/lib/prompt/assemble";
import {
  isGatewayConfigured,
  streamChatCompletion,
} from "@/lib/gateway/openrouter";
import { checkRateLimit } from "@/lib/limits/ratelimit";
import { knowledgeBase } from "@/lib/prompt/knowledge";

export const runtime = "nodejs";

/**
 * POST /api/chat — the only model-spending route.
 *
 * Cheap gates run in strict order before any provider call (ADR-006):
 * 1. request-shape validation (roles, count, length),
 * 2. rate limiting (per-IP sliding window, then global daily cap),
 * 3. prompt assembly from the curated knowledge layer.
 * Only then does the request reach OpenRouter. Without a configured key the
 * route degrades to the Phase 1 mock behind the same NDJSON wire protocol, so
 * the public deployment keeps working before credentials exist.
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

  const limit = await checkRateLimit(clientIp(req));
  if (!limit.ok) {
    const contacts = knowledgeBase.verified_contacts;
    return errorResponse(
      "rate_limited",
      limit.scope === "global"
        ? "The assistant has reached its daily capacity. Please try again " +
            `later, or reach Cadre directly at ${contacts.email} or ` +
            `${contacts.phone}.`
        : "You're sending messages faster than the assistant can keep up. " +
            `Please wait about ${limit.retryAfterSeconds}s and try again.`,
      429,
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }

  return isGatewayConfigured()
    ? streamModelResponse(messages, req.signal)
    : streamMockResponse(messages);
}

/** Stream the real model response as NDJSON events. */
function streamModelResponse(messages: ChatMessage[], signal: AbortSignal) {
  const { system, messages: recent } = assemblePrompt(messages);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = makeSender(controller);
      try {
        for await (const delta of streamChatCompletion({
          system,
          messages: recent,
          signal,
        })) {
          send({ type: "text", delta });
        }
        send({ type: "done" });
      } catch (err) {
        if (isAbort(err)) {
          // Client went away; nothing to report.
        } else {
          // GatewayError and anything unexpected map to one typed, user-safe
          // event — provider details never reach the client.
          send({
            type: "error",
            code: "provider_error",
            message:
              "The assistant hit a temporary problem answering. Please try " +
              "again in a moment.",
          });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a client abort.
        }
      }
    },
  });

  return ndjsonResponse(stream);
}

/** Phase 1 mock, kept as the keyless fallback (same wire protocol). */
function streamMockResponse(messages: ChatMessage[]) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const reply = mockReply(lastUser?.content ?? "");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = makeSender(controller);
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
          url: knowledgeBase.verified_contacts.contact_url,
        },
      });
      send({ type: "done" });
      controller.close();
    },
  });

  return ndjsonResponse(stream);
}

/** First hop of x-forwarded-for; Vercel sets it for every request. */
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function makeSender(controller: ReadableStreamDefaultController<Uint8Array>) {
  const encoder = new TextEncoder();
  return (event: StreamEvent) => {
    try {
      controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
    } catch {
      // Stream already cancelled by the client; drop the event.
    }
  };
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function ndjsonResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  headers?: Record<string, string>,
) {
  const event: StreamEvent = { type: "error", code, message };
  return new Response(JSON.stringify(event) + "\n", {
    status,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      ...headers,
    },
  });
}

function mockReply(userText: string): string {
  return (
    "(Mock response — model gateway lands when OPENROUTER_API_KEY is set.) " +
    `You asked: "${userText.slice(0, 120)}". ` +
    "Cadre AI is an AI strategy and implementation consultancy that helps " +
    "organizations identify high-ROI opportunities, implement workflows and " +
    "AI agents, and train teams so changes stick."
  );
}
