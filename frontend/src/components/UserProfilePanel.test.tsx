import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserProfilePanel } from "@/components/UserProfilePanel";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UserProfilePanel", () => {
  it("renders username and role in header", () => {
    render(
      <UserProfilePanel
        token="tok"
        username="alice"
        role="member"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("member")).toBeInTheDocument();
  });

  it("shows profile tab with change password form", () => {
    render(
      <UserProfilePanel
        token="tok"
        username="alice"
        role="member"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText("New password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Confirm new password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /change password/i })).toBeInTheDocument();
  });

  it("shows no admin tab for non-admin users", () => {
    render(
      <UserProfilePanel
        token="tok"
        username="alice"
        role="member"
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /users/i })).not.toBeInTheDocument();
  });

  it("shows admin Users tab for admin users", () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { username: "alice", role: "admin" },
        { username: "bob", role: "member" },
      ],
    });
    render(
      <UserProfilePanel
        token="tok"
        username="alice"
        role="admin"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /users/i })).toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <UserProfilePanel
        token="tok"
        username="alice"
        role="member"
        onClose={onClose}
      />
    );
    // The backdrop is the first child (div with fixed inset-0)
    const backdrop = document.querySelector("[aria-hidden='true']") as Element;
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when X button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <UserProfilePanel
        token="tok"
        username="alice"
        role="member"
        onClose={onClose}
      />
    );
    await userEvent.click(screen.getByLabelText("Close profile"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error when passwords do not match", async () => {
    render(
      <UserProfilePanel
        token="tok"
        username="alice"
        role="member"
        onClose={vi.fn()}
      />
    );
    await userEvent.type(screen.getByPlaceholderText("New password"), "newpass1");
    await userEvent.type(screen.getByPlaceholderText("Confirm new password"), "newpass2");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
  });

  it("shows error when password is too short", async () => {
    render(
      <UserProfilePanel
        token="tok"
        username="alice"
        role="member"
        onClose={vi.fn()}
      />
    );
    await userEvent.type(screen.getByPlaceholderText("New password"), "abc");
    await userEvent.type(screen.getByPlaceholderText("Confirm new password"), "abc");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));
    expect(screen.getByText(/at least 6 characters/i)).toBeInTheDocument();
  });

  it("shows success message after successful password change", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "Password changed" }),
    });
    render(
      <UserProfilePanel
        token="tok"
        username="alice"
        role="member"
        onClose={vi.fn()}
      />
    );
    await userEvent.type(screen.getByPlaceholderText("New password"), "newpass123");
    await userEvent.type(screen.getByPlaceholderText("Confirm new password"), "newpass123");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));
    expect(await screen.findByText(/password changed successfully/i)).toBeInTheDocument();
  });

  it("loads and shows users list in admin tab", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { username: "alice", role: "admin" },
        { username: "bob", role: "member" },
      ],
    });
    render(
      <UserProfilePanel
        token="tok"
        username="alice"
        role="admin"
        onClose={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /users/i }));
    expect(await screen.findByText("bob")).toBeInTheDocument();
    // "(you)" indicator for current user
    expect(screen.getByText("(you)")).toBeInTheDocument();
  });

  it("can delete another user from admin tab", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { username: "alice", role: "admin" },
          { username: "bob", role: "member" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Deleted" }),
      });

    render(
      <UserProfilePanel
        token="tok"
        username="alice"
        role="admin"
        onClose={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /users/i }));
    await screen.findByText("bob");
    await userEvent.click(screen.getByLabelText("Delete bob"));
    expect(screen.queryByText("bob")).not.toBeInTheDocument();
  });

  it("shows retry button on users load failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "Forbidden" }),
    });
    render(
      <UserProfilePanel
        token="tok"
        username="alice"
        role="admin"
        onClose={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /users/i }));
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
