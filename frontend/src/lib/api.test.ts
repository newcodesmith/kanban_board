import {
  aiChatRequest,
  getBoardRequest,
  loginRequest,
  updateBoardRequest,
  validateTokenRequest,
} from "@/lib/api";
import { initialData } from "@/lib/kanban";

const mockFetch = vi.fn();

describe("api client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends login request payload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "token-1", token_type: "Bearer" }),
    });

    const result = await loginRequest("user", "password");
    expect(result.access_token).toBe("token-1");
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

  it("loads board with bearer token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ board: initialData }),
    });

    const result = await getBoardRequest("token-123");
    expect(result.board.columns).toHaveLength(5);
    expect(mockFetch).toHaveBeenCalledWith("/api/board", {
      headers: {
        Authorization: "Bearer token-123",
      },
    });
  });

  it("sends board update payload", async () => {
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
