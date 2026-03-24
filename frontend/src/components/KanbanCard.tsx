import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card } from "@/lib/kanban";
import { getPriorityStyle, getLabelColor } from "@/components/CardDetailModal";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (card: Card) => void;
};

const TrashIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-emerald-400",
  medium: "bg-amber-400",
  high: "bg-red-400",
};

export const KanbanCard = ({ card, onDelete, onEdit }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isOverdue =
    card.due_date && new Date(card.due_date) < new Date(new Date().toDateString());

  const priorityStyle = getPriorityStyle(card.priority);

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      {/* Action buttons row — visible on hover */}
      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 -mt-1 mb-1.5 h-6">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(card);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--gray-text)] transition hover:bg-blue-50 hover:text-[var(--primary-blue)]"
          aria-label={`Edit ${card.title}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(card.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--gray-text)] transition hover:bg-red-50 hover:text-red-500"
          aria-label={`Delete ${card.title}`}
        >
          <TrashIcon />
        </button>
      </div>

      <div className="flex items-start gap-2">
        {card.priority ? (
          <span
            className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[card.priority])}
            title={`Priority: ${card.priority}`}
          />
        ) : null}
        <h4 className="min-w-0 flex-1 break-normal font-display text-base font-semibold text-[var(--navy-dark)]">
          {card.title}
        </h4>
      </div>

      {card.details ? (
        <p className="mt-2 break-normal text-sm leading-6 text-[var(--gray-text)]">
          {card.details}
        </p>
      ) : null}

      {/* Labels */}
      {card.labels && card.labels.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.labels.map((label, i) => (
            <span
              key={label}
              className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", getLabelColor(i))}
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}

      {/* Due date */}
      {card.due_date ? (
        <p
          className={clsx(
            "mt-2 text-xs font-semibold",
            isOverdue ? "text-red-500" : "text-[var(--gray-text)]"
          )}
        >
          {isOverdue ? "⚠ Overdue: " : "Due: "}
          {new Date(card.due_date + "T00:00:00").toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </p>
      ) : null}

      {/* Priority badge */}
      {priorityStyle ? (
        <span
          className={clsx(
            "mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
            priorityStyle
          )}
        >
          {card.priority}
        </span>
      ) : null}

    </article>
  );
};
