import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthKanbanApp } from "@/components/AuthKanbanApp";
import { initialData } from "@/lib/kanban";

const mockFetch = vi.fn();

const BOARD_META = [{ id: 1, name: "My Board", created_at: "2024-01-01", updated_at: "2024-01-01" }];
const BOARD_WITH_META = { id: 1, name: "My Board", board: initialData };

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

  it("shows registration option on login page", async () => {
    render(<AuthKanbanApp />);
    await screen.findByRole("button", { name: /sign in/i });
    expect(screen.getByText(/create an account/i)).toBeInTheDocument();
  });

  it("switches to registration form", async () => {
    render(<AuthKanbanApp />);
    await userEvent.click(await screen.findByText(/create an account/i));
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it("logs in with valid credentials and shows board", async () => {
    // login
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "token-123", username: "user", role: "admin" }),
    });
    // list boards
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_META,
    });
    // get board by id
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_WITH_META,
    });

    render(<AuthKanbanApp />);

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await screen.findByRole("button", { name: /log out/i });
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
    // validate token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok", username: "user", role: "admin" }),
    });
    // list boards
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_META,
    });
    // get board by id
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_WITH_META,
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
    // validate token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok", username: "user", role: "admin" }),
    });
    // list boards - fail
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "failure" }),
    });
    // retry: list boards
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_META,
    });
    // retry: get board by id
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_WITH_META,
    });

    render(<AuthKanbanApp />);

    await screen.findByText(/unable to load boards/i);
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

    // validate token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok", username: "user", role: "admin" }),
    });
    // list boards
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_META,
    });
    // get board by id
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_WITH_META,
    });
    // ai chat
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        assistant_message: "Done.",
        board_update: updatedBoard,
      }),
    });
    // save board (updateBoardByIdRequest)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, name: "My Board", board: updatedBoard }),
    });

    render(<AuthKanbanApp />);

    await screen.findByRole("button", { name: /log out/i });
    await userEvent.click(screen.getByRole("button", { name: /ai chat/i }));

    await userEvent.type(
      screen.getByPlaceholderText(/ask ai/i),
      "Rename backlog to now"
    );
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await screen.findByText("Done.");

    const firstColumn = screen.getByTestId("column-col-backlog");
    expect(within(firstColumn).getByLabelText("Column title")).toHaveValue("Now");
  });

  it("shows ai chat error detail when chat request fails", async () => {
    window.sessionStorage.setItem("pm_auth_token", "saved-token");

    // validate token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok", username: "user", role: "admin" }),
    });
    // list boards
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_META,
    });
    // get board by id
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_WITH_META,
    });
    // ai chat fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "AI model returned invalid structured output" }),
    });

    render(<AuthKanbanApp />);

    await screen.findByRole("button", { name: /log out/i });
    await userEvent.click(screen.getByRole("button", { name: /ai chat/i }));
    await userEvent.type(screen.getByPlaceholderText(/ask ai/i), "Rename backlog to now");
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await screen.findByText("AI model returned invalid structured output");
  });

  it("registers a new user and auto-logs in", async () => {
    render(<AuthKanbanApp />);

    await userEvent.click(await screen.findByText(/create an account/i));

    await userEvent.type(screen.getByLabelText(/username/i), "newuser");
    await userEvent.type(screen.getByLabelText(/^password$/i), "securepass");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "securepass");

    // register
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ username: "newuser", role: "user" }),
    });
    // auto-login
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "new-token", username: "newuser", role: "user" }),
    });
    // list boards
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_META,
    });
    // get board by id
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_WITH_META,
    });

    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await screen.findByRole("button", { name: /log out/i });
    expect(window.sessionStorage.getItem("pm_auth_token")).toBe("new-token");
  });

  it("shows error when passwords do not match during registration", async () => {
    render(<AuthKanbanApp />);

    await userEvent.click(await screen.findByText(/create an account/i));

    await userEvent.type(screen.getByLabelText(/username/i), "user1");
    await userEvent.type(screen.getByLabelText(/^password$/i), "pass123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "different");

    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await screen.findByText(/passwords do not match/i);
  });
});
