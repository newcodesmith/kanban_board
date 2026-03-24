"use client";

import { FormEvent, useState } from "react";
import type { Card, Priority } from "@/lib/kanban";

type Props = {
  card: Card;
  onSave: (updated: Card) => void;
  onDelete: () => void;
  onClose: () => void;
};

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "bg-emerald-100 text-emerald-700" },
  { value: "medium", label: "Medium", color: "bg-amber-100 text-amber-700" },
  { value: "high", label: "High", color: "bg-red-100 text-red-700" },
];

const LABEL_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
];

export const getLabelColor = (index: number) =>
  LABEL_COLORS[index % LABEL_COLORS.length];

export const getPriorityStyle = (priority: Priority | undefined) => {
  if (!priority) return null;
  return PRIORITY_OPTIONS.find((p) => p.value === priority)?.color ?? null;
};

export const CardDetailModal = ({ card, onSave, onDelete, onClose }: Props) => {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [priority, setPriority] = useState<Priority | "">(card.priority ?? "");
  const [dueDate, setDueDate] = useState(card.due_date ?? "");
  const [labelInput, setLabelInput] = useState("");
  const [labels, setLabels] = useState<string[]>(card.labels ?? []);

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      ...card,
      title: title.trim() || card.title,
      details: details.trim(),
      priority: priority || undefined,
      due_date: dueDate || undefined,
      labels,
    });
    onClose();
  };

  const addLabel = () => {
    const trimmed = labelInput.trim();
    if (trimmed && !labels.includes(trimmed)) {
      setLabels((prev) => [...prev, trimmed]);
    }
    setLabelInput("");
  };

  const removeLabel = (label: string) => {
    setLabels((prev) => prev.filter((l) => l !== label));
  };

  const isOverdue =
    dueDate && new Date(dueDate) < new Date(new Date().toDateString());

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-[var(--navy-dark)]/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-modal-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[var(--stroke)] bg-white p-6 shadow-[0_24px_64px_rgba(3,33,71,0.18)]"
      >
        <div className="flex items-start justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
            Card Details
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close card details"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--stroke)] text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]" htmlFor="card-title">
              Title
            </label>
            <input
              id="card-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--stroke)] px-3 py-2 font-display text-base font-semibold text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]" htmlFor="card-details">
              Details
            </label>
            <textarea
              id="card-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]" htmlFor="card-priority">
                Priority
              </label>
              <select
                id="card-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority | "")}
                className="mt-1 w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
              >
                <option value="">None</option>
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]" htmlFor="card-due-date">
                Due Date
              </label>
              <input
                id="card-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)] ${
                  isOverdue
                    ? "border-red-300 text-red-600"
                    : "border-[var(--stroke)] text-[var(--navy-dark)]"
                }`}
              />
              {isOverdue ? (
                <p className="mt-0.5 text-xs font-medium text-red-500">Overdue</p>
              ) : null}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              Labels
            </label>
            <div className="mt-1 flex flex-wrap gap-1.5 mb-2">
              {labels.map((label, i) => (
                <span
                  key={label}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${getLabelColor(i)}`}
                >
                  {label}
                  <button
                    type="button"
                    onClick={() => removeLabel(label)}
                    aria-label={`Remove label ${label}`}
                    className="ml-0.5 opacity-60 hover:opacity-100"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLabel();
                  }
                }}
                placeholder="Add a label..."
                className="flex-1 rounded-xl border border-[var(--stroke)] px-3 py-1.5 text-xs text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
              />
              <button
                type="button"
                onClick={addLabel}
                className="rounded-xl border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
              >
                Add
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 rounded-full bg-[var(--primary-blue)] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:brightness-110"
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="rounded-full border border-red-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-red-500 transition hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
