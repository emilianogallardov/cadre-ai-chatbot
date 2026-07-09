import type { ActionCard } from "@/lib/chat/types";
import { EscalationCard } from "./EscalationCard";

export function ActionCardView({ card }: { card: ActionCard }) {
  if (card.kind === "escalation") {
    return <EscalationCard card={card} />;
  }

  return (
    <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm font-medium">{card.title}</p>
      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
        {card.body}
      </p>
      {card.url && (
        <a
          href={card.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-block text-sm font-medium underline underline-offset-2"
        >
          Open {new URL(card.url).hostname}
        </a>
      )}
    </div>
  );
}
