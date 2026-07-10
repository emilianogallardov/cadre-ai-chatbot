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
    <div className="mb-3 flex flex-wrap gap-2">
      {PROMPTS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPick(p)}
          className="cursor-pointer rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {p}
        </button>
      ))}
    </div>
  );
}
