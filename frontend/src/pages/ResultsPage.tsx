import React from "react";
import { ProgressBar } from "../components/ProgressBar";
import { ss } from "../theme";
import { SessionResult } from "../types";

type Props = {
  result: SessionResult | null;
  loadingLastResult?: boolean;
  onStudyWeakTopics?: () => void;
};

export const ResultsPage: React.FC<Props> = ({ result, loadingLastResult, onStudyWeakTopics }) => {
  if (loadingLastResult) {
    return <p className="ss-muted-line">Loading your latest result…</p>;
  }
  if (!result) {
    return (
      <div>
        <p style={{ fontSize: "0.9375rem", lineHeight: 1.55, color: ss.muted, maxWidth: 520 }}>
          No results yet. Complete a session and <strong style={{ color: ss.text }}>submit</strong> — then return here.
          Your most recent submitted session loads automatically.
        </p>
        {onStudyWeakTopics ? (
          <button
            type="button"
            className="ss-btn ss-btn--primary"
            onClick={onStudyWeakTopics}
            style={{ marginTop: 8 }}
          >
            Study weak topics
          </button>
        ) : null}
      </div>
    );
  }

  const pass = (result.passFail || "").toLowerCase() === "pass";
  const subjects = result.subjectBreakdown || [];
  const topics = result.topicBreakdown || [];

  const overallPct = Math.min(100, Math.max(0, Number(result.percentage) || 0));
  const ctx =
    [result.examType, result.mode, result.status].filter(Boolean).length > 0
      ? [result.examType, result.mode, result.status].filter(Boolean).join(" · ")
      : null;

  return (
    <div style={{ maxWidth: 640 }}>
      <div
        style={{
          background: `linear-gradient(145deg, ${ss.primary} 0%, ${ss.primaryHover} 55%, #0b5f59 100%)`,
          color: "#fff",
          borderRadius: ss.radius,
          padding: "1.75rem 1.35rem",
          marginBottom: "1.5rem",
          textAlign: "center",
          boxShadow: ss.shadow
        }}
      >
        {ctx ? (
          <div style={{ fontSize: "0.75rem", opacity: 0.88, marginBottom: 10, fontWeight: 600, letterSpacing: "0.04em" }}>
            Session #{result.sessionId}
            <span style={{ opacity: 0.75 }}> · {ctx}</span>
          </div>
        ) : (
          <div style={{ fontSize: "0.75rem", opacity: 0.88, marginBottom: 10, fontWeight: 600 }}>Session #{result.sessionId}</div>
        )}
        <div style={{ fontSize: "0.8125rem", opacity: 0.92, marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
          Overall score
        </div>
        <div style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.03em" }}>{result.percentage}%</div>
        <div style={{ marginTop: 14, marginBottom: 4, maxWidth: 360, marginLeft: "auto", marginRight: "auto", textAlign: "left" }}>
          <ProgressBar
            label="Score"
            value={Math.round(overallPct)}
            percent={overallPct}
            color="rgba(255,255,255,0.95)"
            trackColor="rgba(255,255,255,0.22)"
            tone="onDark"
          />
        </div>
        <div style={{ fontSize: "1rem", marginTop: 10, opacity: 0.95 }}>
          {result.score}/{result.total} correct
        </div>
        <div
          style={{
            display: "inline-block",
            marginTop: 16,
            padding: "8px 18px",
            borderRadius: 999,
            fontSize: "0.875rem",
            fontWeight: 700,
            background: pass ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)",
            border: `2px solid ${pass ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.35)"}`
          }}
        >
          {(result.passFail || "—").toUpperCase()}
        </div>
        {typeof result.scaledJambScore === "number" ? (
          <div style={{ marginTop: 14, fontSize: "0.9375rem", opacity: 0.95 }}>JAMB scaled: {result.scaledJambScore}/400</div>
        ) : null}
        {typeof result.predictedScore === "number" ? (
          <div style={{ marginTop: 6, fontSize: "0.9375rem", opacity: 0.95 }}>Predicted next mock: {result.predictedScore}%</div>
        ) : null}
        {onStudyWeakTopics ? (
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="ss-btn"
              onClick={onStudyWeakTopics}
              style={{
                background: "rgba(255,255,255,0.14)",
                borderColor: "rgba(255,255,255,0.45)",
                color: "#fff",
                fontWeight: 700
              }}
            >
              Study weak topics
            </button>
          </div>
        ) : null}
      </div>

      <h2 className="ss-page-title" style={{ fontSize: "1.125rem", marginBottom: 12 }}>
        Subject breakdown
      </h2>
      <div className="ss-section" style={{ marginBottom: "1.25rem" }}>
        {subjects.length === 0 ? (
          <p style={{ fontSize: "0.9375rem", color: ss.muted, margin: 0 }}>No subject breakdown.</p>
        ) : (
          subjects.map((s) => (
            <ProgressBar
              key={s.subject_code}
              label={s.subject_code}
              value={Math.round(s.percentage)}
              percent={s.percentage}
              color={s.percentage >= 50 ? ss.success : s.percentage >= 35 ? ss.warning : ss.danger}
            />
          ))
        )}
      </div>

      {topics.length > 0 ? (
        <>
          <h2 className="ss-page-title" style={{ fontSize: "1.125rem", marginBottom: 12 }}>
            Topic breakdown
          </h2>
          <div className="ss-section" style={{ marginBottom: "1.25rem" }}>
            {topics.slice(0, 12).map((t, idx) => (
              <ProgressBar
                key={`${t.subject_code}-${t.topic_id ?? "x"}-${idx}`}
                label={`${t.subject_code} · topic ${t.topic_id ?? "—"}`}
                value={Math.round(t.percentage)}
                percent={t.percentage}
                color={ss.primary}
                trackColor={ss.primaryMuted}
              />
            ))}
            {topics.length > 12 ? (
              <p style={{ fontSize: "0.8125rem", color: ss.muted, marginTop: 8, marginBottom: 0 }}>
                Showing 12 of {topics.length} topics.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      <h2 className="ss-page-title" style={{ fontSize: "1.125rem", marginBottom: 12 }}>
        Questions to review
      </h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {(result.wrongAnswers || []).slice(0, 10).map((w) => (
          <li
            key={w.questionId}
            style={{
              fontSize: "0.9375rem",
              lineHeight: 1.55,
              marginBottom: 12,
              padding: "1rem 1.1rem",
              background: ss.bg,
              borderRadius: ss.radiusSm,
              border: `1px solid ${ss.border}`
            }}
          >
            <strong style={{ color: ss.text }}>Q{w.questionId}</strong>: chose {w.selectedOption}, correct {w.correctOption}.
            <div style={{ marginTop: 8, color: ss.muted }}>{w.explanation}</div>
            {w.lesson_link ? (
              <div style={{ marginTop: 12 }}>
                <a
                  href={w.lesson_link}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: "0.9375rem", fontWeight: 600, color: ss.primary }}
                >
                  Watch lesson on SabiScholar
                </a>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
};
