"use client";

import { FormEvent, useState } from "react";
import type { BoardMeta } from "@/lib/api";

type Props = {
  boards: BoardMeta[];
  activeBoardId: number | null;
  onSelectBoard: (boardId: number) => void;
  onCreateBoard: (name: string) => Promise<void>;
  onRenameBoard: (boardId: number, name: string) => Promise<void>;
  onDeleteBoard: (boardId: number) => Promise<void>;
  isOpen: boolean;
  onClose: () => void;
};

export const BoardSidebar = ({
  boards,
  activeBoardId,
  onSelectBoard,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  isOpen,
  onClose,
}: Props) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newBoardName.trim();
    if (!name) return;
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      await onCreateBoard(name);
      setNewBoardName("");
      setIsCreating(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create board");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (renamingId === null) return;
    const name = renameValue.trim();
    if (!name) return;
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      await onRenameBoard(renamingId, name);
      setRenamingId(null);
      setRenameValue("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to rename board");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (boardId: number) => {
    setErrorMessage("");
    try {
      await onDeleteBoard(boardId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete board");
    }
  };

  return (
    <>
      {isOpen ? (
        <button
          type="button"
          aria-label="Close boards panel"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-[var(--navy-dark)]/20"
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-[var(--stroke)] bg-white shadow-[var(--shadow)] transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-12 items-center justify-between border-b border-[var(--stroke)] px-4">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--primary-blue)]" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <h2 className="font-display text-sm font-semibold text-[var(--navy-dark)]">My Boards</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--stroke)] text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            aria-label="Close boards panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {boards.map((board) => (
            <div key={board.id} className="group relative">
              {renamingId === board.id ? (
                <form onSubmit={handleRename} className="flex gap-1">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="flex-1 min-w-0 rounded-lg border border-[var(--primary-blue)] px-2 py-1.5 text-sm text-[var(--navy-dark)] outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameValue("");
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-lg bg-[var(--primary-blue)] px-2 py-1 text-xs text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                </form>
              ) : (
                <div
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                    activeBoardId === board.id
                      ? "bg-[var(--navy-dark)] text-white"
                      : "text-[var(--navy-dark)] hover:bg-[var(--surface)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectBoard(board.id);
                      onClose();
                    }}
                    className="flex-1 text-left truncate"
                  >
                    {board.name}
                  </button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition ml-2 shrink-0">
                    <button
                      type="button"
                      aria-label={`Rename ${board.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(board.id);
                        setRenameValue(board.name);
                      }}
                      className="p-1 rounded hover:bg-white/20"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    {boards.length > 1 ? (
                      <button
                        type="button"
                        aria-label={`Delete ${board.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(board.id);
                        }}
                        className="p-1 rounded hover:bg-white/20"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          ))}

          {errorMessage ? (
            <p className="px-2 text-xs font-medium text-[var(--secondary-purple)]">{errorMessage}</p>
          ) : null}
        </div>

        <div className="border-t border-[var(--stroke)] p-3">
          {isCreating ? (
            <form onSubmit={handleCreate} className="space-y-2">
              <input
                autoFocus
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                placeholder="Board name"
                className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsCreating(false);
                    setNewBoardName("");
                  }
                }}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-full bg-[var(--primary-blue)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:brightness-110 disabled:opacity-70"
                >
                  {isSubmitting ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setNewBoardName("");
                    setErrorMessage("");
                  }}
                  className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Board
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
