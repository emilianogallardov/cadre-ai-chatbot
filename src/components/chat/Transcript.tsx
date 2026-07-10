"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { TranscriptItem } from "./Chat";
import { ActionCardView } from "./ActionCardView";
import { isNearBottom } from "./stickToBottom";

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
        className="chat-scroll flex-1 overflow-y-auto"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {items.length === 0 ? (
            <div className="mt-16 text-center">
              <p className="text-base font-medium text-zinc-600 dark:text-zinc-300">
                How can we help?
              </p>
              <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
                Start the conversation, or pick a question below.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-5">
              {items.map((item, i) => (
                <li
                  key={i}
                  className={
                    item.message.role === "user"
                      ? "msg-in ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-zinc-900 px-4 py-2.5 text-sm text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                      : "msg-in mr-auto w-full text-sm leading-relaxed"
                  }
                >
                  {item.message.content === "" &&
                  item.message.role === "assistant" &&
                  streaming &&
                  i === items.length - 1 ? (
                    <span
                      className="typing-dots inline-flex items-center gap-1"
                      aria-label="Assistant is typing"
                    >
                      <span aria-hidden="true" />
                      <span aria-hidden="true" />
                      <span aria-hidden="true" />
                    </span>
                  ) : item.message.role === "assistant" ? (
                    <div className="assistant-md">
                      <ReactMarkdown>{item.message.content}</ReactMarkdown>
                    </div>
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
        </div>
      </div>
      {pillVisible && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 cursor-pointer rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-md hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <span aria-hidden="true">↓</span> Latest
        </button>
      )}
    </div>
  );
}
