"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  aiChatRequest,
  type AIChatMessage,
  getBoardRequest,
  loginRequest,
  logoutRequest,
  updateBoardRequest,
  validateTokenRequest,
} from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

const TOKEN_STORAGE_KEY = "pm_auth_token";

export const AuthKanbanApp = () => {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingBoard, setIsLoadingBoard] = useState(false);
  const [isSavingBoard, setIsSavingBoard] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [boardErrorMessage, setBoardErrorMessage] = useState("");
  const [board, setBoard] = useState<BoardData | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<AIChatMessage[]>([]);
  const [chatErrorMessage, setChatErrorMessage] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const saveQueueRef = useRef(Promise.resolve());
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      const storedToken = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);

      if (!storedToken) {
        setIsCheckingSession(false);
        return;
      }

      try {
        await validateTokenRequest(storedToken);
        setAuthToken(storedToken);
        setIsAuthenticated(true);
      } catch {
        window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      } finally {
        setIsCheckingSession(false);
      }
    };

    void checkSession();
  }, []);

  const loadBoard = async (token: string) => {
    setIsLoadingBoard(true);
    setBoardErrorMessage("");

    try {
      const payload = await getBoardRequest(token);
      setBoard(payload.board);
    } catch {
      setBoardErrorMessage("Unable to load board.");
    } finally {
      setIsLoadingBoard(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !authToken) {
      return;
    }

    void loadBoard(authToken);
  }, [isAuthenticated, authToken]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const payload = await loginRequest(username, password);
      if (!payload.access_token) {
        setErrorMessage("Invalid username or password.");
        setIsSubmitting(false);
        return;
      }

      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, payload.access_token);
      setAuthToken(payload.access_token);
      setIsAuthenticated(true);
      setPassword("");
      setBoardErrorMessage("");
    } catch {
      setErrorMessage("Invalid username or password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    if (authToken) {
      void logoutRequest(authToken);
    }
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setIsAuthenticated(false);
    setAuthToken(null);
    setBoard(null);
    setChatInput("");
    setChatMessages([]);
    setChatErrorMessage("");
    setIsChatOpen(false);
    setBoardErrorMessage("");
    setUsername("");
    setPassword("");
    setErrorMessage("");
  };

  const enqueueBoardSave = (nextBoard: BoardData) => {
    if (!authToken) {
      return;
    }

    saveQueueRef.current = saveQueueRef.current
      .then(async () => {
        if (!isMountedRef.current) return;
        setIsSavingBoard(true);
        await updateBoardRequest(authToken, nextBoard);
      })
      .catch(() => {
        if (isMountedRef.current) setBoardErrorMessage("Unable to save board changes.");
      })
      .finally(() => {
        if (isMountedRef.current) setIsSavingBoard(false);
      });
  };

  const handleBoardChange = (nextBoard: BoardData) => {
    if (!authToken) {
      return;
    }

    setBoard(nextBoard);
    setBoardErrorMessage("");
    enqueueBoardSave(nextBoard);
  };

  const handleChatSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authToken) {
      return;
    }

    const message = chatInput.trim();
    if (!message) {
      return;
    }

    const history = [...chatMessages];
    const userMessage: AIChatMessage = {
      role: "user",
      content: message,
    };

    setChatMessages((current) => [...current, userMessage]);
    setChatInput("");
    setChatErrorMessage("");
    setIsSendingChat(true);

    try {
      const response = await aiChatRequest(authToken, message, history);
      const assistantMessage: AIChatMessage = {
        role: "assistant",
        content: response.assistant_message,
      };
      setChatMessages((current) => [...current, assistantMessage]);

      if (response.board_update) {
        setBoard(response.board_update);
        setBoardErrorMessage("");
        enqueueBoardSave(response.board_update);
      }
    } catch (error) {
      if (error instanceof Error && error.message) {
        setChatErrorMessage(error.message);
      } else {
        setChatErrorMessage("Unable to send message.");
      }
    } finally {
      setIsSendingChat(false);
    }
  };

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <p className="text-sm font-semibold text-[var(--gray-text)]">Checking session...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <section className="w-full max-w-md rounded-3xl border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
            Sign in
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Kanban Studio
          </h1>
          <p className="mt-2 text-sm text-[var(--gray-text)]">
            Use the MVP credentials to access your board.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                placeholder="user"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                placeholder="password"
                autoComplete="current-password"
                required
              />
            </div>

            {errorMessage ? (
              <p className="text-sm font-medium text-[var(--secondary-purple)]">{errorMessage}</p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white transition hover:brightness-110 disabled:opacity-70"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (isAuthenticated && (isLoadingBoard || !board)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <div className="rounded-2xl border border-[var(--stroke)] bg-white px-6 py-4 shadow-[var(--shadow)]">
          <p className="text-sm font-semibold text-[var(--gray-text)]">Loading board...</p>
          {boardErrorMessage ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm font-medium text-[var(--secondary-purple)]">{boardErrorMessage}</p>
              <button
                type="button"
                onClick={() => {
                  if (authToken) {
                    void loadBoard(authToken);
                  }
                }}
                className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-0 top-0 z-20 h-24 w-full bg-gradient-to-b from-[var(--surface)] to-transparent" />
      {isSavingBoard ? (
        <div className="absolute left-6 top-6 z-30 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-text)] shadow-[var(--shadow)]">
          Saving...
        </div>
      ) : null}
      {boardErrorMessage ? (
        <div className="absolute left-6 top-16 z-30 rounded-xl border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold text-[var(--secondary-purple)] shadow-[var(--shadow)]">
          {boardErrorMessage}
        </div>
      ) : null}
      <div className="absolute right-6 top-6 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsChatOpen((current) => !current)}
          className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--navy-dark)] shadow-[var(--shadow)] transition hover:border-[var(--primary-blue)]"
        >
          {isChatOpen ? "Close AI Chat" : "AI Chat"}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--navy-dark)] shadow-[var(--shadow)] transition hover:border-[var(--primary-blue)]"
        >
          Log out
        </button>
      </div>
      <div className="pt-20">
        <div className="min-w-0">
          {board ? <KanbanBoard initialBoard={board} onBoardChange={handleBoardChange} /> : null}
        </div>
      </div>
      {isChatOpen ? (
        <button
          type="button"
          aria-label="Close chat panel"
          onClick={() => setIsChatOpen(false)}
          className="fixed inset-0 z-40 bg-[var(--navy-dark)]/30"
        />
      ) : null}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-screen w-full max-w-[380px] flex-col border-l border-[var(--stroke)] bg-white p-4 shadow-[var(--shadow)] transition-transform duration-200 ${
          isChatOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              AI Chat
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold text-[var(--navy-dark)]">
              Board Assistant
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsChatOpen(false)}
            className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3">
          {chatMessages.length === 0 ? (
            <p className="text-sm text-[var(--gray-text)]">Ask for planning help or board updates.</p>
          ) : null}
          {chatMessages.map((chatMessage, index) => (
            <div
              key={`${chatMessage.role}-${index}`}
              className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-2"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gray-text)]">
                {chatMessage.role}
              </p>
              <p className="mt-1 text-sm text-[var(--navy-dark)]">{chatMessage.content}</p>
            </div>
          ))}
        </div>

        <form className="mt-3 space-y-2" onSubmit={handleChatSubmit}>
          <label htmlFor="ai-chat-input" className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gray-text)]">
            Message
          </label>
          <textarea
            id="ai-chat-input"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="Ask AI to update cards or give guidance"
            className="h-24 w-full resize-none rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
          />
          {chatErrorMessage ? (
            <p className="text-xs font-semibold text-[var(--secondary-purple)]">{chatErrorMessage}</p>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:brightness-110 disabled:opacity-70"
            disabled={isSendingChat}
          >
            {isSendingChat ? "Sending..." : "Send"}
          </button>
        </form>
      </aside>
    </div>
  );
};
