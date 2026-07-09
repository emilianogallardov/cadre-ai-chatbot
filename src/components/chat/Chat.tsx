"use client";

import { useCallback, useRef, useState } from "react";
import type {
  ActionCard,
  ChatMessage,
  StreamEvent,
} from "@/lib/chat/types";
import { toPayloadMessages } from "@/lib/chat/payload";
import { Composer } from "./Composer";
import { SuggestedPrompts } from "./SuggestedPrompts";
import { Transcript } from "./Transcript";
import { useSpeechOutput } from "./useSpeechOutput";

export interface TranscriptItem {
  message: ChatMessage;
  cards?: ActionCard[];
}

type Status = "idle" | "streaming" | "error";

export function Chat() {
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const {
    supported: speechSupported,
    enabled: speechEnabled,
    setEnabled: setSpeechEnabled,
    speak,
    cancel: cancelSpeech,
  } = useSpeechOutput();

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || status === "streaming") return;

      // A new user message supersedes any reply still being read aloud.
      cancelSpeech();
      let assistantText = "";

      const userItem: TranscriptItem = {
        message: { role: "user", content: trimmed },
      };
      const history = [...items, userItem];
      setItems([...history, { message: { role: "assistant", content: "" } }]);
      setStatus("streaming");
      setErrorText(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: toPayloadMessages(history.map((i) => i.message)),
          }),
          signal: controller.signal,
        });
        if (!res.body) throw new Error("Empty response body.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            handleEvent(JSON.parse(line) as StreamEvent);
          }
        }
        setStatus("idle");
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStatus("idle");
        } else {
          setStatus("error");
          setErrorText(
            "Something went wrong reaching the assistant. Your message is still in the box — try again, or contact Cadre directly at hello@gocadre.ai.",
          );
          // Drop the empty assistant placeholder so retry starts clean.
          setItems((prev) =>
            prev.filter(
              (it, idx) =>
                !(idx === prev.length - 1 && it.message.content === ""),
            ),
          );
        }
      } finally {
        abortRef.current = null;
      }

      function handleEvent(event: StreamEvent) {
        if (event.type === "text") {
          assistantText += event.delta;
          setItems((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = {
              ...last,
              message: {
                ...last.message,
                content: last.message.content + event.delta,
              },
            };
            return next;
          });
        } else if (event.type === "action") {
          setItems((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = {
              ...last,
              cards: [...(last.cards ?? []), event.card],
            };
            return next;
          });
        } else if (event.type === "done") {
          // Read the completed reply once, only if output is enabled.
          speak(assistantText);
        } else if (event.type === "error") {
          throw Object.assign(new Error(event.message), { name: "StreamError" });
        }
      }
    },
    [items, status, cancelSpeech, speak],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    cancelSpeech();
  }, [cancelSpeech]);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-4">
      <header className="flex items-start justify-between gap-3 border-b border-zinc-200 py-4 dark:border-zinc-800">
        <div>
          <h1 className="text-lg font-semibold">Cadre AI Support</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Ask about services, industries, the AI Maturity Index, or talking
            with an AI strategist.
          </p>
        </div>
        {speechSupported && (
          <button
            type="button"
            onClick={() => setSpeechEnabled(!speechEnabled)}
            aria-label="Read replies aloud"
            aria-pressed={speechEnabled}
            title="Read replies aloud"
            className={`mt-0.5 shrink-0 cursor-pointer rounded-lg border px-2.5 py-2 ${
              speechEnabled
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              {speechEnabled && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
              {speechEnabled && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
            </svg>
          </button>
        )}
      </header>

      <Transcript items={items} streaming={status === "streaming"} />

      {items.length === 0 && <SuggestedPrompts onPick={send} />}

      {errorText && (
        <p
          role="alert"
          className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {errorText}
        </p>
      )}

      <Composer
        disabled={status === "streaming"}
        onSend={send}
        onStop={stop}
        streaming={status === "streaming"}
      />
    </div>
  );
}
