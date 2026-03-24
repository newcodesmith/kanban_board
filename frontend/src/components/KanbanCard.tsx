import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
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

export const KanbanCard = ({ card, onDelete }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

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
      <button
        type="button"
        onClick={() => onDelete(card.id)}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-[var(--gray-text)] opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
        aria-label={`Delete ${card.title}`}
      >
        <TrashIcon />
      </button>
      <h4 className="min-w-0 break-normal pr-5 font-display text-base font-semibold text-[var(--navy-dark)]">
        {card.title}
      </h4>
      <p className="mt-2 break-normal text-sm leading-6 text-[var(--gray-text)]">
        {card.details}
      </p>
    </article>
  );
};
