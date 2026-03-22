import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthKanbanApp } from "@/components/AuthKanbanApp";

const mockFetch = vi.fn();

describe("AuthKanbanApp", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows login form when no session token exists", async () => {
    render(<AuthKanbanApp />);
    await screen.findByRole("button", { name: /sign in/i });
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  it("logs in with valid credentials and shows board", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "token-123" }),
    });

    render(<AuthKanbanApp />);

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await screen.findByRole("button", { name: /log out/i });
    expect(screen.getByRole("heading", { name: "Kanban Studio" })).toBeInTheDocument();
    expect(window.sessionStorage.getItem("pm_auth_token")).toBe("token-123");
  });

  it("shows an error on invalid credentials", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "Invalid credentials" }),
    });

    render(<AuthKanbanApp />);

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await screen.findByText(/invalid username or password/i);
    expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument();
  });

  it("accepts a valid stored token", async () => {
    window.sessionStorage.setItem("pm_auth_token", "saved-token");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    render(<AuthKanbanApp />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/auth/validate", {
        headers: {
          Authorization: "Bearer saved-token",
        },
      });
    });

    await screen.findByRole("button", { name: /log out/i });
  });
});
