import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_BASE } from "../api";
import { requestJson } from "../apiClient";
import { ss } from "../theme";

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const t = searchParams.get("token");
    if (t && t.trim()) {
      setToken(t.trim());
    }
  }, [searchParams]);

  const submit = async () => {
    if (!token.trim() || !newPassword.trim()) {
      setStatus({ ok: false, text: "Enter both token and new password." });
      return;
    }
    setBusy(true);
    try {
      const { res, data } = await requestJson<{ ok?: boolean; message?: string }>(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), newPassword })
      });
      if (!res.ok) {
        setStatus({ ok: false, text: data.message || "Reset failed." });
        return;
      }
      setStatus({ ok: true, text: "Password reset complete. Sign in with your new password." });
      setNewPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ss-section" style={{ maxWidth: 480 }}>
      <h1 className="ss-page-title">Reset password</h1>
      <p style={{ marginTop: 0, color: ss.muted, fontSize: "0.9375rem", lineHeight: 1.45 }}>
        Paste the reset token and choose a new password.
      </p>
      <div className="ss-field">
        <label htmlFor="reset-token">Reset token</label>
        <input
          id="reset-token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste token"
          autoComplete="off"
        />
      </div>
      <div className="ss-field">
        <label htmlFor="reset-password">New password</label>
        <input
          id="reset-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter new password"
          autoComplete="new-password"
        />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="ss-btn ss-btn--primary" onClick={() => void submit()} disabled={busy}>
          {busy ? "Resetting..." : "Reset password"}
        </button>
        <Link className="ss-btn" to="/auth/forgot" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          Request token
        </Link>
        <Link className="ss-btn ss-btn--ghost" to="/auth" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          Back to sign in
        </Link>
      </div>
      {status ? (
        <p style={{ marginBottom: 0, marginTop: 12, color: status.ok ? ss.success : ss.danger, fontSize: "0.875rem" }}>
          {status.text}
        </p>
      ) : null}
    </div>
  );
};
