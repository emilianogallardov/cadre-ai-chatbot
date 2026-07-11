"use client";

import { useEffect } from "react";

/**
 * Pins the app shell to the *visual* viewport. iOS Safari overlays the
 * on-screen keyboard instead of resizing the layout viewport: a 100dvh shell
 * keeps its full height, Safari scrolls the document to reveal the focused
 * input, and the composer ends up floating mid-screen above a dead zone with
 * the header pushed behind the status bar. Publishing visualViewport.height
 * as --vvh (consumed as the shell's height) collapses the layout to the
 * visible area, and re-pinning the document scroll keeps the header
 * on-screen — the standard chat-app pattern until Safari supports the
 * interactive-widget viewport hint (Chrome/Firefox only today).
 */
export function useVisualViewportPin() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
      // Re-pin the document ONLY while a text control is focused — that is
      // the input-reveal scroll this exists to counter. Unconditional pinning
      // interrupted iOS's elastic bounce mid-animation on every scroll event,
      // which read as extremely choppy rubber-banding. scrollY > 0 skips the
      // bounce itself (negative/zero during elastic overscroll at the top).
      const active = document.activeElement;
      const editing =
        active instanceof HTMLElement &&
        (active.tagName === "TEXTAREA" || active.tagName === "INPUT");
      if (editing && window.scrollY > 0) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      vv.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      root.style.removeProperty("--vvh");
    };
  }, []);
}
