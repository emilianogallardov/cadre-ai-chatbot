"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const noopSubscribe = () => () => {};

/**
 * Merge a spoken fragment onto already-committed text with exactly one space.
 * Used both to preview interim results live and to append a final transcript.
 * Pure so the merge behaviour is unit-tested without the browser plumbing.
 */
export function joinTranscript(base: string, addition: string): string {
  const b = base.replace(/\s+$/, "");
  const a = addition.trim();
  if (!a) return base;
  if (!b) return a;
  return `${b} ${a}`;
}

/**
 * Minimal structural types for the Web Speech API — it is not part of the
 * TypeScript DOM lib and is only present in some browsers (Chrome-first, per
 * ADR-003). We never touch these at module scope; detection happens in effects.
 */
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  0: SpeechAlternative;
  isFinal: boolean;
}
interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
interface RecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => RecognitionInstance;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type TranscriptHandler = (text: string, isFinal: boolean) => void;

export interface SpeechInput {
  supported: boolean;
  listening: boolean;
  start: (onTranscript: TranscriptHandler) => void;
  /** Graceful stop: the engine may still deliver one final transcript. */
  stop: () => void;
  /**
   * Hard stop: detaches the transcript handler before aborting so no trailing
   * result fires. Use when the current input has already been consumed (e.g.
   * submit), where a late final result would repopulate a cleared composer.
   */
  cancel: () => void;
}

/**
 * Feature-detected wrapper around SpeechRecognition. Text chat works fully when
 * this returns `supported: false` (unsupported browser or SSR). Only one
 * recognition instance runs at a time; a permission denial simply stops
 * listening without crashing.
 */
export function useSpeechInput(): SpeechInput {
  // SSR-safe feature detection: server renders `false`, the client swaps in the
  // real value on hydration without a setState-in-effect cascade.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => getRecognitionCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<RecognitionInstance | null>(null);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      // Some engines throw if stop() is called before start resolves; ignore.
    }
  }, []);

  const cancel = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    // Detach the result handler FIRST: stop()/abort() may still flush a final
    // onresult, which must not reach the (already consumed) transcript
    // callback (Codex round 9 #3).
    rec.onresult = null;
    try {
      rec.abort();
    } catch {
      // Same engine quirk as stop(); onend still clears the ref.
    }
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback((onTranscript: TranscriptHandler) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    // Enforce a single live instance.
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;

    rec.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) final += text;
        else interim += text;
      }
      if (final) onTranscript(final, true);
      else if (interim) onTranscript(interim, false);
    };
    rec.onerror = () => {
      // Includes 'not-allowed' (permission denied): stop cleanly, no throw.
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      recognitionRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch {
          // ignore
        }
      }
    },
    [],
  );

  return { supported, listening, start, stop, cancel };
}
