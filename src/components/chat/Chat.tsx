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
        // Turn completed: the next send is a new logical turn, not a retry.
        pendingTurnRef.current = null;
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
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 py-4 dark:border-zinc-800">
        <h1 className="truncate text-lg font-semibold">
          Cadre AI Resource Agent
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setPrivateMode(!privateMode)}
            aria-label="Private mode"
            aria-pressed={privateMode}
            title="Private mode — Cadre won't save this chat"
            className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
              privateMode
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
            }`}
          >
            {privateMode ? "Private" : "Private off"}
          </button>

          {conversationToken && (
            <button
              type="button"
              onClick={deleteConversation}
              disabled={deleting}
              title="Delete this chat from Cadre's records"
              className="cursor-pointer rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400"
            >
              {deleting ? "Deleting…" : "Delete chat"}
            </button>
          )}

          {speechSupported && (
            <button
              type="button"
              onClick={() => setSpeechEnabled(!speechEnabled)}
              aria-label="Read replies aloud"
              aria-pressed={speechEnabled}
              title="Read replies aloud"
              className={`cursor-pointer rounded-lg border px-2.5 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 ${
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
        </div>
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
  );
}
