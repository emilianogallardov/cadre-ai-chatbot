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

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || status === "streaming") return;

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
        } else if (event.type === "error") {
          throw Object.assign(new Error(event.message), { name: "StreamError" });
        }
      }
    },
    [items, status],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-4">
      <header className="border-b border-zinc-200 py-4 dark:border-zinc-800">
        <h1 className="text-lg font-semibold">Cadre AI Support</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Ask about services, industries, the AI Maturity Index, or talking
          with an AI strategist.
        </p>
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
