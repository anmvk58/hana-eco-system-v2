import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { api } from "../api/client";
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

  function clearSession() {
    localStorage.removeItem("hana-access-token");
    setCurrentUser(null);
    setLoading(false);
    setError("");
  }

  async function refresh() {
    const token = localStorage.getItem("hana-access-token");
    if (!token) { setCurrentUser(null); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const user = await api.auth.me();
      if (localStorage.getItem("hana-access-token") === token) setCurrentUser(user);
    }
    catch { clearSession(); }
    finally { setLoading(false); }
  }

  async function login(username: string, password: string) {
    setError("");
    try {
      const result = await api.auth.login(username, password);
      localStorage.setItem("hana-access-token", result.access_token);
      setCurrentUser(result.user);
    } catch (err) {
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
    window.addEventListener("hana-auth-expired", expired);
    return () => window.removeEventListener("hana-auth-expired", expired);
  }, []);

  const hasPermission = (code: string) => currentUser?.permissions.includes(code) ?? false;
  return <AuthContext.Provider value={{ currentUser, loading, error, hasPermission, login, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
