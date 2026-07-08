"use client";

import { FormEvent, useState } from "react";
import { LIMITS } from "@/lib/chat/types";

export function Composer({
  disabled,
  streaming,
  onSend,
  onStop,
}: {
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (disabled || !text.trim()) return;
    onSend(text);
    setText("");
  }

  return (
    <form onSubmit={submit} className="flex gap-2 border-t border-zinc-200 py-3 dark:border-zinc-800">
      <label htmlFor="chat-input" className="sr-only">
        Your question
      </label>
      <input
        id="chat-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={LIMITS.maxMessageChars}
        placeholder="Ask about Cadre AI…"
        autoComplete="off"
        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-400"
      />
      {streaming ? (
        <button
          type="button"
          onClick={onStop}
          className="cursor-pointer rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Stop
        </button>
      ) : (
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Send
        </button>
      )}
    </form>
  );
}
