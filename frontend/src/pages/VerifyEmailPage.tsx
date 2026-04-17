import React, { useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../api";
import { requestJson } from "../apiClient";
import { ss } from "../theme";

export const VerifyEmailPage: React.FC = () => {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    if (!token.trim()) {
      setStatus({ ok: false, text: "Enter your verification token." });
      return;
    }
    setBusy(true);
    try {
      const { res, data } = await requestJson<{ ok?: boolean; message?: string }>(`${API_BASE}/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() })
      });
      if (!res.ok) {
        setStatus({ ok: false, text: data.message || "Verification failed." });
        return;
      }
      setStatus({ ok: true, text: "Email verified. You can continue using your account." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ss-section" style={{ maxWidth: 460 }}>
      <h1 className="ss-page-title">Verify email</h1>
      <p style={{ marginTop: 0, color: ss.muted, fontSize: "0.9375rem", lineHeight: 1.45 }}>
        Paste the verification token you received, then submit.
      </p>
      <div className="ss-field">
        <label htmlFor="verify-token">Verification token</label>
        <input
          id="verify-token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste token"
          autoComplete="off"
        />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="ss-btn ss-btn--primary" onClick={() => void submit()} disabled={busy}>
          {busy ? "Verifying..." : "Verify email"}
        </button>
        <Link className="ss-btn" to="/auth" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
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
