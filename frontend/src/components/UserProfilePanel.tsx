"use client";

import { FormEvent, useState } from "react";
import type { UserInfo } from "@/lib/api";
import { changePasswordRequest, deleteUserRequest, listUsersRequest } from "@/lib/api";

type ProfileTab = "profile" | "admin";

type Props = {
  token: string;
  username: string;
  role: string;
  onClose: () => void;
};

export const UserProfilePanel = ({ token, username, role, onClose }: Props) => {
  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwError, setPwError] = useState("");
  const [isChangingPw, setIsChangingPw] = useState(false);

  // Admin tab state
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    setAdminError("");
    try {
      const result = await listUsersRequest(token);
      setUsers(result);
      setUsersLoaded(true);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Failed to load users");
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleTabChange = (tab: ProfileTab) => {
    setActiveTab(tab);
    if (tab === "admin" && !usersLoaded) {
      void loadUsers();
    }
  };

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setPwError("Password must be at least 6 characters.");
      return;
    }

    setIsChangingPw(true);
    try {
      await changePasswordRequest(token, username, newPassword);
      setPwSuccess("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPwError(error instanceof Error ? error.message : "Failed to change password");
    } finally {
      setIsChangingPw(false);
    }
  };

  const handleDeleteUser = async (targetUsername: string) => {
    setAdminError("");
    try {
      await deleteUserRequest(token, targetUsername);
      setUsers((prev) => prev.filter((u) => u.username !== targetUsername));
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Failed to delete user");
    }
  };

  const isAdmin = role === "admin";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[var(--navy-dark)]/20"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="User profile"
        className="fixed right-6 top-16 z-50 w-80 rounded-3xl border border-[var(--stroke)] bg-white shadow-[0_24px_64px_rgba(3,33,71,0.18)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--stroke)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--navy-dark)] text-sm font-bold text-white">
              {username[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--navy-dark)]">{username}</p>
              <p className="text-xs text-[var(--gray-text)] capitalize">{role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--stroke)] text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Tabs */}
        {isAdmin ? (
          <div className="flex border-b border-[var(--stroke)]">
            <button
              type="button"
              onClick={() => handleTabChange("profile")}
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] transition ${
                activeTab === "profile"
                  ? "border-b-2 border-[var(--primary-blue)] text-[var(--primary-blue)]"
                  : "text-[var(--gray-text)]"
              }`}
            >
              Profile
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("admin")}
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] transition ${
                activeTab === "admin"
                  ? "border-b-2 border-[var(--primary-blue)] text-[var(--primary-blue)]"
                  : "text-[var(--gray-text)]"
              }`}
            >
              Users
            </button>
          </div>
        ) : null}

        {/* Profile tab */}
        {activeTab === "profile" ? (
          <div className="p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              Change Password
            </p>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                required
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                required
              />
              {pwError ? (
                <p className="text-xs font-medium text-[var(--secondary-purple)]">{pwError}</p>
              ) : null}
              {pwSuccess ? (
                <p className="text-xs font-medium text-emerald-600">{pwSuccess}</p>
              ) : null}
              <button
                type="submit"
                disabled={isChangingPw}
                className="w-full rounded-full bg-[var(--primary-blue)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:brightness-110 disabled:opacity-70"
              >
                {isChangingPw ? "Changing..." : "Change Password"}
              </button>
            </form>
          </div>
        ) : null}

        {/* Admin users tab */}
        {activeTab === "admin" ? (
          <div className="p-4">
            {isLoadingUsers ? (
              <p className="text-center text-sm text-[var(--gray-text)] py-4">Loading users...</p>
            ) : adminError ? (
              <div className="space-y-2">
                <p className="text-xs text-[var(--secondary-purple)]">{adminError}</p>
                <button
                  type="button"
                  onClick={() => void loadUsers()}
                  className="text-xs text-[var(--primary-blue)] hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {users.map((user) => (
                  <div
                    key={user.username}
                    className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-[var(--surface)]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--navy-dark)]">
                        {user.username}
                        {user.username === username ? (
                          <span className="ml-1 text-xs font-normal text-[var(--gray-text)]">(you)</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-[var(--gray-text)] capitalize">{user.role}</p>
                    </div>
                    {user.username !== username ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteUser(user.username)}
                        aria-label={`Delete ${user.username}`}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--gray-text)] transition hover:bg-red-50 hover:text-red-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
};
