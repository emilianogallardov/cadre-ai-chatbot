"use client";

import { useEffect, useRef } from "react";
import type { TranscriptItem } from "./Chat";
import { ActionCardView } from "./ActionCardView";

export function Transcript({
  items,
  streaming,
}: {
  items: TranscriptItem[];
  streaming: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items]);

  return (
    <div
      className="flex-1 overflow-y-auto py-4"
      role="log"
      aria-live="polite"
      aria-label="Conversation"
    >
      {items.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
          Start the conversation, or pick a question below.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item, i) => (
            <li
              key={i}
              className={
                item.message.role === "user"
                  ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "mr-auto max-w-[85%] text-sm leading-relaxed"
              }
            >
              {item.message.content === "" &&
              item.message.role === "assistant" &&
              streaming &&
              i === items.length - 1 ? (
                <span
                  className="text-zinc-400 dark:text-zinc-500"
                  aria-label="Assistant is typing"
                >
                  Thinking…
                </span>
              ) : (
                <span className="whitespace-pre-wrap">
                  {item.message.content}
                </span>
              )}
              {item.cards?.map((card, j) => (
                <ActionCardView key={j} card={card} />
              ))}
            </li>
          ))}
        </ul>
      )}
      <div ref={endRef} />
    </div>
  );
}
