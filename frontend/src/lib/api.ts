import type { BoardData } from "@/lib/kanban";

export type AIChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AIChatResponse = {
  assistant_message: string;
  board_update: BoardData | null;
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

  return getJson<{ access_token: string; token_type: string }>(response);
};

export const validateTokenRequest = async (token: string) => {
  const response = await fetch("/api/auth/validate", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return getJson<{ status: string; token: string; username: string }>(response);
};

export const logoutRequest = async (token: string) => {
  await fetch("/api/auth/token", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

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

export const aiChatRequest = async (
  token: string,
  message: string,
  conversationHistory: AIChatMessage[]
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
    }),
  });

  return getJson<AIChatResponse>(response);
};
