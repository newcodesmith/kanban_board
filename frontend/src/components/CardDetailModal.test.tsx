import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardDetailModal, getPriorityStyle, getLabelColor } from "@/components/CardDetailModal";
import type { Card } from "@/lib/kanban";

const baseCard: Card = {
  id: "card-1",
  title: "Test Card",
  details: "Some details",
};

const cardWithMeta: Card = {
  id: "card-2",
  title: "Rich Card",
  details: "Details here",
  priority: "high",
  due_date: "2020-01-01",
  labels: ["frontend", "bug"],
};

describe("CardDetailModal", () => {
  it("renders with card data", () => {
    render(
      <CardDetailModal
        card={baseCard}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Test Card");
    expect(screen.getByLabelText("Details")).toHaveValue("Some details");
  });

  it("pre-fills priority, due date, and labels from card", () => {
    render(
      <CardDetailModal
        card={cardWithMeta}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/priority/i)).toHaveValue("high");
    expect(screen.getByLabelText(/due date/i)).toHaveValue("2020-01-01");
    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.getByText("bug")).toBeInTheDocument();
  });

  it("shows overdue warning for past due dates", () => {
    render(
      <CardDetailModal
        card={cardWithMeta}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });

  it("calls onSave with updated values on submit", async () => {
    const onSave = vi.fn();
    render(
      <CardDetailModal
        card={baseCard}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await userEvent.clear(screen.getByLabelText("Title"));
    await userEvent.type(screen.getByLabelText("Title"), "Updated Title");
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "medium");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "card-1",
        title: "Updated Title",
        priority: "medium",
      })
    );
  });

  it("calls onClose after saving", async () => {
    const onClose = vi.fn();
    render(
      <CardDetailModal
        card={baseCard}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={onClose}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onDelete and onClose when delete is clicked", async () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    render(
      <CardDetailModal
        card={baseCard}
        onSave={vi.fn()}
        onDelete={onDelete}
        onClose={onClose}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <CardDetailModal
        card={baseCard}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={onClose}
      />
    );
    await userEvent.click(screen.getByRole("dialog").previousElementSibling as Element);
    expect(onClose).toHaveBeenCalled();
  });

  it("adds a label via the Add button", async () => {
    render(
      <CardDetailModal
        card={baseCard}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const input = screen.getByPlaceholderText(/add a label/i);
    await userEvent.type(input, "design");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(screen.getByText("design")).toBeInTheDocument();
  });

  it("adds a label via Enter key", async () => {
    render(
      <CardDetailModal
        card={baseCard}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const input = screen.getByPlaceholderText(/add a label/i);
    await userEvent.type(input, "backend{Enter}");
    expect(screen.getByText("backend")).toBeInTheDocument();
  });

  it("removes a label", async () => {
    render(
      <CardDetailModal
        card={cardWithMeta}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    await userEvent.click(screen.getByLabelText("Remove label frontend"));
    expect(screen.queryByText("frontend")).not.toBeInTheDocument();
    expect(screen.getByText("bug")).toBeInTheDocument();
  });

  it("does not add duplicate labels", async () => {
    render(
      <CardDetailModal
        card={cardWithMeta}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const input = screen.getByPlaceholderText(/add a label/i);
    await userEvent.type(input, "bug");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(screen.getAllByText("bug")).toHaveLength(1);
  });
});

describe("getPriorityStyle", () => {
  it("returns null for undefined priority", () => {
    expect(getPriorityStyle(undefined)).toBeNull();
  });

  it("returns a class string for valid priorities", () => {
    expect(getPriorityStyle("low")).toContain("emerald");
    expect(getPriorityStyle("medium")).toContain("amber");
    expect(getPriorityStyle("high")).toContain("red");
  });
});

describe("getLabelColor", () => {
  it("returns a string with color classes", () => {
    expect(getLabelColor(0)).toContain("blue");
    expect(getLabelColor(1)).toContain("purple");
  });

  it("cycles through colors", () => {
    expect(getLabelColor(0)).toBe(getLabelColor(5));
  });
});
