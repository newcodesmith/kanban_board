import {
  aiChatRequest,
  createBoardRequest,
  getBoardByIdRequest,
  getBoardRequest,
  listBoardsRequest,
  loginRequest,
  registerRequest,
  renameBoardRequest,
  updateBoardByIdRequest,
  updateBoardRequest,
  validateTokenRequest,
} from "@/lib/api";
import { initialData } from "@/lib/kanban";

const mockFetch = vi.fn();

const BOARD_META = [{ id: 1, name: "My Board", created_at: "2024-01-01", updated_at: "2024-01-01" }];
const BOARD_WITH_META = { id: 1, name: "My Board", board: initialData };

describe("api client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("sends login request payload with username and role in response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "token-1", token_type: "Bearer", username: "user", role: "admin" }),
    });

    const result = await loginRequest("user", "password");
    expect(result.access_token).toBe("token-1");
    expect(result.username).toBe("user");
    expect(result.role).toBe("admin");
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "user", password: "password" }),
    });
  });

  it("throws for invalid token validation", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "Invalid or expired token" }),
    });

    await expect(validateTokenRequest("bad-token")).rejects.toThrow("Invalid or expired token");
  });

  it("validate token returns username and role", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok", token: "t", username: "alice", role: "user" }),
    });

    const result = await validateTokenRequest("t");
    expect(result.username).toBe("alice");
    expect(result.role).toBe("user");
  });

  it("sends registration request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ username: "newuser", role: "user" }),
    });

    const result = await registerRequest("newuser", "securepass");
    expect(result.username).toBe("newuser");
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "newuser", password: "securepass" }),
    });
  });

  it("throws error on registration failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "Username already taken" }),
    });

    await expect(registerRequest("taken", "pass123")).rejects.toThrow("Username already taken");
  });

  // ── Legacy board endpoints ────────────────────────────────────────────────

  it("loads board with bearer token (legacy endpoint)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ board: initialData }),
    });

    const result = await getBoardRequest("token-123");
    expect(result.board.columns).toHaveLength(5);
    expect(mockFetch).toHaveBeenCalledWith("/api/board", {
      headers: { Authorization: "Bearer token-123" },
    });
  });

  it("sends board update payload (legacy endpoint)", async () => {
    const updatedBoard = {
      ...initialData,
      columns: initialData.columns.map((column, index) =>
        index === 0 ? { ...column, title: "Updated" } : column
      ),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ board: updatedBoard }),
    });

    const result = await updateBoardRequest("token-xyz", updatedBoard);
    expect(result.board.columns[0].title).toBe("Updated");
    expect(mockFetch).toHaveBeenCalledWith("/api/board", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-xyz",
      },
      body: JSON.stringify({ board: updatedBoard }),
    });
  });

  // ── Multi-board endpoints ─────────────────────────────────────────────────

  it("lists boards for user", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_META,
    });

    const result = await listBoardsRequest("token-123");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("My Board");
    expect(mockFetch).toHaveBeenCalledWith("/api/boards", {
      headers: { Authorization: "Bearer token-123" },
    });
  });

  it("creates a new board", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_WITH_META,
    });

    const result = await createBoardRequest("token-123", "Q2 Roadmap");
    expect(result.id).toBe(1);
    expect(result.name).toBe("My Board");
    expect(mockFetch).toHaveBeenCalledWith("/api/boards", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-123",
      },
      body: JSON.stringify({ name: "Q2 Roadmap" }),
    });
  });

  it("gets board by id", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => BOARD_WITH_META,
    });

    const result = await getBoardByIdRequest("token-123", 1);
    expect(result.id).toBe(1);
    expect(result.board.columns).toHaveLength(5);
    expect(mockFetch).toHaveBeenCalledWith("/api/boards/1", {
      headers: { Authorization: "Bearer token-123" },
    });
  });

  it("updates board by id", async () => {
    const updated = { ...initialData };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, name: "My Board", board: updated }),
    });

    const result = await updateBoardByIdRequest("token-123", 1, updated);
    expect(result.id).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith("/api/boards/1", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-123",
      },
      body: JSON.stringify({ board: updated }),
    });
  });

  it("renames board", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, name: "New Name", created_at: "", updated_at: "" }),
    });

    const result = await renameBoardRequest("token-123", 1, "New Name");
    expect(result.name).toBe("New Name");
    expect(mockFetch).toHaveBeenCalledWith("/api/boards/1", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-123",
      },
      body: JSON.stringify({ name: "New Name" }),
    });
  });

  // ── AI chat ───────────────────────────────────────────────────────────────

  it("sends ai chat payload and returns response", async () => {
    const updatedBoard = {
      ...initialData,
      columns: initialData.columns.map((column, index) =>
        index === 0 ? { ...column, title: "Now" } : column
      ),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        assistant_message: "Updated the board.",
        board_update: updatedBoard,
      }),
    });

    const result = await aiChatRequest("token-xyz", "Rename backlog", [
      { role: "user", content: "What is next?" },
      { role: "assistant", content: "Focus on backlog." },
    ]);

    expect(result.assistant_message).toBe("Updated the board.");
    expect(result.board_update?.columns[0].title).toBe("Now");
    expect(mockFetch).toHaveBeenCalledWith("/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-xyz",
      },
      body: JSON.stringify({
        message: "Rename backlog",
        conversation_history: [
          { role: "user", content: "What is next?" },
          { role: "assistant", content: "Focus on backlog." },
        ],
      }),
    });
  });

  it("sends board_id when provided to ai chat", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ assistant_message: "ok", board_update: null }),
    });

    await aiChatRequest("token-xyz", "hello", [], 42);

    expect(mockFetch).toHaveBeenCalledWith("/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-xyz",
      },
      body: JSON.stringify({
        message: "hello",
        conversation_history: [],
        board_id: 42,
      }),
    });
  });

  it("surfaces ai chat error detail from backend", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "AI model returned invalid structured output" }),
    });

    await expect(aiChatRequest("token-xyz", "Rename backlog", [])).rejects.toThrow(
      "AI model returned invalid structured output"
    );
  });
});
