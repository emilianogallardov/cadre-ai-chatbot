"use client";

/**
 * Sourced from the six evaluated scenarios in
 * data/curated/scenario-coverage.md — these double as a live demo path.
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
    // Horizontal rail on mobile (four long prompts would swallow a 375px
    // viewport), two-column grid from sm up.
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2">
      {PROMPTS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPick(p)}
          className="ui-lift group flex min-w-[15rem] cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-200/80 bg-white/70 px-3.5 py-3 text-left text-xs leading-5 text-zinc-700 shadow-sm hover:border-zinc-300 hover:bg-white hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 sm:min-w-0 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <span>{p}</span>
          <span
            aria-hidden="true"
            className="text-zinc-400 transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </button>
      ))}
    </div>
  );
}
