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
          className="flex items-center gap-1.5 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--navy-dark)] shadow-[var(--shadow)] transition hover:border-[var(--primary-blue)]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          {isChatOpen ? "Close AI Chat" : "AI Chat"}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--navy-dark)] shadow-[var(--shadow)] transition hover:border-[var(--primary-blue)]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
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
          className="fixed inset-0 z-40 bg-[var(--navy-dark)]/20"
        />
      ) : null}

      <aside
        className={`fixed right-0 top-0 z-50 flex h-screen w-full max-w-[360px] flex-col border-l border-[var(--stroke)] bg-white shadow-[var(--shadow)] transition-transform duration-200 ${
          isChatOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-12 items-center justify-between border-b border-[var(--stroke)] px-4">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--secondary-purple)]" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <h2 className="font-display text-sm font-semibold text-[var(--navy-dark)]">Board Assistant</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsChatOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--stroke)] text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
            aria-label="Close chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {chatMessages.length === 0 ? (
            <p className="p-2 text-sm text-[var(--gray-text)]">Ask for planning help or board updates.</p>
          ) : null}
          {chatMessages.map((chatMessage, index) => (
            <div
              key={`${chatMessage.role}-${index}`}
              className={`rounded-xl px-3 py-2 text-sm ${
                chatMessage.role === "user"
                  ? "ml-6 bg-[var(--navy-dark)] text-white"
                  : "mr-6 border border-[var(--stroke)] bg-[var(--surface)] text-[var(--navy-dark)]"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60 mb-0.5">
                {chatMessage.role === "user" ? "You" : "Assistant"}
              </p>
              <p>{chatMessage.content}</p>
            </div>
          ))}
        </div>

        <form className="border-t border-[var(--stroke)] p-3 space-y-2" onSubmit={handleChatSubmit}>
          <textarea
            id="ai-chat-input"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask AI to update cards or give guidance…"
            className="h-20 w-full resize-none rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
          />
          {chatErrorMessage ? (
            <p className="text-xs font-semibold text-[var(--secondary-purple)]">{chatErrorMessage}</p>
          ) : null}
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:brightness-110 disabled:opacity-70"
            disabled={isSendingChat}
          >
            {isSendingChat ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                Sending
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Send
              </>
            )}
          </button>
        </form>
      </aside>
    </div>
  );
};
