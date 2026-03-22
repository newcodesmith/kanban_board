import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthKanbanApp } from "@/components/AuthKanbanApp";
import { initialData } from "@/lib/kanban";

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
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ board: initialData }),
    });

    render(<AuthKanbanApp />);

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await screen.findByRole("button", { name: /log out/i });
    expect(await screen.findAllByRole("heading", { name: "Kanban Studio" })).not.toHaveLength(0);
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
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ board: initialData }),
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

  it("shows board load error and retry action", async () => {
    window.sessionStorage.setItem("pm_auth_token", "saved-token");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "failure" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ board: initialData }),
    });

    render(<AuthKanbanApp />);

    await screen.findByText(/unable to load board/i);
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    await screen.findByRole("button", { name: /log out/i });
  });

  it("sends chat message and applies ai board update", async () => {
    window.sessionStorage.setItem("pm_auth_token", "saved-token");
    const updatedBoard = {
      ...initialData,
      columns: initialData.columns.map((column, index) =>
        index === 0 ? { ...column, title: "Now" } : column
      ),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ board: initialData }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        assistant_message: "Done.",
        board_update: updatedBoard,
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ board: updatedBoard }),
    });

    render(<AuthKanbanApp />);

    await screen.findByRole("button", { name: /log out/i });
    await userEvent.type(
      screen.getByLabelText(/message/i),
      "Rename backlog to now"
    );
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await screen.findByText("Done.");

    const firstColumn = screen.getByTestId("column-col-backlog");
    expect(within(firstColumn).getByLabelText("Column title")).toHaveValue("Now");

    expect(mockFetch).toHaveBeenCalledWith("/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer saved-token",
      },
      body: JSON.stringify({
        message: "Rename backlog to now",
        conversation_history: [],
      }),
    });
  });

  it("shows ai chat error detail when chat request fails", async () => {
    window.sessionStorage.setItem("pm_auth_token", "saved-token");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ board: initialData }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "AI model returned invalid structured output" }),
    });

    render(<AuthKanbanApp />);

    await screen.findByRole("button", { name: /log out/i });
    await userEvent.type(screen.getByLabelText(/message/i), "Rename backlog to now");
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await screen.findByText("AI model returned invalid structured output");
  });
});
