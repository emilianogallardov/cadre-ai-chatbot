"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { LIMITS } from "@/lib/chat/types";
import { joinTranscript, useSpeechInput } from "./useSpeechInput";

export function Composer({
  disabled,
  draft,
  streaming,
  onSend,
  onStop,
}: {
  disabled: boolean;
  /** A failed send restored by the parent; changes of `id` re-apply it. */
  draft?: { value: string; id: number } | null;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const speech = useSpeechInput();

  // When a send fails the parent hands the submitted text back so retrying is
  // one click — the composer cleared it optimistically on submit. Applied as
  // a render-time state adjustment (not an effect) per React guidance. Only
  // an EMPTY composer accepts the restore: the input stays editable during a
  // reply, so a visitor may already be typing their next question when the
  // stream fails — their words win over ours (Codex round 9 #2). The draft id
  // is consumed either way so a later manual clear doesn't resurrect it.
  const [appliedDraftId, setAppliedDraftId] = useState<number | null>(null);
  if (draft && draft.id !== appliedDraftId) {
    setAppliedDraftId(draft.id);
    if (!text) setText(draft.value);
  }

  // Interim speech is previewed live; the committed text plus any interim is
  // what the user reviews and sends. Voice never auto-submits.
  const value = interim ? joinTranscript(text, interim) : text;

  // Auto-grow: the textarea tracks its content up to ~5 lines, then scrolls
  // internally — a long question stays fully visible instead of cutting off
  // in a one-line box.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [value]);

  const handleTranscript = useCallback((spoken: string, isFinal: boolean) => {
    if (isFinal) {
      setText((prev) => joinTranscript(prev, spoken));
      setInterim("");
    } else {
      setInterim(spoken);
    }
  }, []);

  function doSend() {
    if (disabled || !value.trim()) return;
    // cancel(), not stop(): stop() lets the engine deliver one last final
    // result, which would repopulate the just-cleared composer with the text
    // that was already sent (Codex round 9 #3). What the user reviewed —
    // committed text plus visible interim — is exactly what goes out.
    if (speech.listening) speech.cancel();
    onSend(value);
    setText("");
    setInterim("");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    doSend();
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
    <form
      onSubmit={submit}
      // items-end keeps the mic/Send buttons seated at the bottom edge while
      // the textarea grows upward.
      className="mb-2 flex items-end gap-1 rounded-2xl border border-zinc-200/80 bg-white p-1.5 shadow-[0_12px_32px_-18px_rgba(0,0,0,0.45)] ring-1 ring-black/[0.02] transition-[border-color,box-shadow] focus-within:border-zinc-400 focus-within:shadow-[0_14px_36px_-18px_rgba(0,0,0,0.5)] dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/[0.06] dark:focus-within:border-zinc-600"
    >
      <label htmlFor="chat-input" className="sr-only">
        Your question
      </label>
      <textarea
        id="chat-input"
        ref={inputRef}
        rows={1}
        value={value}
        onChange={(e) => {
          setText(e.target.value);
          setInterim("");
        }}
        onKeyDown={(e) => {
          // Enter sends (parity with the old single-line input); Shift+Enter
          // makes a newline for anyone composing a longer question.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            doSend();
          }
        }}
        maxLength={LIMITS.maxMessageChars}
        placeholder="Ask about Cadre AI…"
        autoComplete="off"
        // text-base below sm: iOS Safari auto-zooms the page when a focused
        // input's font-size is under 16px, which wrecks the fixed dock layout.
        className="min-w-0 flex-1 resize-none rounded-xl border-0 bg-transparent px-3 py-2.5 text-base leading-5 outline-none placeholder:text-zinc-500 sm:text-sm dark:placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-400/40 focus-visible:ring-inset"
      />
      {speech.supported && (
        <button
          type="button"
          onClick={toggleMic}
          disabled={disabled}
          aria-label={speech.listening ? "Stop voice input" : "Start voice input"}
          aria-pressed={speech.listening}
          className={`grid h-10 w-10 cursor-pointer place-items-center rounded-xl border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 disabled:cursor-not-allowed disabled:opacity-40 ${
            speech.listening
              ? "animate-pulse border-red-500 text-red-600 motion-reduce:animate-none dark:border-red-500 dark:text-red-400"
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
          className="ui-lift h-10 cursor-pointer rounded-xl border border-zinc-300 px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:border-zinc-700"
        >
          Stop
        </button>
      ) : (
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="ui-lift h-10 cursor-pointer rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Send
        </button>
      )}
    </form>
  );
}
