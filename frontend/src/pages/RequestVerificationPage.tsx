import React, { useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../api";
import { requestJson } from "../apiClient";
import { ss } from "../theme";

type Props = {
  authHeader: Record<string, string>;
  handleUnauthorized: (res: Response) => boolean;
};

export const RequestVerificationPage: React.FC<Props> = ({ authHeader, handleUnauthorized }) => {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [token, setToken] = useState("");

  const submit = async () => {
    setBusy(true);
    try {
      const { res, data } = await requestJson<{ ok?: boolean; token?: string; sent?: boolean; message?: string }>(
        `${API_BASE}/auth/request-verification`,
        {
          method: "POST",
          headers: authHeader
        }
      );
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        setStatus({ ok: false, text: data.message || "Could not request verification token." });
        return;
      }
      if (data.sent) {
        setToken("");
        setStatus({ ok: true, text: "Check your email for a verification link." });
      } else {
        setToken(data.token || "");
        setStatus({ ok: true, text: "Verification token generated (dev)." });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ss-section" style={{ maxWidth: 480 }}>
      <h1 className="ss-page-title">Request verification</h1>
      <p style={{ marginTop: 0, color: ss.muted, fontSize: "0.9375rem", lineHeight: 1.45 }}>
        Generate a fresh email verification token for your signed-in account.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="ss-btn ss-btn--primary" onClick={() => void submit()} disabled={busy}>
          {busy ? "Requesting..." : "Request token"}
        </button>
        <Link className="ss-btn" to="/auth/verify" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          Go to verify screen
        </Link>
        <Link className="ss-btn ss-btn--ghost" to="/dashboard" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          Back to dashboard
        </Link>
      </div>
      {status ? (
        <p style={{ marginBottom: 0, marginTop: 12, color: status.ok ? ss.success : ss.danger, fontSize: "0.875rem" }}>
          {status.text}
        </p>
      ) : null}
      {token ? (
        <p style={{ marginBottom: 0, marginTop: 10, color: ss.muted, fontSize: "0.8125rem", wordBreak: "break-all" }}>
          Dev token (only when email is not configured): <code>{token}</code>
        </p>
      ) : null}
    </div>
  );
};
