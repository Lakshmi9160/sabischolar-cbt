import React from "react";
import { Navigate } from "react-router-dom";

export function RequireAuth({ token, children }: { token: string; children: React.ReactNode }) {
  if (!token) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

export function RequireAdmin({
  token,
  profileReady,
  isAdmin,
  children
}: {
  token: string;
  profileReady: boolean;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  if (!token) return <Navigate to="/auth" replace />;
  if (!profileReady) return <p className="ss-muted-line">Checking access…</p>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
