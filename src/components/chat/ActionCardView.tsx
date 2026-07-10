import type { ActionCard } from "@/lib/chat/types";
import { EscalationCard } from "./EscalationCard";

export function ActionCardView({ card }: { card: ActionCard }) {
  if (card.kind === "escalation") {
    return <EscalationCard card={card} />;
  }

  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/80 p-4 shadow-[0_12px_30px_-20px_rgba(0,0,0,0.55)] ring-1 ring-black/[0.025] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-zinc-300 before:to-transparent dark:border-zinc-800 dark:bg-zinc-900/80 dark:ring-white/[0.05] dark:before:via-zinc-700">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        Recommended next step
      </p>
      <p className="mt-1 text-sm font-semibold tracking-tight">{card.title}</p>
      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
        {card.body}
      </p>
      {card.url && (
        <a
          href={card.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ui-lift mt-3 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-sm hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Open {new URL(card.url).hostname}
          <span aria-hidden="true">↗</span>
        </a>
      )}
    </div>
  );
}
