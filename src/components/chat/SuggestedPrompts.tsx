"use client";

/**
 * Four prompts drawn from the evaluated scenarios in
 * data/curated/scenario-coverage.md — they double as a live demo path.
 */
const PROMPTS = [
  "What does Cadre AI do, and do you work with construction companies?",
  "How do I book a call with an AI strategist?",
  "What is the AI Maturity Index?",
  "How does Cadre approach LLM selection and data security?",
];

export function SuggestedPrompts({
  onPick,
}: {
  onPick: (text: string) => void;
}) {
  return (
    // Quiet line-item list under the first-run hero (owner rejected the boxy
    // card grid): hairline dividers, plain text, an arrow that answers hover.
    <div className="mx-auto mt-7 w-full max-w-md text-left">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500">
        Try asking
      </p>
      <ul className="mt-2 divide-y divide-zinc-200/70 border-y border-zinc-200/70 dark:divide-zinc-800 dark:border-zinc-800">
        {PROMPTS.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className="tap-target group flex w-full cursor-pointer items-center justify-between gap-3 px-1 py-3 text-left text-sm leading-5 text-zinc-600 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-500 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <span>{p}</span>
              <span
                aria-hidden="true"
                className="shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-400"
              >
                →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
