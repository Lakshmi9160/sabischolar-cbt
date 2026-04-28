import React, { useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../api";
import { requestJson } from "../apiClient";
import { ss } from "../theme";

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [devToken, setDevToken] = useState("");

  const submit = async () => {
    if (!email.trim()) {
      setStatus({ ok: false, text: "Enter your account email." });
      return;
    }
    setBusy(true);
    try {
      const { res, data } = await requestJson<{ ok?: boolean; token?: string; sent?: boolean; message?: string }>(
        `${API_BASE}/auth/request-password-reset`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() })
        }
      );
      if (!res.ok) {
        setStatus({ ok: false, text: data.message || "Could not request reset." });
        return;
      }
      if (data.sent) {
        setDevToken("");
        setStatus({
          ok: true,
          text: "If an account exists for that address, we sent reset instructions to your email."
        });
      } else if (data.token) {
        setDevToken(data.token);
        setStatus({ ok: true, text: "Reset request submitted. Use your token on the reset screen (dev)." });
      } else {
        setDevToken("");
        setStatus({
          ok: true,
          text: "If an account exists for that address, we sent reset instructions."
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ss-section" style={{ maxWidth: 480 }}>
      <h1 className="ss-page-title">Forgot password</h1>
      <p style={{ marginTop: 0, color: ss.muted, fontSize: "0.9375rem", lineHeight: 1.45 }}>
        Enter your email to request a password reset token.
      </p>
      <div className="ss-field">
        <label htmlFor="forgot-email">Email</label>
        <input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="ss-btn ss-btn--primary" onClick={() => void submit()} disabled={busy}>
          {busy ? "Requesting..." : "Request reset"}
        </button>
        <Link className="ss-btn" to="/auth/reset" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          I have a token
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
      {devToken ? (
        <p style={{ marginBottom: 0, marginTop: 10, color: ss.muted, fontSize: "0.8125rem", wordBreak: "break-all" }}>
          Dev token: <code>{devToken}</code>
        </p>
      ) : null}
    </div>
  );
};
