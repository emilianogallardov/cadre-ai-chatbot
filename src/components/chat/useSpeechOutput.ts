"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const noopSubscribe = () => () => {};

/** Collapse whitespace and trim so an utterance reads cleanly and is never blank. */
export function prepareUtterance(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Pure gate: speech happens only when supported, enabled, and there is text. */
export function canSpeak(
  supported: boolean,
  enabled: boolean,
  text: string,
): boolean {
  return supported && enabled && prepareUtterance(text).length > 0;
}

export interface SpeechOutput {
  supported: boolean;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  speak: (text: string) => void;
  cancel: () => void;
}

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  return window.speechSynthesis;
}

/**
 * Feature-detected wrapper around speechSynthesis. OFF by default and never
 * autoplays (ADR-003): speak() no-ops unless the user has enabled output.
 * Each speak() cancels the previous utterance so replies never queue up.
 */
export function useSpeechOutput(): SpeechOutput {
  // SSR-safe feature detection: server renders `false`, the client swaps in the
  // real value on hydration without a setState-in-effect cascade.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () =>
      synth() !== null && typeof window.SpeechSynthesisUtterance === "function",
    () => false,
  );
  const [enabled, setEnabledState] = useState(false);
  // Ref mirror so the stable speak() callback reads the current toggle.
  const enabledRef = useRef(false);

  const cancel = useCallback(() => {
    synth()?.cancel();
  }, []);

  const speak = useCallback((text: string) => {
    const engine = synth();
    if (!engine || !enabledRef.current) return;
    const utterance = prepareUtterance(text);
    if (!utterance) return;
    engine.cancel();
    const u = new SpeechSynthesisUtterance(utterance);
    u.lang = "en-US";
    engine.speak(u);
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    enabledRef.current = value;
    setEnabledState(value);
    if (!value) synth()?.cancel();
  }, []);

  // Stop any in-flight speech if the component unmounts.
  useEffect(() => () => synth()?.cancel(), []);

  return { supported, enabled, setEnabled, speak, cancel };
}
