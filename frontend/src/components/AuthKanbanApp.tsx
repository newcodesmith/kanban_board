"use client";

import { FormEvent, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";

const TOKEN_STORAGE_KEY = "pm_auth_token";

const validateToken = async (token: string) => {
  const response = await fetch("/api/auth/validate", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.ok;
};

export const AuthKanbanApp = () => {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const checkSession = async () => {
      const storedToken = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);

      if (!storedToken) {
        setIsCheckingSession(false);
        return;
      }

      try {
        const isTokenValid = await validateToken(storedToken);
        if (isTokenValid) {
          setIsAuthenticated(true);
        } else {
          window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        }
      } catch {
        window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      } finally {
        setIsCheckingSession(false);
      }
    };

    void checkSession();
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setErrorMessage("Invalid username or password.");
        setIsSubmitting(false);
        return;
      }

      const payload = (await response.json()) as { access_token: string };
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, payload.access_token);
      setIsAuthenticated(true);
      setPassword("");
    } catch {
      setErrorMessage("Unable to sign in right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setIsAuthenticated(false);
    setUsername("");
    setPassword("");
    setErrorMessage("");
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

  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-0 top-0 z-20 h-24 w-full bg-gradient-to-b from-[var(--surface)] to-transparent" />
      <button
        type="button"
        onClick={handleLogout}
        className="absolute right-6 top-6 z-30 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--navy-dark)] shadow-[var(--shadow)] transition hover:border-[var(--primary-blue)]"
      >
        Log out
      </button>
      <KanbanBoard />
    </div>
  );
};
