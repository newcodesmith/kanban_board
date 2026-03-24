"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { CardDetailModal } from "@/components/CardDetailModal";
import { createId, initialData, moveCard, type BoardData, type Card } from "@/lib/kanban";

type KanbanBoardProps = {
  initialBoard?: BoardData;
  boardName?: string;
  onBoardChange?: (nextBoard: BoardData) => void;
};

export const KanbanBoard = ({ initialBoard, boardName, onBoardChange }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData>(() => initialBoard ?? initialData);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);

  const updateBoard = (updater: (current: BoardData) => BoardData) => {
    setBoard((current) => {
      const nextBoard = updater(current);
      onBoardChange?.(nextBoard);
      return nextBoard;
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board.cards, [board.cards]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    updateBoard((prev) => ({
      ...prev,
      columns: moveCard(prev.columns, active.id as string, over.id as string),
    }));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    updateBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    updateBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    updateBoard((prev) => {
      return {
        ...prev,
        cards: Object.fromEntries(
          Object.entries(prev.cards).filter(([id]) => id !== cardId)
        ),
        columns: prev.columns.map((column) =>
          column.id === columnId
            ? {
                ...column,
                cardIds: column.cardIds.filter((id) => id !== cardId),
              }
            : column
        ),
      };
    });
  };

  const handleSaveCard = (updated: Card) => {
    updateBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [updated.id]: updated,
      },
    }));
  };

  const totalCards = board.columns.reduce((sum, col) => sum + col.cardIds.length, 0);
  const highPriorityCount = Object.values(board.cards).filter(
    (c) => c.priority === "high"
  ).length;

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  return (
    <div className="relative overflow-hidden">
      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16">
        <header className="flex items-center gap-4 rounded-[32px] border border-[var(--stroke)] bg-white/80 px-8 py-5 shadow-[var(--shadow)] backdrop-blur">
          <div className="h-2 w-10 shrink-0 rounded-full bg-[var(--accent-yellow)]" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
              Project Board
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-[var(--navy-dark)] truncate">
              {boardName ?? "Kanban Studio"}
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-6 border-l border-[var(--stroke)] pl-6">
            <div className="text-center">
              <p className="text-xl font-bold text-[var(--navy-dark)]">{totalCards}</p>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">Cards</p>
            </div>
            {highPriorityCount > 0 ? (
              <div className="text-center">
                <p className="text-xl font-bold text-red-500">{highPriorityCount}</p>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">High Priority</p>
              </div>
            ) : null}
            <div className="text-center">
              <p className="text-xl font-bold text-[var(--navy-dark)]">{board.columns.length}</p>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">Columns</p>
            </div>
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid gap-6 lg:grid-cols-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds
                  .map((cardId) => board.cards[cardId])
                  .filter(Boolean)}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onEditCard={(card) => setEditingCard(card)}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      {editingCard ? (
        <CardDetailModal
          card={editingCard}
          onSave={handleSaveCard}
          onDelete={() => {
            const col = board.columns.find((c) =>
              c.cardIds.includes(editingCard.id)
            );
            if (col) handleDeleteCard(col.id, editingCard.id);
          }}
          onClose={() => setEditingCard(null)}
        />
      ) : null}
    </div>
  );
};
