"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { BoardSidebar } from "@/components/BoardSidebar";
import {
  aiChatRequest,
  type AIChatMessage,
  type BoardMeta,
  createBoardRequest,
  deleteBoardRequest,
  getBoardByIdRequest,
  listBoardsRequest,
  loginRequest,
  logoutRequest,
  registerRequest,
  renameBoardRequest,
  updateBoardByIdRequest,
  validateTokenRequest,
} from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

const TOKEN_STORAGE_KEY = "pm_auth_token";
const USERNAME_STORAGE_KEY = "pm_username";

export const AuthKanbanApp = () => {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingBoard, setIsLoadingBoard] = useState(false);
  const [isSavingBoard, setIsSavingBoard] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [boardErrorMessage, setBoardErrorMessage] = useState("");
  const [board, setBoard] = useState<BoardData | null>(null);
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<AIChatMessage[]>([]);
  const [chatErrorMessage, setChatErrorMessage] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isBoardSidebarOpen, setIsBoardSidebarOpen] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
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
        const result = await validateTokenRequest(storedToken);
        setAuthToken(storedToken);
        setCurrentUsername(result.username);
        setCurrentRole(result.role);
        setIsAuthenticated(true);
      } catch {
        window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        window.sessionStorage.removeItem(USERNAME_STORAGE_KEY);
      } finally {
        setIsCheckingSession(false);
      }
    };

    void checkSession();
  }, []);

  const loadBoards = async (token: string) => {
    setIsLoadingBoard(true);
    setBoardErrorMessage("");

    try {
      const boardList = await listBoardsRequest(token);
      setBoards(boardList);

      // Load the first board by default
      if (boardList.length > 0) {
        const firstBoard = await getBoardByIdRequest(token, boardList[0].id);
        setBoard(firstBoard.board);
        setActiveBoardId(firstBoard.id);
      }
    } catch {
      setBoardErrorMessage("Unable to load boards.");
    } finally {
      setIsLoadingBoard(false);
    }
  };

  const switchToBoard = async (boardId: number) => {
    if (!authToken) return;
    setIsLoadingBoard(true);
    setBoardErrorMessage("");
    try {
      const result = await getBoardByIdRequest(authToken, boardId);
      setBoard(result.board);
      setActiveBoardId(boardId);
      setChatMessages([]);
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

    void loadBoards(authToken);
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
      setCurrentUsername(payload.username);
      setCurrentRole(payload.role);
      setIsAuthenticated(true);
      setPassword("");
      setBoardErrorMessage("");
    } catch {
      setErrorMessage("Invalid username or password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await registerRequest(username, password);
      // Auto-login after registration
      const loginPayload = await loginRequest(username, password);
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, loginPayload.access_token);
      setAuthToken(loginPayload.access_token);
      setCurrentUsername(loginPayload.username);
      setCurrentRole(loginPayload.role);
      setIsAuthenticated(true);
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    if (authToken) {
      void logoutRequest(authToken);
    }
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    window.sessionStorage.removeItem(USERNAME_STORAGE_KEY);
    setIsAuthenticated(false);
    setAuthToken(null);
    setBoard(null);
    setBoards([]);
    setActiveBoardId(null);
    setChatInput("");
    setChatMessages([]);
    setChatErrorMessage("");
    setIsChatOpen(false);
    setIsBoardSidebarOpen(false);
    setBoardErrorMessage("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setErrorMessage("");
    setCurrentUsername("");
    setCurrentRole("");
  };

  const enqueueBoardSave = (nextBoard: BoardData, boardId: number) => {
    if (!authToken) {
      return;
    }

    saveQueueRef.current = saveQueueRef.current
      .then(async () => {
        if (!isMountedRef.current) return;
        setIsSavingBoard(true);
        await updateBoardByIdRequest(authToken, boardId, nextBoard);
      })
      .catch(() => {
        if (isMountedRef.current) setBoardErrorMessage("Unable to save board changes.");
      })
      .finally(() => {
        if (isMountedRef.current) setIsSavingBoard(false);
      });
  };

  const handleBoardChange = (nextBoard: BoardData) => {
    if (!authToken || activeBoardId === null) {
      return;
    }

    setBoard(nextBoard);
    setBoardErrorMessage("");
    enqueueBoardSave(nextBoard, activeBoardId);
  };

  const handleCreateBoard = async (name: string) => {
    if (!authToken) return;
    const result = await createBoardRequest(authToken, name);
    const newMeta: BoardMeta = {
      id: result.id,
      name: result.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setBoards((current) => [...current, newMeta]);
    setBoard(result.board);
    setActiveBoardId(result.id);
    setChatMessages([]);
  };

  const handleRenameBoard = async (boardId: number, name: string) => {
    if (!authToken) return;
    await renameBoardRequest(authToken, boardId, name);
    setBoards((current) =>
      current.map((b) => (b.id === boardId ? { ...b, name } : b))
    );
  };

  const handleDeleteBoard = async (boardId: number) => {
    if (!authToken) return;
    await deleteBoardRequest(authToken, boardId);
    const remaining = boards.filter((b) => b.id !== boardId);
    setBoards(remaining);

    if (activeBoardId === boardId && remaining.length > 0) {
      await switchToBoard(remaining[0].id);
    }
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
      const response = await aiChatRequest(
        authToken,
        message,
        history,
        activeBoardId ?? undefined
      );
      const assistantMessage: AIChatMessage = {
        role: "assistant",
        content: response.assistant_message,
      };
      setChatMessages((current) => [...current, assistantMessage]);

      if (response.board_update && activeBoardId !== null) {
        setBoard(response.board_update);
        setBoardErrorMessage("");
        enqueueBoardSave(response.board_update, activeBoardId);
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
            {isRegistering ? "Create account" : "Sign in"}
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Kanban Studio
          </h1>
          <p className="mt-2 text-sm text-[var(--gray-text)]">
            {isRegistering
              ? "Create your account to get started."
              : "Sign in to access your boards."}
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={isRegistering ? handleRegister : handleLogin}
          >
            <div className="space-y-1">
              <label
                className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
                htmlFor="username"
              >
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                placeholder={isRegistering ? "Choose a username" : "user"}
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-1">
              <label
                className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
                htmlFor="password"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                placeholder={isRegistering ? "At least 6 characters" : "password"}
                autoComplete={isRegistering ? "new-password" : "current-password"}
                required
              />
            </div>

            {isRegistering ? (
              <div className="space-y-1">
                <label
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
                  htmlFor="confirm-password"
                >
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  required
                />
              </div>
            ) : null}

            {errorMessage ? (
              <p className="text-sm font-medium text-[var(--secondary-purple)]">{errorMessage}</p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white transition hover:brightness-110 disabled:opacity-70"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? isRegistering
                  ? "Creating account..."
                  : "Signing in..."
                : isRegistering
                ? "Create Account"
                : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-[var(--gray-text)]">
            {isRegistering ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegistering(false);
                    setErrorMessage("");
                    setPassword("");
                    setConfirmPassword("");
                  }}
                  className="font-semibold text-[var(--primary-blue)] hover:underline"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegistering(true);
                    setErrorMessage("");
                    setPassword("");
                  }}
                  className="font-semibold text-[var(--primary-blue)] hover:underline"
                >
                  Create an account
                </button>
              </>
            )}
          </p>
        </section>
      </main>
    );
  }

  if (isAuthenticated && (isLoadingBoard || !board)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <div className="rounded-2xl border border-[var(--stroke)] bg-white px-6 py-4 shadow-[var(--shadow)]">
          <p className="text-sm font-semibold text-[var(--gray-text)]">Loading boards...</p>
          {boardErrorMessage ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm font-medium text-[var(--secondary-purple)]">{boardErrorMessage}</p>
              <button
                type="button"
                onClick={() => {
                  if (authToken) {
                    void loadBoards(authToken);
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

  const activeBoard = boards.find((b) => b.id === activeBoardId);

  return (
    <div className="relative">
      <BoardSidebar
        boards={boards}
        activeBoardId={activeBoardId}
        onSelectBoard={(id) => void switchToBoard(id)}
        onCreateBoard={handleCreateBoard}
        onRenameBoard={handleRenameBoard}
        onDeleteBoard={handleDeleteBoard}
        isOpen={isBoardSidebarOpen}
        onClose={() => setIsBoardSidebarOpen(false)}
      />

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

      <div className="absolute left-6 top-6 z-30">
        <button
          type="button"
          onClick={() => setIsBoardSidebarOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--navy-dark)] shadow-[var(--shadow)] transition hover:border-[var(--primary-blue)]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          {activeBoard ? activeBoard.name : "Boards"}
        </button>
      </div>

      <div className="absolute right-6 top-6 z-30 flex items-center gap-2">
        {currentUsername ? (
          <span className="hidden sm:block text-xs font-semibold text-[var(--gray-text)]">
            {currentUsername}
            {currentRole === "admin" ? " (admin)" : ""}
          </span>
        ) : null}
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
            <h2 className="font-display text-sm font-semibold text-[var(--navy-dark)]">
              Board Assistant
              {activeBoard ? ` — ${activeBoard.name}` : ""}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsChatOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--stroke)] text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
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
