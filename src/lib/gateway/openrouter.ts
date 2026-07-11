/**
 * OpenRouter model gateway.
 *
 * Owns every OpenRouter-specific detail so that swapping models stays a config
 * change (AGENTS.md architecture rules, ADR-007). The gateway streams text
 * deltas only; prompt assembly and request handling live elsewhere.
 *
 * Secrets are read at call time from server-only environment variables and are
 * never logged. Message content, headers, and the request body are never
 * logged either.
 */

import { ChatMessage } from "@/lib/chat/types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
const DEFAULT_MAX_TOKENS = 600;
const MAX_TOKENS_FLOOR = 1;
const MAX_TOKENS_CEILING = 2000;
/** Hard wall-clock cap on one provider call (connect + full stream). A
 * stalled upstream must become a typed error, not an open function. */
const PROVIDER_TIMEOUT_MS = 45_000;

/** Provider-layer failure mapped to a user-safe message by the route (ADR). */
export class GatewayError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
  }
}

/** True iff a non-empty OpenRouter key is present in the environment. */
export function isGatewayConfigured(): boolean {
  const key = process.env.OPENROUTER_API_KEY;
  return typeof key === "string" && key.length > 0;
}

interface StreamOptions {
  system: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  /** Override for the Phase 2 benchmark harness; defaults to env. */
  model?: string;
}

/**
 * Stream a chat completion, yielding assistant text deltas in order.
 *
 * The generator body runs lazily on the first `next()`, so a missing key throws
 * before any network call. Aborts propagate as-is (the route treats a client
 * abort as normal).
 */
export async function* streamChatCompletion(
  opts: StreamOptions,
): AsyncGenerator<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new GatewayError("OpenRouter API key is not configured.");
  }

  const model = opts.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  // OpenRouter-native fallback routing: when a fallback is configured, the
  // provider retries the request against it if the primary errors. Policy:
  // the fallback is the benchmark's runner-up (ADR-007), so an unbenchmarked
  // model never answers. Explicit per-call overrides (the benchmark harness)
  // never get a fallback — a benchmark must measure exactly one model.
  const fallback = process.env.OPENROUTER_FALLBACK_MODEL;
  const useFallback = !opts.model && !!fallback && fallback !== model;
  const body = JSON.stringify({
    model,
    ...(useFallback ? { models: [model, fallback] } : {}),
    messages: [{ role: "system", content: opts.system }, ...opts.messages],
    stream: true,
    max_tokens: resolveMaxTokens(),
    temperature: 0.2,
  });

  // The timeout signal is combined with the caller's (client-abort) signal;
  // only a timeout maps to GatewayError — a client abort stays an abort.
  const timeoutSignal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, timeoutSignal])
    : timeoutSignal;
  const asGatewayTimeout = (err: unknown): unknown => {
    const name = (err as Error)?.name;
    const timedOut =
      name === "TimeoutError" ||
      (timeoutSignal.aborted && !opts.signal?.aborted &&
        name === "AbortError");
    return timedOut
      ? new GatewayError(
          `OpenRouter request timed out after ${PROVIDER_TIMEOUT_MS}ms.`,
        )
      : err;
  };

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://cadre-ai-chatbot.vercel.app",
        "X-Title": "Cadre AI Support Concierge",
      },
      body,
      signal,
    });
  } catch (err) {
    throw asGatewayTimeout(err);
  }

  if (!response.ok) {
    const detail = await safeReadText(response);
    throw new GatewayError(
      `OpenRouter request failed with status ${response.status}: ${detail.slice(
        0,
        200,
      )}`,
      response.status,
    );
  }

  const stream = response.body;
  if (!stream) {
    // A 2xx with no body is a provider failure, not an empty answer.
    throw new GatewayError("OpenRouter returned a response without a body.");
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch (err) {
        throw asGatewayTimeout(err);
      }
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (isStreamEnd(line)) return;
        const delta = parseSseLine(line);
        if (delta !== null) yield delta;
      }
    }

    // Flush any trailing line that arrived without a final newline.
    buffer += decoder.decode();
    if (buffer.length > 0 && isStreamEnd(buffer)) return;

    // EOF without the `[DONE]` sentinel is a dropped upstream connection:
    // treating it as success would hand truncated output to action cards,
    // storage, and the client's own `done` event.
    throw new GatewayError(
      "OpenRouter stream ended before the [DONE] sentinel.",
    );
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse one SSE line into an assistant text delta.
 *
 * Returns null for blank lines, `:` comment keep-alives
 * (": OPENROUTER PROCESSING"), the `[DONE]` sentinel, non-`data:` events,
 * malformed JSON, and any payload without non-empty `choices[0].delta.content`.
 *
 * Throws GatewayError when the payload carries a provider failure: OpenRouter
 * reports errors that occur after streaming begins as a top-level `error`
 * object (or `finish_reason: "error"`) inside a 200 stream, not as an HTTP
 * status. Swallowing those would let a truncated reply look like a successful
 * turn — and get action cards and storage it should not.
 */
export function parseSseLine(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith(":")) return null;
  if (!trimmed.startsWith("data:")) return null;

  const data = trimmed.slice("data:".length).trim();
  if (data.length === 0 || data === "[DONE]") return null;

  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }

  const parsed = payload as {
    error?: { message?: unknown; code?: unknown };
    choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>;
  };

  if (parsed?.error) {
    const message =
      typeof parsed.error.message === "string" && parsed.error.message.length > 0
        ? parsed.error.message.slice(0, 200)
        : "provider reported a mid-stream error";
    const code =
      typeof parsed.error.code === "number" ? parsed.error.code : undefined;
    throw new GatewayError(`OpenRouter mid-stream error: ${message}`, code);
  }
  if (parsed?.choices?.[0]?.finish_reason === "error") {
    throw new GatewayError(
      "OpenRouter mid-stream error: the model stopped with an error.",
    );
  }

  const content = parsed?.choices?.[0]?.delta?.content;

  return typeof content === "string" && content.length > 0 ? content : null;
}

/** True when a line is the `data: [DONE]` stream terminator. */
function isStreamEnd(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return false;
  return trimmed.slice("data:".length).trim() === "[DONE]";
}

/** Resolve and clamp the token cap from env; invalid values fall back. */
function resolveMaxTokens(): number {
  const raw = process.env.OPENROUTER_MAX_TOKENS;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_MAX_TOKENS;
  const value = Number.isFinite(parsed) ? parsed : DEFAULT_MAX_TOKENS;
  return Math.min(MAX_TOKENS_CEILING, Math.max(MAX_TOKENS_FLOOR, value));
}

/** Read an error response body without letting a read failure mask the status. */
async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
