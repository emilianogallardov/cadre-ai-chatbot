import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { ChatMessage, StreamEvent } from "@/lib/chat/types";
import { toPayloadMessages } from "@/lib/chat/payload";
import { isGatewayConfigured } from "@/lib/gateway/openrouter";
import { checkRateLimit } from "@/lib/limits/ratelimit";
import { POST } from "../chat/route";

// Same mock harness as chat.route.test.ts: capture `after()` and run it
// synchronously so the mocked storeTurn is observable and never touches the
// real Vercel after-context.
const hoisted = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((cb: () => unknown) => {
      hoisted.afterCallbacks.push(cb);
      cb();
    }),
  };
});

// Keyless: force the mock streaming path (isGatewayConfigured false, VERCEL_ENV
// unset). streamChatCompletion is never reached but is mocked so an accidental
// real call would fail loudly rather than hit the network.
vi.mock("@/lib/gateway/openrouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gateway/openrouter")>();
  return {
    ...actual,
    isGatewayConfigured: vi.fn(),
    streamChatCompletion: vi.fn(),
  };
});

vi.mock("@/lib/limits/ratelimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/limits/ratelimit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn(),
  };
});

// Real token module (driven by stubbed signing secret); only the DB write mocked.
vi.mock("@/lib/conversations/store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/conversations/store")>();
  return {
    ...actual,
    storeTurn: vi.fn(async () => {}),
  };
});

const SIGNING_SECRET = "test-signing-secret";
const SUPABASE_URL = "https://project.supabase.co";
const SUPABASE_KEY = "secret-service-key";

function stubStorageEnv() {
  vi.stubEnv("CONVERSATION_SIGNING_SECRET", SIGNING_SECRET);
  vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("SUPABASE_SECRET_KEY", SUPABASE_KEY);
}

function chatRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Read an NDJSON response fully and JSON.parse each line into a typed event. */
async function readEvents(res: Response): Promise<StreamEvent[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as StreamEvent);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  hoisted.afterCallbacks.length = 0;
  stubStorageEnv();
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.mocked(isGatewayConfigured).mockReturnValue(false);
  vi.mocked(checkRateLimit).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Drive one turn through the mock streaming path and return the assistant
 * reply. The mock streams words behind real 15ms timers, so advance fake
 * timers deterministically (chat.route.test.ts C7) instead of sleeping.
 */
async function runTurn(
  transcript: ChatMessage[],
  conversationToken: string | undefined,
): Promise<{ assistantText: string; token: string | undefined }> {
  const res = await POST(
    chatRequest({
      messages: toPayloadMessages(transcript),
      turnId: randomUUID(),
      ...(conversationToken ? { conversationToken } : {}),
    }),
  );
  expect(res.status).toBe(200);

  const eventsPromise = readEvents(res);
  await vi.runAllTimersAsync();
  const events = await eventsPromise;
  const types = events.map((e) => e.type);

  // Every turn is a clean success: no rejection, terminal `done`.
  expect(types).not.toContain("error");
  expect(types[types.length - 1]).toBe("done");

  const assistantText = events
    .filter((e): e is Extract<StreamEvent, { type: "text" }> => e.type === "text")
    .map((e) => e.delta)
    .join("");
  const conversation = events.find(
    (e): e is Extract<StreamEvent, { type: "conversation" }> =>
      e.type === "conversation",
  );
  return { assistantText, token: conversation?.token ?? conversationToken };
}

describe("POST /api/chat session endurance", () => {
  it("S1: survives a 50-exchange conversation with no degradation or rejection", async () => {
    vi.useFakeTimers();
    try {
      const transcript: ChatMessage[] = [];
      let token: string | undefined;

      for (let turn = 0; turn < 50; turn++) {
        transcript.push({
          role: "user",
          content: `Turn ${turn}: tell me more about how Cadre AI helps teams.`,
        });
        const { assistantText, token: next } = await runTurn(transcript, token);
        token = next;
        transcript.push({ role: "assistant", content: assistantText });
      }

      // 50 user + 50 assistant messages accumulated; the raw transcript is far
      // past maxMessages and maxTotalChars, yet every turn was accepted.
      expect(transcript).toHaveLength(100);
    } finally {
      vi.useRealTimers();
    }
  });

  it("S2: survives 50 exchanges of long 1500-char user messages (char budget is the binding constraint)", async () => {
    vi.useFakeTimers();
    try {
      const transcript: ChatMessage[] = [];
      let token: string | undefined;

      for (let turn = 0; turn < 50; turn++) {
        transcript.push({
          role: "user",
          content: `T${turn} ` + "x".repeat(1500),
        });
        const { assistantText, token: next } = await runTurn(transcript, token);
        token = next;
        transcript.push({ role: "assistant", content: assistantText });
      }

      expect(transcript).toHaveLength(100);
    } finally {
      vi.useRealTimers();
    }
  });
});
