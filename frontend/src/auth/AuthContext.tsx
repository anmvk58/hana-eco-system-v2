import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { ApiError, api } from "../api/client";
import type { User } from "../types";

interface AuthValue {
  currentUser: User | null;
  loading: boolean;
  error: string;
  hasPermission: (code: string) => boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refreshVersion = useRef(0);

  function clearSession() {
    localStorage.removeItem("hana-access-token");
    setCurrentUser(null);
    setLoading(false);
    setError("");
  }

  async function refresh(background = false) {
    const version = ++refreshVersion.current;
    const token = localStorage.getItem("hana-access-token");
    if (!token) { setCurrentUser(null); setLoading(false); return; }
    if (!background) { setLoading(true); setError(""); }
    try {
      const user = await api.auth.me();
      if (refreshVersion.current === version && localStorage.getItem("hana-access-token") === token) {
        setCurrentUser(user);
        setError("");
      }
    }
    catch (err) {
      if (refreshVersion.current === version && localStorage.getItem("hana-access-token") === token) {
        if (err instanceof ApiError && err.status === 401) clearSession();
        else if (!background) setError(err instanceof Error ? err.message : "Không tải được quyền truy cập");
      }
    }
    finally { if (!background) setLoading(false); }
  }

  async function login(username: string, password: string) {
    setError("");
    try {
      const result = await api.auth.login(username, password);
      localStorage.setItem("hana-access-token", result.access_token);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduceMotion) {
        document.documentElement.classList.add("auth-login-success");
        await new Promise((resolve) => window.setTimeout(resolve, 360));
      }
      setCurrentUser(result.user);
      window.setTimeout(() => document.documentElement.classList.remove("auth-login-success"), 0);
    } catch (err) {
      document.documentElement.classList.remove("auth-login-success");
      const message = err instanceof Error ? err.message : "Đăng nhập không thành công";
      setError(message); throw err;
    }
  }

  async function logout() {
    const revokeSession = api.auth.logout();
    clearSession();
    window.history.replaceState(null, "", "/");
    try { await revokeSession; } catch { /* Phiên hết hạn vẫn được xóa ở trình duyệt. */ }
  }

  useEffect(() => {
    void refresh();
    const expired = () => clearSession();
    const syncPermissions = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    const syncSession = (event: StorageEvent) => {
      if (event.key === "hana-access-token") void refresh();
    };
    window.addEventListener("hana-auth-expired", expired);
    window.addEventListener("focus", syncPermissions);
    document.addEventListener("visibilitychange", syncPermissions);
    window.addEventListener("storage", syncSession);
    const timer = window.setInterval(syncPermissions, 60_000);
    return () => {
      window.removeEventListener("hana-auth-expired", expired);
      window.removeEventListener("focus", syncPermissions);
      document.removeEventListener("visibilitychange", syncPermissions);
      window.removeEventListener("storage", syncSession);
      window.clearInterval(timer);
    };
  }, []);

  const hasPermission = (code: string) => currentUser?.permissions.includes(code) ?? false;
  return <AuthContext.Provider value={{ currentUser, loading, error, hasPermission, login, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
