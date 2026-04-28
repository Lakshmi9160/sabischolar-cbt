import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CatalogExam } from "../catalogSubjects";
import { normalizeCatalogSubject, subjectsForExam } from "../catalogSubjects";
import { ss } from "../theme";
import type { ExamMode } from "../types";

export type DashboardData = {
  profile: {
    fullName: string;
    sabischolar_user_id?: string | null;
    targetExam: string | null;
    targetExamYear: number | null;
  } | null;
  recentSessions: Array<{
    id: number;
    exam_type: string;
    mode: string;
    status: string;
    started_at?: string;
    submitted_at?: string | null;
  }>;
  weakTopics: Array<{
    topic_id: number | null;
    topic_name?: string | null;
    subject_code?: string | null;
    exam_type?: string | null;
    total: number;
    correct: number;
  }>;
  streakDays: number;
  examCountdown: { examDateIso: string; daysRemaining: number; label: string } | null;
  /** Weighted mock % trend per exam (null = no submitted mocks yet for that exam). */
  predictedMockPercentByExam?: {
    JAMB: number | null;
    WAEC: number | null;
    NECO: number | null;
  };
};

export type ActiveSessionPreview = {
  id: number;
  mode: string;
  examType: string;
};

type Props = {
  dashboard: DashboardData;
  onStart: (mode: ExamMode) => void;
  onRefresh: () => void;
  activeSession?: ActiveSessionPreview | null;
  onContinueExam?: () => void;
  studyExamType: CatalogExam;
  onStudyExamTypeChange: (exam: CatalogExam) => void;
  studySubject: string;
  onStudySubjectChange: (subject: string) => void;
  /** Persist target exam + year (countdown, weak topics scope, leaderboard default). */
  onSaveTargetProfile?: (exam: CatalogExam, year: number) => Promise<{ ok: boolean; message?: string }>;
};

const card: React.CSSProperties = {
  background: ss.surface,
  border: `1px solid ${ss.border}`,
  borderRadius: ss.radius,
  padding: "1.1rem 1.15rem",
  marginBottom: "1rem",
  boxShadow: ss.shadow
};

function ExamCountdownCard({ data }: { data: NonNullable<DashboardData["examCountdown"]> }) {
  const d = data.daysRemaining;
  const isPast = d < 0;
  const isToday = d === 0;
  const upcoming = d > 0;
  const urgent = upcoming && d <= 14;

  let pct = 0;
  if (upcoming) {
    pct = Math.min(100, Math.max(10, 100 - (d / 120) * 100));
  } else {
    pct = 100;
  }

  const fillBackground = isPast
    ? `linear-gradient(90deg, rgba(15,118,110,0.25), rgba(15,118,110,0.45))`
    : urgent
      ? `linear-gradient(90deg, ${ss.warning}, #fbbf24)`
      : `linear-gradient(90deg, ${ss.primary}, ${ss.primaryHover})`;

  return (
    <div
      style={{
        ...card,
        background: `linear-gradient(165deg, ${ss.primaryMuted} 0%, ${ss.surface} 48%, ${ss.surface} 100%)`,
        padding: "1.35rem 1.3rem 1.15rem",
        borderRadius: ss.radiusLg
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 14,
          marginBottom: 14,
          flexWrap: "wrap"
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: ss.muted,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 8
            }}
          >
            Exam timeline
          </div>
          {upcoming ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "2.625rem",
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                  color: urgent ? ss.warning : ss.primary,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1
                }}
              >
                {d}
              </span>
              <span style={{ fontSize: "0.9375rem", color: ss.muted, fontWeight: 500 }}>
                day{d === 1 ? "" : "s"} until nominal date
              </span>
            </div>
          ) : isToday ? (
            <div style={{ fontSize: "1.375rem", fontWeight: 700, color: ss.primary, letterSpacing: "-0.02em" }}>
              Nominal exam day
            </div>
          ) : (
            <div>
              <div style={{ fontSize: "1.25rem", fontWeight: 600, color: ss.muted, letterSpacing: "-0.02em" }}>
                After nominal date
              </div>
              <div style={{ fontSize: "0.8125rem", color: ss.muted, marginTop: 6, fontWeight: 500, opacity: 0.95 }}>
                Keep practicing — scores still matter
              </div>
            </div>
          )}
        </div>
        {upcoming ? (
          <span
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              padding: "7px 11px",
              borderRadius: 999,
              background: urgent ? "rgba(217, 119, 6, 0.12)" : "rgba(15, 118, 110, 0.12)",
              color: urgent ? "#b45309" : ss.primary,
              whiteSpace: "nowrap",
              flexShrink: 0
            }}
          >
            {urgent ? "Soon" : "Scheduled"}
          </span>
        ) : (
          <span
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              padding: "7px 11px",
              borderRadius: 999,
              background: "rgba(100, 116, 139, 0.1)",
              color: ss.muted,
              whiteSpace: "nowrap",
              flexShrink: 0
            }}
          >
            Reference
          </span>
        )}
      </div>
      <p
        style={{
          fontSize: "0.875rem",
          lineHeight: 1.55,
          color: ss.muted,
          margin: "0 0 1rem",
          maxWidth: "38ch"
        }}
      >
        {data.label}
      </p>
      <div
        style={{
          height: 4,
          borderRadius: 999,
          background: "rgba(148, 163, 184, 0.22)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 999,
            background: fillBackground,
            transition: "width 0.45s cubic-bezier(0.4, 0, 0.2, 1)"
          }}
        />
      </div>
    </div>
  );
}

