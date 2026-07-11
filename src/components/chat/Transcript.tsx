"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import type { TranscriptItem } from "./Chat";
import { ActionCardView } from "./ActionCardView";
import { isNearBottom } from "./stickToBottom";
import { isVerifiedHref } from "./verifiedLinks";

// Model prose is untrusted: only verified Cadre origins become clickable
// (see verifiedLinks.ts); every other anchor renders as its text. Images are
// never fetched — `![x](url)` would fire a request to an arbitrary host
// (tracking pixel) or impersonate trusted content, so an image renders as its
// alt text only (Codex round 9 #4). Exported for the rendering-safety tests.
export const markdownComponents: Components = {
  a: ({ href, children }) =>
    isVerifiedHref(href) ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        {children}
      </a>
    ) : (
      <>{children}</>
    ),
  img: ({ alt }) => (alt ? <>{alt}</> : null),
};

export function Transcript({
  items,
  streaming,
}: {
  items: TranscriptItem[];
  streaming: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Pin to the bottom only while the user is already there; scrolling up
  // hands control back until they return (or click the pill).
  const stickRef = useRef(true);
  // True while a pill-triggered smooth scroll is in flight, so its
  // intermediate scroll events don't read as the user scrolling away.
  const animatingRef = useRef(false);
  const [pillVisible, setPillVisible] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = isNearBottom(el.scrollTop, el.clientHeight, el.scrollHeight);
    if (animatingRef.current) {
      if (near) animatingRef.current = false;
      return;
    }
    stickRef.current = near;
    if (near) setPillVisible(false);
  }, []);

  // Wheel/touch input means the user took over; cancel any pill animation so
  // the next scroll event re-evaluates sticking from their real position.
  const handleUserScrollIntent = useCallback(() => {
    animatingRef.current = false;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickRef.current || animatingRef.current) {
      // Instant while pinned: per-token smooth scrolling would lag the stream,
      // and an instant jump is also what reduced-motion users expect.
      el.scrollTop = el.scrollHeight;
    } else if (el.scrollHeight > el.clientHeight) {
      setPillVisible(true);
    }
  }, [items]);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setPillVisible(false);
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      el.scrollTop = el.scrollHeight;
    } else {
      animatingRef.current = true;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* The scroll container is full-bleed so the scrollbar sits at the
          window edge; the inner wrapper keeps text in a readable column. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onWheel={handleUserScrollIntent}
        onTouchMove={handleUserScrollIntent}
        // Focusable so keyboard users can scroll the history with arrow/page
        // keys — role="log" alone adds no focusability, and the fixed-height
        // shell leaves no other way to scroll by keyboard (Codex round 9 #5).
        tabIndex={0}
        className="chat-scroll flex-1 overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-500"
        role="log"
        aria-live="polite"
        // Streaming reparses the markdown subtree on every token; aria-busy
        // asks screen readers to hold announcements until the reply settles
        // instead of narrating each restructure (Codex round 9 #7).
        aria-busy={streaming}
        aria-label="Conversation"
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {items.length === 0 ? (
            <div className="mx-auto mt-12 max-w-md text-center sm:mt-20">
              <div
                aria-hidden="true"
                className="mx-auto grid size-11 place-items-center rounded-2xl border border-zinc-200 bg-white/80 text-sm font-semibold shadow-[0_10px_30px_-16px_rgba(0,0,0,0.5)] ring-1 ring-black/[0.03] dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/[0.06]"
              >
                C
              </div>
              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                Cadre AI resource agent
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-zinc-900 dark:text-zinc-100">
                Make your next AI decision clearer.
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Ask about Cadre&apos;s services, approach, industries, or AI
                Maturity Index.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-6">
              {items.map((item, i) => (
                <li
                  key={i}
                  className={
                    item.message.role === "user"
                      ? "msg-in ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-zinc-900 px-4 py-2.5 text-sm text-white shadow-[0_10px_28px_-16px_rgba(0,0,0,0.55)] ring-1 ring-black/[0.06] dark:bg-zinc-100 dark:text-zinc-900 dark:ring-white/10"
                      : "msg-in mr-auto w-full"
                  }
                >
                  {item.message.role === "assistant" ? (
                    <div className="flex max-w-[42rem] items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-white/80 text-[10px] font-semibold shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        C
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                          Cadre AI
                        </p>
                        {item.message.content === "" &&
                        streaming &&
                        i === items.length - 1 ? (
                          <span
                            className="typing-dots inline-flex items-center gap-1 py-1"
                            aria-label="Assistant is typing"
                          >
                            <span aria-hidden="true" />
                            <span aria-hidden="true" />
                            <span aria-hidden="true" />
                          </span>
                        ) : (
                          <div className="assistant-md text-[15px] leading-7 text-zinc-800 dark:text-zinc-200">
                            <ReactMarkdown components={markdownComponents}>
                              {item.message.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        {item.cards?.map((card, j) => (
                          <ActionCardView key={j} card={card} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap text-sm">
                      {item.message.content}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {pillVisible && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="tap-target absolute bottom-3 left-1/2 -translate-x-1/2 cursor-pointer rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-md hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <span aria-hidden="true">↓</span> Latest
        </button>
      )}
    </div>
  );
}
