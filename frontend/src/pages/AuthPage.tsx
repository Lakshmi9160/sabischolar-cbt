import React from "react";
import { Link } from "react-router-dom";
import type { CatalogExam } from "../catalogSubjects";
import { ss } from "../theme";

type Props = {
  authFullName: string;
  setAuthFullName: (v: string) => void;
  authSabiScholarUserId: string;
  setAuthSabiScholarUserId: (v: string) => void;
  authEmail: string;
  setAuthEmail: (v: string) => void;
  authPassword: string;
  setAuthPassword: (v: string) => void;
  authTargetExam: CatalogExam;
  setAuthTargetExam: (v: CatalogExam) => void;
  authTargetExamYear: number;
  setAuthTargetExamYear: (v: number) => void;
  onLogin: () => void;
  onRegister: () => void;
};

export const AuthPage: React.FC<Props> = ({
  authFullName,
  setAuthFullName,
  authSabiScholarUserId,
  setAuthSabiScholarUserId,
  authEmail,
  setAuthEmail,
  authPassword,
  setAuthPassword,
  authTargetExam,
  setAuthTargetExam,
  authTargetExamYear,
  setAuthTargetExamYear,
  onLogin,
  onRegister
}) => (
  <div className="ss-auth-panel ss-section">
    <h2>Sign in</h2>
    <p style={{ color: ss.muted, fontSize: "0.9375rem", marginTop: 0 }}>
      Sign in with your CBT account or create one below.
    </p>
    <div className="ss-field">
      <label htmlFor="auth-full-name">Full name (for sign up)</label>
      <input
        id="auth-full-name"
        value={authFullName}
        onChange={(e) => setAuthFullName(e.target.value)}
        placeholder="Your full name"
      />
    </div>
    <div className="ss-field">
      <label htmlFor="auth-sabischolar-id">SabiScholar user ID (optional)</label>
      <input
        id="auth-sabischolar-id"
        value={authSabiScholarUserId}
        onChange={(e) => setAuthSabiScholarUserId(e.target.value)}
        placeholder="e.g. sabi_12345"
      />
    </div>
    <div className="ss-field">
      <label htmlFor="auth-email">Email</label>
      <input
        id="auth-email"
        type="email"
        value={authEmail}
        onChange={(e) => setAuthEmail(e.target.value)}
        placeholder="you@example.com"
      />
    </div>
    <div className="ss-field">
      <label htmlFor="auth-password">Password</label>
      <input
        id="auth-password"
        type="password"
        value={authPassword}
        onChange={(e) => setAuthPassword(e.target.value)}
        placeholder="Enter password"
      />
    </div>
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "flex-end",
        marginTop: 4,
        paddingTop: 12,
        borderTop: `1px solid ${ss.border}`
      }}
    >
      <div className="ss-field" style={{ marginBottom: 0, minWidth: 140 }}>
        <label htmlFor="auth-target-exam">Target exam (sign up)</label>
        <select
          id="auth-target-exam"
          value={authTargetExam}
          onChange={(e) => setAuthTargetExam(e.target.value as CatalogExam)}
        >
          <option value="JAMB">JAMB</option>
          <option value="WAEC">WAEC</option>
          <option value="NECO">NECO</option>
        </select>
      </div>
      <div className="ss-field" style={{ marginBottom: 0, minWidth: 120 }}>
        <label htmlFor="auth-target-year">Exam year</label>
        <input
          id="auth-target-year"
          type="number"
          min={2000}
          max={2100}
          value={authTargetExamYear}
          onChange={(e) => setAuthTargetExamYear(Number(e.target.value))}
        />
      </div>
    </div>
    <p style={{ fontSize: "0.8125rem", color: ss.muted, margin: "8px 0 0", lineHeight: 1.45 }}>
      Used for your dashboard countdown and defaults. You can change this later on the dashboard.
    </p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
      <button type="button" className="ss-btn ss-btn--primary" onClick={onLogin}>
        Log in
      </button>
      <button type="button" className="ss-btn" onClick={onRegister}>
        Create account
      </button>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
      <Link to="/auth/verify" className="ss-btn ss-btn--ghost" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
        Verify email token
      </Link>
      <Link to="/auth/forgot" className="ss-btn ss-btn--ghost" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
        Forgot password
      </Link>
    </div>
    <p className="ss-muted-note">Google · Phone OTP — coming soon</p>
  </div>
);