export const DashboardPanel: React.FC<Props> = ({
  dashboard,
  onStart,
  onRefresh,
  activeSession,
  onContinueExam,
  studyExamType,
  onStudyExamTypeChange,
  studySubject,
  onStudySubjectChange,
  onSaveTargetProfile
}) => {
  const { examCountdown, streakDays, recentSessions, weakTopics, profile, predictedMockPercentByExam } = dashboard;

  const streakSlots = 14;
  const filled = Math.min(streakDays, streakSlots);

  const normProfileExam = (e: string | null | undefined): CatalogExam => {
    const t = (e || "JAMB").toUpperCase();
    return t === "WAEC" || t === "NECO" ? t : "JAMB";
  };

  const [targetDraftExam, setTargetDraftExam] = useState<CatalogExam>(() => normProfileExam(profile?.targetExam));
  const [targetDraftYear, setTargetDraftYear] = useState<number>(() =>
    typeof profile?.targetExamYear === "number" && Number.isFinite(profile.targetExamYear)
      ? profile.targetExamYear
      : new Date().getFullYear()
  );
  const [targetSaveBusy, setTargetSaveBusy] = useState(false);
  const [targetSaveMsg, setTargetSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    setTargetDraftExam(normProfileExam(profile?.targetExam));
    const y = profile?.targetExamYear;
    setTargetDraftYear(typeof y === "number" && Number.isFinite(y) ? y : new Date().getFullYear());
  }, [profile?.targetExam, profile?.targetExamYear]);

  const profileYear = profile?.targetExamYear;
  const targetUnchanged =
    normProfileExam(profile?.targetExam) === targetDraftExam &&
    (typeof profileYear === "number" && Number.isFinite(profileYear) ? profileYear : null) === targetDraftYear;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="ss-page-title" style={{ marginBottom: "1.25rem" }}>
        {profile?.fullName ? `Hi, ${profile.fullName}` : "Dashboard"}
      </h1>
      {profile?.sabischolar_user_id ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: "0.9rem",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: ss.primary,
            background: ss.primaryMuted,
            border: `1px solid ${ss.primarySoft}`,
            borderRadius: 999,
            padding: "6px 10px"
          }}
        >
          <span style={{ letterSpacing: "0.04em", textTransform: "uppercase" }}>SabiScholar ID</span>
          <span style={{ color: ss.text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            {profile.sabischolar_user_id}
          </span>
        </div>
      ) : null}
      <div style={{ marginBottom: "0.9rem" }}>
        <Link
          to="/auth/request-verification"
          className="ss-btn ss-btn--ghost"
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          Request verification token
        </Link>
      </div>

      {onSaveTargetProfile ? (
        <div style={{ ...card, marginBottom: "1rem" }}>
          <div
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: ss.muted,
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "0.04em"
            }}
          >
            Target exam
          </div>
          <p style={{ fontSize: "0.8125rem", color: ss.muted, margin: "0 0 12px", lineHeight: 1.45 }}>
            Sets your dashboard countdown, weak-topic focus, and default leaderboard filter.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "flex-end",
              marginBottom: targetSaveMsg ? 10 : 0
            }}
          >
            <div className="ss-field" style={{ marginBottom: 0, minWidth: 140 }}>
              <label htmlFor="dash-target-exam">Exam</label>
              <select
                id="dash-target-exam"
                value={targetDraftExam}
                onChange={(e) => setTargetDraftExam(e.target.value as CatalogExam)}
                disabled={targetSaveBusy}
              >
                <option value="JAMB">JAMB</option>
                <option value="WAEC">WAEC</option>
                <option value="NECO">NECO</option>
              </select>
            </div>
            <div className="ss-field" style={{ marginBottom: 0, minWidth: 120 }}>
              <label htmlFor="dash-target-year">Year</label>
              <input
                id="dash-target-year"
                type="number"
                min={2000}
                max={2100}
                value={targetDraftYear}
                onChange={(e) => setTargetDraftYear(Number(e.target.value))}
                disabled={targetSaveBusy}
              />
            </div>
            <button
              type="button"
              className="ss-btn ss-btn--primary"
              disabled={targetSaveBusy || targetUnchanged}
              onClick={() => {
                void (async () => {
                  setTargetSaveMsg(null);
                  setTargetSaveBusy(true);
                  try {
                    const y = Math.trunc(Number(targetDraftYear));
                    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
                      setTargetSaveMsg("Year must be between 2000 and 2100.");
                      return;
                    }
                    const r = await onSaveTargetProfile(targetDraftExam, y);
                    setTargetSaveMsg(r.ok ? "Saved." : r.message || "Could not save.");
                  } finally {
                    setTargetSaveBusy(false);
                  }
                })();
              }}
            >
              {targetSaveBusy ? "Saving…" : "Save target"}
            </button>
          </div>
          {targetSaveMsg ? (
            <p
              style={{
                fontSize: "0.8125rem",
                margin: "8px 0 0",
                color: targetSaveMsg === "Saved." ? ss.success : ss.danger
              }}
            >
              {targetSaveMsg}
            </p>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 0, gridTemplateColumns: "1fr" }}>
        {examCountdown ? (
          <ExamCountdownCard data={examCountdown} />
        ) : null}

        <div style={card}>
          <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: ss.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Study streak
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "2.25rem", fontWeight: 800, color: ss.primary, letterSpacing: "-0.03em" }}>{streakDays}</span>
            <span style={{ fontSize: "1rem", color: ss.muted }}>
              day{streakDays === 1 ? "" : "s"} with a completed session
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 16,
              flexWrap: "wrap",
              alignItems: "center"
            }}
            aria-label={`Streak visualization, ${filled} of last ${streakSlots} slots`}
          >
            {Array.from({ length: streakSlots }, (_, i) => (
              <div
                key={i}
                style={{
                  width: 16,
                  height: 16,
                  minWidth: 16,
                  minHeight: 16,
                  borderRadius: "50%",
                  background: i < filled ? ss.primary : ss.border,
                  border: i < filled ? `2px solid ${ss.primaryHover}` : `2px solid ${ss.border}`
                }}
              />
            ))}
          </div>
          <p style={{ fontSize: "0.8125rem", color: ss.muted, marginTop: 12, marginBottom: 0, lineHeight: 1.45 }}>
            Dots show up to {streakSlots} slots; filled = current streak length.
          </p>
        </div>

        {predictedMockPercentByExam ? (
          <div style={{ ...card, marginTop: "1rem" }}>
            <div
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: ss.muted,
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: "0.04em"
              }}
            >
              Mock momentum
            </div>
            <p style={{ fontSize: "0.8125rem", color: ss.muted, margin: "0 0 12px", lineHeight: 1.45 }}>
              Weighted average % from your last few <strong style={{ color: ss.text }}>submitted</strong> mocks per
              exam (same weighted trend as the results page predicted score).
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {(["JAMB", "WAEC", "NECO"] as const).map((ex) => {
                const v = predictedMockPercentByExam[ex];
                return (
                  <div
                    key={ex}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.55rem 0.75rem",
                      borderRadius: ss.radiusSm,
                      background: ss.bg,
                      border: `1px solid ${ss.border}`,
                      fontSize: "0.9375rem"
                    }}
                  >
                    <span style={{ fontWeight: 700, color: ss.text }}>{ex}</span>
                    <span style={{ fontWeight: 800, color: v == null ? ss.muted : ss.primary, fontVariantNumeric: "tabular-nums" }}>
                      {v == null ? "—" : `${v}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {activeSession && onContinueExam ? (
        <div
          style={{
            ...card,
            marginBottom: "1rem",
            borderColor: ss.primarySoft,
            background: `linear-gradient(135deg, ${ss.primaryMuted} 0%, ${ss.surface} 55%)`
          }}
        >
          <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: ss.primary, letterSpacing: "0.08em", marginBottom: 8 }}>
            In progress
          </div>
          <p style={{ margin: "0 0 12px", fontSize: "0.9375rem", color: ss.text, lineHeight: 1.45 }}>
            Session <strong>#{activeSession.id}</strong> · {activeSession.examType} ·{" "}
            <span style={{ textTransform: "capitalize" }}>{activeSession.mode}</span>
            <span style={{ color: ss.muted, fontWeight: 400 }}> — pick up where you left off.</span>
          </p>
          <button type="button" className="ss-btn ss-btn--primary" onClick={onContinueExam}>
            Continue exam
          </button>
        </div>
      ) : null}

      <div style={{ ...card, marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: 14, color: ss.text }}>Quick start</div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "flex-end",
            marginBottom: 12
          }}
        >
          <div className="ss-field" style={{ marginBottom: 0, minWidth: 140 }}>
            <label htmlFor="dash-study-exam">Study exam</label>
            <select
              id="dash-study-exam"
              value={studyExamType}
              onChange={(e) => onStudyExamTypeChange(e.target.value as CatalogExam)}
            >
              <option value="JAMB">JAMB</option>
              <option value="WAEC">WAEC</option>
              <option value="NECO">NECO</option>
            </select>
          </div>
          <div className="ss-field" style={{ marginBottom: 0, minWidth: 120 }}>
            <label htmlFor="dash-study-subject">Study subject</label>
            <select
              id="dash-study-subject"
              value={studySubject}
              onChange={(e) => onStudySubjectChange(e.target.value)}
            >
              {subjectsForExam(studyExamType).map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>
        {studyExamType !== "JAMB" ? (
          <p style={{ margin: "0 0 12px", fontSize: "0.8125rem", color: ss.muted, lineHeight: 1.45 }}>
            {studyExamType} mock uses the <strong style={{ color: ss.text }}>selected subject only</strong> (seeded:{" "}
            {subjectsForExam(studyExamType).join(", ")}).
          </p>
        ) : null}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="ss-btn ss-btn--primary" onClick={() => onStart("mock")}>
            {studyExamType} mock
          </button>
          <button type="button" className="ss-btn" onClick={() => onStart("study")}>
            Study mode
          </button>
          <Link
            to={`/drill-setup?examType=${encodeURIComponent(studyExamType)}&subject=${encodeURIComponent(studySubject)}`}
            className="ss-btn"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            Topic drill
          </Link>
          <button type="button" className="ss-btn ss-btn--ghost" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: 14, color: ss.text }}>Recent sessions</div>
        {recentSessions.length === 0 ? (
          <p style={{ color: ss.muted, fontSize: "0.9375rem", margin: 0 }}>No sessions yet — use quick start above.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {recentSessions.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 10,
                  padding: "0.75rem 0.85rem",
                  background: ss.bg,
                  borderRadius: ss.radiusSm,
                  border: `1px solid ${ss.border}`,
                  fontSize: "0.9375rem"
                }}
              >
                <span style={{ fontWeight: 700, color: ss.text }}>#{s.id}</span>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: ss.primaryMuted,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: ss.primary
                  }}
                >
                  {s.exam_type}
                </span>
                <span style={{ color: ss.muted }}>{s.mode}</span>
                <span
                  style={{
                    marginLeft: "auto",
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: s.status === "submitted" ? "#d1fae5" : "#fef3c7",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: s.status === "submitted" ? "#065f46" : "#92400e"
                  }}
                >
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...card, marginBottom: 0 }}>
        <div style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: 14, color: ss.text }}>Weak topics</div>
        {weakTopics.length === 0 ? (
          <p style={{ color: ss.muted, fontSize: "0.9375rem", margin: 0 }}>Answer more questions to see weak topics.</p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {weakTopics.map((t, idx) => {
              const pct = t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
              const barPct = Math.max(0, Math.min(100, pct));
              const label =
                t.topic_name && String(t.topic_name).trim()
                  ? `${t.topic_name}${t.subject_code ? ` · ${t.subject_code}` : ""}${t.exam_type ? ` · ${t.exam_type}` : ""}`
                  : t.topic_id != null
                    ? `Topic #${t.topic_id}`
                    : "Uncategorized";
              const sc = String(t.subject_code ?? "")
                .trim()
                .toUpperCase();
              const ex = String(t.exam_type ?? "JAMB")
                .trim()
                .toUpperCase();
              const drillExamParam = (ex === "WAEC" || ex === "NECO" ? ex : "JAMB") as CatalogExam;
              const drillSubjectParam = normalizeCatalogSubject(drillExamParam, sc);
              return (
                <div key={`${t.topic_id ?? "n"}-${idx}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: "0.875rem" }}>
                    <span style={{ color: ss.text }}>{label}</span>
                    <span style={{ color: ss.muted }}>
                      {t.correct}/{t.total} ({pct}%)
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: ss.border, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${barPct}%`,
                        height: "100%",
                        background: barPct < 40 ? ss.danger : barPct < 65 ? ss.warning : ss.success,
                        borderRadius: 3
                      }}
                    />
                  </div>
                  {t.topic_id != null ? (
                    <Link
                      to={`/drill-setup?examType=${encodeURIComponent(
                        drillExamParam
                      )}&subject=${encodeURIComponent(drillSubjectParam)}&topicId=${t.topic_id}`}
                      className="ss-btn ss-btn--ghost"
                      style={{
                        fontSize: "0.8125rem",
                        marginTop: 10,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        minHeight: 44
                      }}
                    >
                      Drill this topic
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
