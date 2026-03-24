import type { BoardData } from "@/lib/kanban";

export type AIChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AIChatResponse = {
  assistant_message: string;
  board_update: BoardData | null;
};

export type BoardMeta = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

export type BoardWithMeta = {
  id: number;
  name: string;
  board: BoardData;
};

export type UserInfo = {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

const getJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    let detailMessage = "";
    try {
      const errorPayload = (await response.json()) as { detail?: string };
      if (typeof errorPayload.detail === "string") {
        detailMessage = errorPayload.detail;
      }
    } catch {
      detailMessage = "";
    }

    throw new Error(
      detailMessage || `Request failed with status ${response.status}`
    );
  }
  return (await response.json()) as T;
};

export const loginRequest = async (username: string, password: string) => {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  return getJson<{ access_token: string; token_type: string; username: string; role: string }>(response);
};

export const registerRequest = async (username: string, password: string) => {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  return getJson<{ username: string; role: string }>(response);
};

export const validateTokenRequest = async (token: string) => {
  const response = await fetch("/api/auth/validate", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return getJson<{ status: string; token: string; username: string; role: string }>(response);
};

export const logoutRequest = async (token: string) => {
  await fetch("/api/auth/token", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

// ── Legacy board endpoints (single board) ────────────────────────────────────

export const getBoardRequest = async (token: string) => {
  const response = await fetch("/api/board", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return getJson<{ board: BoardData }>(response);
};

export const updateBoardRequest = async (token: string, board: BoardData) => {
  const response = await fetch("/api/board", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ board }),
  });

  return getJson<{ board: BoardData }>(response);
};

// ── Multi-board endpoints ─────────────────────────────────────────────────────

export const listBoardsRequest = async (token: string) => {
  const response = await fetch("/api/boards", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return getJson<BoardMeta[]>(response);
};

export const createBoardRequest = async (token: string, name: string) => {
  const response = await fetch("/api/boards", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });

  return getJson<BoardWithMeta>(response);
};

export const getBoardByIdRequest = async (token: string, boardId: number) => {
  const response = await fetch(`/api/boards/${boardId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return getJson<BoardWithMeta>(response);
};

export const updateBoardByIdRequest = async (
  token: string,
  boardId: number,
  board: BoardData
) => {
  const response = await fetch(`/api/boards/${boardId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ board }),
  });

  return getJson<BoardWithMeta>(response);
};

export const renameBoardRequest = async (
  token: string,
  boardId: number,
  name: string
) => {
  const response = await fetch(`/api/boards/${boardId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });

  return getJson<BoardMeta>(response);
};

export const deleteBoardRequest = async (token: string, boardId: number) => {
  const response = await fetch(`/api/boards/${boardId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let detailMessage = "";
    try {
      const errorPayload = (await response.json()) as { detail?: string };
      if (typeof errorPayload.detail === "string") {
        detailMessage = errorPayload.detail;
      }
    } catch {
      detailMessage = "";
    }
    throw new Error(detailMessage || `Request failed with status ${response.status}`);
  }
};

// ── User management endpoints ─────────────────────────────────────────────────

export const listUsersRequest = async (token: string) => {
  const response = await fetch("/api/users", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return getJson<UserInfo[]>(response);
};

export const deleteUserRequest = async (token: string, username: string) => {
  const response = await fetch(`/api/users/${username}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let detailMessage = "";
    try {
      const errorPayload = (await response.json()) as { detail?: string };
      if (typeof errorPayload.detail === "string") {
        detailMessage = errorPayload.detail;
      }
    } catch {
      detailMessage = "";
    }
    throw new Error(detailMessage || `Request failed with status ${response.status}`);
  }
};

export const changePasswordRequest = async (
  token: string,
  username: string,
  newPassword: string
) => {
  const response = await fetch(`/api/users/${username}/password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ new_password: newPassword }),
  });

  if (!response.ok) {
    let detailMessage = "";
    try {
      const errorPayload = (await response.json()) as { detail?: string };
      if (typeof errorPayload.detail === "string") {
        detailMessage = errorPayload.detail;
      }
    } catch {
      detailMessage = "";
    }
    throw new Error(detailMessage || `Request failed with status ${response.status}`);
  }
};

// ── AI Chat ───────────────────────────────────────────────────────────────────

export const aiChatRequest = async (
  token: string,
  message: string,
  conversationHistory: AIChatMessage[],
  boardId?: number
) => {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      conversation_history: conversationHistory,
      ...(boardId !== undefined ? { board_id: boardId } : {}),
    }),
  });

  return getJson<AIChatResponse>(response);
};
