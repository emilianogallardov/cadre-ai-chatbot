/**
 * Rendering-safety contract for model prose (Codex round 9 #4).
 *
 * The transcript renders assistant markdown through custom components; these
 * tests call those components directly (no DOM needed) and assert on the
 * React elements they return: unverified anchors degrade to their text, and
 * images NEVER render an <img> — a `![x](url)` in model output must not fire
 * a request to an arbitrary host or impersonate trusted content.
 */
import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { markdownComponents } from "../Transcript";

type AnyProps = Record<string, unknown>;

function renderComponent(name: "a" | "img", props: AnyProps) {
  const component = markdownComponents[name] as (
    props: AnyProps,
  ) => ReactElement | null;
  return component(props);
}

describe("markdown anchor gating", () => {
  it("renders a verified Cadre href as a hardened external link", () => {
    const el = renderComponent("a", {
      href: "https://www.cadreai.com/services",
      children: "our services",
    });
    expect(isValidElement(el)).toBe(true);
    expect(el?.type).toBe("a");
    const props = el?.props as AnyProps;
    expect(props.href).toBe("https://www.cadreai.com/services");
    expect(props.target).toBe("_blank");
    expect(props.rel).toBe("noopener noreferrer");
  });

  it("renders an unverified href as its children only — no anchor element", () => {
    const el = renderComponent("a", {
      href: "https://attacker.example/phish",
      children: "click here",
    });
    expect(el?.type).not.toBe("a");
    expect((el?.props as AnyProps).children).toBe("click here");
  });

  it("renders a missing href as children only", () => {
    const el = renderComponent("a", { children: "just text" });
    expect(el?.type).not.toBe("a");
  });
});

describe("markdown image gating", () => {
  it("renders an image as its alt text only — never an <img> element", () => {
    const el = renderComponent("img", {
      src: "https://attacker.example/pixel.gif",
      alt: "diagram",
    });
    expect(el?.type).not.toBe("img");
    expect((el?.props as AnyProps).children).toBe("diagram");
  });

  it("renders an alt-less image as nothing", () => {
    expect(
      renderComponent("img", { src: "https://attacker.example/pixel.gif" }),
    ).toBeNull();
    expect(
      renderComponent("img", {
        src: "https://attacker.example/pixel.gif",
        alt: "",
      }),
    ).toBeNull();
  });
});
