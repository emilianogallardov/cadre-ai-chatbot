"use client";

import { FormEvent, useCallback, useState } from "react";
import { LIMITS } from "@/lib/chat/types";
import { joinTranscript, useSpeechInput } from "./useSpeechInput";

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
  const [interim, setInterim] = useState("");
  const speech = useSpeechInput();

  // Interim speech is previewed live; the committed text plus any interim is
  // what the user reviews and sends. Voice never auto-submits.
  const value = interim ? joinTranscript(text, interim) : text;

  const handleTranscript = useCallback((spoken: string, isFinal: boolean) => {
    if (isFinal) {
      setText((prev) => joinTranscript(prev, spoken));
      setInterim("");
    } else {
      setInterim(spoken);
    }
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (disabled || !value.trim()) return;
    if (speech.listening) speech.stop();
    onSend(value);
    setText("");
    setInterim("");
  }

  function toggleMic() {
    if (speech.listening) {
      speech.stop();
    } else {
      setInterim("");
      speech.start(handleTranscript);
    }
  }

  return (
    <form onSubmit={submit} className="flex gap-2 border-t border-zinc-200 py-3 dark:border-zinc-800">
      <label htmlFor="chat-input" className="sr-only">
        Your question
      </label>
      <input
        id="chat-input"
        value={value}
        onChange={(e) => {
          setText(e.target.value);
          setInterim("");
        }}
        maxLength={LIMITS.maxMessageChars}
        placeholder="Ask about Cadre AI…"
        autoComplete="off"
        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-400/40 dark:border-zinc-700 dark:focus:border-zinc-400"
      />
      {speech.supported && (
        <button
          type="button"
          onClick={toggleMic}
          disabled={disabled}
          aria-label={speech.listening ? "Stop voice input" : "Start voice input"}
          aria-pressed={speech.listening}
          className={`cursor-pointer rounded-lg border px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 disabled:cursor-not-allowed disabled:opacity-40 ${
            speech.listening
              ? "animate-pulse border-red-500 text-red-600 dark:border-red-500 dark:text-red-400"
              : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
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
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </svg>
        </button>
      )}
      {streaming ? (
        <button
          type="button"
          onClick={onStop}
          className="cursor-pointer rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:border-zinc-700"
        >
          Stop
        </button>
      ) : (
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Send
        </button>
      )}
    </form>
  );
}
