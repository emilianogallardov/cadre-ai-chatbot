"use client";

import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  ActionCard,
  ChatMessage,
  StreamEvent,
} from "@/lib/chat/types";
import { toPayloadMessages } from "@/lib/chat/payload";
import {
  buildChatRequestBody,
  clearConversationToken,
  deleteSucceeded,
  noticeText,
  readConversationToken,
  readPrivateMode,
  subscribeSession,
  writeConversationToken,
  writePrivateMode,
} from "./conversationStorage";
import { Composer } from "./Composer";
import { hasSubmittedEscalation } from "./EscalationCard";
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
  // Failed sends restore the submitted text into the composer; the id makes
  // the same text restorable twice in a row.
  const [draft, setDraft] = useState<{ value: string; id: number } | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const {
    supported: speechSupported,
    enabled: speechEnabled,
    setEnabled: setSpeechEnabled,
    speak,
    cancel: cancelSpeech,
  } = useSpeechOutput();

  // Conversation-storage session state (ADR-008), read from the per-tab
  // sessionStorage-backed store. useSyncExternalStore hydrates SSR-safely
  // (server renders the defaults, the client swaps in the stored values on
  // hydration) and survives reloads within the tab.
  const conversationToken = useSyncExternalStore(
    subscribeSession,
    readConversationToken,
    () => null,
  );
  const privateMode = useSyncExternalStore(
    subscribeSession,
    readPrivateMode,
    () => false,
  );
  const [deleting, setDeleting] = useState(false);
  const [announce, setAnnounce] = useState<string | null>(null);

  const setPrivateMode = useCallback((on: boolean) => {
    writePrivateMode(on);
  }, []);

  const deleteConversation = useCallback(async () => {
    const token = readConversationToken();
    // Not during streaming: the in-flight turn's post-response store would
    // re-create the conversation right after the delete (Codex #1).
    if (!token || deleting || status === "streaming") return;
    setDeleting(true);
    setAnnounce(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (deleteSucceeded(await res.json())) {
        // Only the server copy is deleted; the on-screen transcript stays so the
        // visitor can keep reading it.
        clearConversationToken();
        setAnnounce("This chat was deleted from Cadre's records.");
      } else {
        setAnnounce(
          "Couldn't delete this chat just now. Please try again in a moment.",
        );
      }
    } catch {
      setAnnounce(
        "Couldn't delete this chat just now. Please try again in a moment.",
      );
    } finally {
      setDeleting(false);
    }
  }, [deleting, status]);

  // Stable dedup key per logical user turn (Codex #5): a retry of the same
  // text reuses the turnId so a turn the server already stored (but the client
  // failed to read back) dedups under the unique index instead of duplicating.
  const pendingTurnRef = useRef<{ text: string; turnId: string } | null>(null);

  // Synchronous in-flight guard: `status` is React state and updates only on
  // rerender, so two sends in the same tick would both pass the status check
  // and start parallel streams (interleaved transcript, double spend).
  const inFlightRef = useRef(false);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || status === "streaming" || inFlightRef.current) return;
      inFlightRef.current = true;

      // A new user message supersedes any reply still being read aloud.
      cancelSpeech();
      let assistantText = "";
      // A stream that ends without the terminal `done` event (and without an
      // abort) is a dropped connection, not a completed turn.
      let sawDone = false;

      const userItem: TranscriptItem = {
        message: { role: "user", content: trimmed },
      };
      const history = [...items, userItem];
      setItems([...history, { message: { role: "assistant", content: "" } }]);
      setStatus("streaming");
      setErrorText(null);
      setAnnounce(null);

      const controller = new AbortController();
      abortRef.current = controller;
      const turnId =
        pendingTurnRef.current?.text === trimmed
          ? pendingTurnRef.current.turnId
          : crypto.randomUUID();
      pendingTurnRef.current = { text: trimmed, turnId };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildChatRequestBody({
              messages: toPayloadMessages(history.map((i) => i.message)),
              turnId,
              conversationToken,
              privateMode,
            }),
          ),
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
        if (!sawDone) {
          throw Object.assign(
            new Error(
              "The connection dropped before the reply finished. Please try again.",
            ),
            { name: "StreamError" },
          );
        }
        // Turn completed: the next send is a new logical turn, not a retry.
        pendingTurnRef.current = null;
        setStatus("idle");
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStatus("idle");
        } else {
          setStatus("error");
          // StreamError carries the server's typed, user-safe message (rate
          // limit with wait time, provider failure) — show it rather than a
          // generic banner. Anything else gets the generic copy.
          setErrorText(
            (err as Error).name === "StreamError"
              ? (err as Error).message
              : "Something went wrong reaching the assistant. Your message " +
                  "is back in the box — try again, or contact Cadre directly " +
                  "at hello@gocadre.ai.",
          );
          // Put the failed message back in the composer so retrying is one
          // click, and drop the empty assistant placeholder so retry starts
          // clean.
          setDraft({ value: trimmed, id: Date.now() });
          setItems((prev) =>
            prev.filter(
              (it, idx) =>
                !(idx === prev.length - 1 && it.message.content === ""),
            ),
          );
        }
      } finally {
        abortRef.current = null;
        inFlightRef.current = false;
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
          // One submitted follow-up covers the session; stop offering new
          // escalation forms (already-rendered ones stay in the transcript).
          if (event.card.kind === "escalation" && hasSubmittedEscalation()) {
            return;
          }
          setItems((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = {
              ...last,
              cards: [...(last.cards ?? []), event.card],
            };
            return next;
          });
        } else if (event.type === "conversation") {
          // Server minted a new conversation; remember its signed token so later
          // turns and the delete control target the same server-side record.
          writeConversationToken(event.token);
        } else if (event.type === "done") {
          sawDone = true;
          // Read the completed reply once, only if output is enabled.
          speak(assistantText);
        } else if (event.type === "error") {
          throw Object.assign(new Error(event.message), { name: "StreamError" });
        }
      }
    },
    [items, status, cancelSpeech, speak, conversationToken, privateMode],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    cancelSpeech();
  }, [cancelSpeech]);

  return (
    // Full-bleed shell: the scroll area spans the viewport so the scrollbar
    // sits at the window edge; text stays in a centered readable column.
    <div className="chat-shell flex h-dvh flex-col">
      <header className="border-b border-zinc-200/70 bg-white/60 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/60">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-xl border border-zinc-200 bg-white text-xs font-semibold shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              C
            </span>
            <div className="min-w-0 max-[430px]:sr-only">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Cadre AI
              </p>
              <h1 className="truncate text-sm font-semibold tracking-tight">
                Resource Agent
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setPrivateMode(!privateMode)}
            aria-label="Private mode"
            aria-pressed={privateMode}
            title="Private mode — new messages aren't saved"
            className={`ui-lift h-9 cursor-pointer rounded-xl border bg-white/60 px-2.5 text-xs font-medium shadow-sm hover:bg-white hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:bg-zinc-900/60 dark:hover:bg-zinc-900 ${
              privateMode
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {privateMode ? "Private" : "Private off"}
          </button>

          {conversationToken && (
            <button
              type="button"
              onClick={deleteConversation}
              disabled={deleting || status === "streaming"}
              aria-label="Delete chat"
              title={
                status === "streaming"
                  ? "Available when the current reply finishes"
                  : "Delete this chat from Cadre's records"
              }
              className="ui-lift h-9 cursor-pointer rounded-xl border border-zinc-300 bg-white/60 px-2.5 text-xs font-medium text-zinc-500 shadow-sm hover:bg-white hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="sm:hidden"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span className="hidden sm:inline">
                {deleting ? "Deleting…" : "Delete chat"}
              </span>
            </button>
          )}

          {speechSupported && (
            <button
              type="button"
              onClick={() => setSpeechEnabled(!speechEnabled)}
              aria-label="Read replies aloud"
              aria-pressed={speechEnabled}
              title="Read replies aloud"
              className={`ui-lift grid h-9 w-9 cursor-pointer place-items-center rounded-xl border bg-white/60 shadow-sm hover:bg-white hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:bg-zinc-900/60 dark:hover:bg-zinc-900 ${
                speechEnabled
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
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
          </div>
        </div>
      </header>

      <Transcript items={items} streaming={status === "streaming"} />

      <div className="border-t border-zinc-200/70 bg-white/80 shadow-[0_-20px_60px_-40px_rgba(0,0,0,0.45)] backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/80">
        <div className="mx-auto w-full max-w-3xl px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3">
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
        draft={draft}
        onSend={send}
        onStop={stop}
        streaming={status === "streaming"}
      />

      <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
        {noticeText(privateMode)}{" "}
        <a
          href="/privacy"
          className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          Privacy
        </a>{" "}
        ·{" "}
        <button
          type="button"
          onClick={() => setPrivateMode(!privateMode)}
          className="cursor-pointer underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          {privateMode ? "Turn off private mode" : "Turn on private mode"}
        </button>
      </p>

      {/* Non-blocking feedback for delete (and other transient) actions. The
          live region is always present so screen readers announce updates; it
          stays empty (and visually collapsed) until there is something to say. */}
      <p
        role="status"
        aria-live="polite"
        className={
          announce
            ? "mb-2 text-xs text-zinc-500 dark:text-zinc-400"
            : "sr-only"
        }
      >
        {announce ?? ""}
      </p>
        </div>
      </div>
    </div>
  );
}
