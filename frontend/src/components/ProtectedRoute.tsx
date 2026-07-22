import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export function ProtectedRoute({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const { loading, error, hasPermission } = useAuth();
  if (loading) return <div className="table-panel empty-state">Đang tải quyền truy cập...</div>;
  if (error) return <div className="alert error">{error}</div>;
  if (!permissions.every(hasPermission)) return <Navigate to="/forbidden" replace />;
  return children;
}
