import React from "react";
import { ss } from "../theme";
import { ExamMode, Question } from "../types";

export type ExamPlayerPageProps = {
  mode: ExamMode;
  /** Shown in the page title (e.g. JAMB, WAEC) for the current session. */
  sessionExamType?: string;
  sessionExplanationMode?: "instant" | "deferred";
  questions: Question[];
  currentIndex: number;
  currentQuestion: Question | undefined;
  currentAnswerFeedback?: {
    isCorrect: boolean;
    selectedOption: string;
    correctOption: string;
    explanation: string;
    lessonLink: string | null;
  };
  remainingSeconds: number;
  flaggedIds: number[];
  selectedByQuestion: Record<number, string>;
  showCalculator: boolean;
  calcInput: string;
  onCalcInputChange: (value: string) => void;
  onOpenCalculator: () => void;
  onCloseCalculator: () => void;
  onEvalCalc: () => void;
  onClearCalc: () => void;
  formatSeconds: (seconds: number) => string;
  onGoToIndex: (index: number) => void;
  onSelectOption: (questionId: number, label: string) => void;
  onToggleFlag: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: () => void;
};

export const ExamPlayerPage: React.FC<ExamPlayerPageProps> = ({
  mode,
  sessionExamType,
  sessionExplanationMode = "deferred",
  questions,
  currentIndex,
  currentQuestion,
  currentAnswerFeedback,
  remainingSeconds,
  flaggedIds,
  selectedByQuestion,
  showCalculator,
  calcInput,
  onCalcInputChange,
  onOpenCalculator,
  onCloseCalculator,
  onEvalCalc,
  onClearCalc,
  formatSeconds,
  onGoToIndex,
  onSelectOption,
  onToggleFlag,
  onPrevious,
  onNext,
  onSubmit
}) => {
  const subjectCodes = Array.from(
    new Set(questions.map((q) => String(q.subject_code ?? "GEN").trim().toUpperCase() || "GEN"))
  );
  const currentSubject = String(currentQuestion?.subject_code ?? "GEN").trim().toUpperCase() || "GEN";
  const answeredCount = questions.filter((q) => Boolean(selectedByQuestion[q.id])).length;

  const subjectStats = subjectCodes.map((code) => {
    const indices = questions
      .map((q, idx) => ({ idx, code: String(q.subject_code ?? "GEN").trim().toUpperCase() || "GEN" }))
      .filter((x) => x.code === code);
    const total = indices.length;
    const answered = indices.filter((x) => Boolean(selectedByQuestion[questions[x.idx].id])).length;
    const firstIndex = indices[0]?.idx ?? 0;
    return { code, total, answered, firstIndex };
  });

  const gridButtonColor = (q: Question) => {
    if (flaggedIds.includes(q.id)) return ss.warning;
    if (selectedByQuestion[q.id]) return ss.primaryMuted;
    return ss.border;
  };

  const timerStyle: React.CSSProperties = {
    color: remainingSeconds <= 10 * 60 && mode === "mock" ? ss.danger : ss.text,
    fontWeight: 700
  };

  return (
    <>
      <h1 className="ss-page-title" style={{ textTransform: "capitalize", marginBottom: "0.75rem" }}>
        {sessionExamType ? `${sessionExamType} ` : ""}
        {mode} session
      </h1>
      <div className="ss-section">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap",
            gap: 8
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                background: ss.primaryMuted,
                border: `1px solid ${ss.primarySoft}`,
                color: ss.primary,
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase"
              }}
            >
              {sessionExamType || "Exam"}
            </span>
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                background: "#f8fafc",
                border: `1px solid ${ss.border}`,
                color: ss.muted,
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase"
              }}
            >
              {mode}
            </span>
            {mode !== "mock" ? (
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: sessionExplanationMode === "instant" ? "#ecfdf5" : "#f8fafc",
                  border: `1px solid ${sessionExplanationMode === "instant" ? "#86efac" : ss.border}`,
                  color: sessionExplanationMode === "instant" ? "#166534" : ss.muted,
                  fontSize: "0.75rem",
                  fontWeight: 700
                }}
              >
                {sessionExplanationMode === "instant" ? "Instant explanations" : "Deferred explanations"}
              </span>
            ) : null}
          </div>
          <span style={timerStyle}>
            {mode === "mock" ? formatSeconds(remainingSeconds) : "No timer"}
            {mode === "mock" ? " · " : " "}
            <button type="button" className="ss-btn ss-btn--ghost" onClick={onOpenCalculator}>
              Calculator (C)
            </button>
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <div
            style={{
              padding: "6px 10px",
              borderRadius: ss.radiusSm,
              border: `1px solid ${ss.border}`,
              background: ss.bg,
              fontSize: "0.8125rem",
              color: ss.muted
            }}
          >
            Question <strong style={{ color: ss.text }}>{currentIndex + 1}</strong> / {questions.length}
          </div>
          <div
            style={{
              padding: "6px 10px",
              borderRadius: ss.radiusSm,
              border: `1px solid ${ss.border}`,
              background: ss.bg,
              fontSize: "0.8125rem",
              color: ss.muted
            }}
          >
            Answered <strong style={{ color: ss.text }}>{answeredCount}</strong> / {questions.length}
          </div>
          <div
            style={{
              padding: "6px 10px",
              borderRadius: ss.radiusSm,
              border: `1px solid ${ss.border}`,
              background: ss.bg,
              fontSize: "0.8125rem",
              color: ss.muted
            }}
          >
            Current subject: <strong style={{ color: ss.text }}>{currentSubject}</strong>
          </div>
        </div>

        {subjectStats.length > 1 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {subjectStats.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => onGoToIndex(s.firstIndex)}
                className="ss-btn"
                style={{
                  background: s.code === currentSubject ? ss.primaryMuted : ss.surface,
                  borderColor: s.code === currentSubject ? ss.primarySoft : ss.border,
                  color: s.code === currentSubject ? ss.primary : ss.text,
                  minHeight: 40,
                  padding: "8px 11px"
                }}
              >
                {s.code} {s.answered}/{s.total}
              </button>
            ))}
          </div>
        ) : null}

        <div className="ss-exam-layout">
          {currentQuestion ? (
            <article className="ss-exam-main">
              <p style={{ fontSize: 17, lineHeight: 1.55, marginBottom: 16 }}>{currentQuestion.question_body}</p>
              {currentQuestion.image_url ? (
                <img
                  src={currentQuestion.image_url}
                  alt=""
                  style={{ maxWidth: "100%", marginBottom: 16, borderRadius: ss.radiusSm }}
                />
              ) : null}
              <div style={{ display: "grid", gap: 10 }}>
                {(
                  [
                    ["A", currentQuestion.option_a],
                    ["B", currentQuestion.option_b],
                    ["C", currentQuestion.option_c],
                    ["D", currentQuestion.option_d]
                  ] as const
                ).map(([label, text]) => (
                  <button
                    type="button"
                    key={label}
                    onClick={() => onSelectOption(currentQuestion.id, label)}
                    style={{
                      minHeight: 48,
                      textAlign: "left",
                      borderRadius: ss.radiusSm,
                      border: `1px solid ${selectedByQuestion[currentQuestion.id] === label ? ss.primary : ss.border}`,
                      background: selectedByQuestion[currentQuestion.id] === label ? ss.primaryMuted : ss.surface,
                      color: ss.text,
                      fontSize: 16,
                      padding: "12px 14px",
                      cursor: "pointer"
                    }}
                  >
                    <strong>{label}.</strong> {text}
                  </button>
                ))}
              </div>
              {mode !== "mock" && sessionExplanationMode === "instant" && currentAnswerFeedback ? (
                <div
                  style={{
                    marginTop: 14,
                    padding: "0.85rem 0.95rem",
                    borderRadius: ss.radiusSm,
                    border: `1px solid ${currentAnswerFeedback.isCorrect ? ss.success : ss.warning}`,
                    background: currentAnswerFeedback.isCorrect ? "#ecfdf5" : "#fffbeb"
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 700,
                      color: currentAnswerFeedback.isCorrect ? "#065f46" : "#92400e",
                      marginBottom: 6,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em"
                    }}
                  >
                    {currentAnswerFeedback.isCorrect ? "Correct" : "Explanation"}
                  </div>
                  {!currentAnswerFeedback.isCorrect ? (
                    <p style={{ margin: "0 0 8px", color: ss.text, fontSize: "0.875rem" }}>
                      You chose <strong>{currentAnswerFeedback.selectedOption}</strong>. Correct answer is{" "}
                      <strong>{currentAnswerFeedback.correctOption}</strong>.
                    </p>
                  ) : null}
                  <p style={{ margin: 0, color: ss.muted, fontSize: "0.875rem", lineHeight: 1.5 }}>
                    {currentAnswerFeedback.explanation}
                  </p>
                  {currentAnswerFeedback.lessonLink ? (
                    <a
                      href={currentAnswerFeedback.lessonLink}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "inline-block", marginTop: 10, fontSize: "0.875rem", fontWeight: 700, color: ss.primary }}
                    >
                      Watch lesson on SabiScholar
                    </a>
                  ) : null}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
                <button type="button" className="ss-btn" onClick={onPrevious} disabled={currentIndex === 0}>
                  Previous
                </button>
                <button
                  type="button"
                  className="ss-btn"
                  onClick={onNext}
                  disabled={currentIndex >= questions.length - 1}
                >
                  Next
                </button>
                <button type="button" className="ss-btn" onClick={onToggleFlag}>
                  {flaggedIds.includes(currentQuestion.id) ? "Unflag" : "Flag"}
                </button>
                <button type="button" className="ss-btn ss-btn--primary" onClick={onSubmit}>
                  Submit
                </button>
              </div>
            </article>
          ) : null}

          <aside className="ss-exam-navigator">
            <div style={{ fontSize: "0.75rem", color: ss.muted, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
              Question navigator
            </div>
            <div className="ss-exam-grid">
              {questions.map((q, i) => {
                const selected = Boolean(selectedByQuestion[q.id]);
                const flagged = flaggedIds.includes(q.id);
                const active = i === currentIndex;
                return (
                  <button
                    type="button"
                    key={q.id}
                    style={{
                      minHeight: 40,
                      borderRadius: ss.radiusSm,
                      background: gridButtonColor(q),
                      border: `1px solid ${active ? ss.primary : flagged ? ss.warning : selected ? ss.primary : ss.border}`,
                      color: selected || flagged || active ? ss.text : ss.muted,
                      fontWeight: active ? 800 : 600,
                      cursor: "pointer"
                    }}
                    onClick={() => onGoToIndex(i)}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <p style={{ margin: "10px 0 0", fontSize: "0.75rem", color: ss.muted }}>
              Filled = answered, amber = flagged
            </p>
          </aside>
        </div>
      </div>
      {showCalculator ? (
        <div
          className="ss-section"
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            width: 280,
            zIndex: 50,
            margin: 0
          }}
        >
          <strong style={{ fontSize: "0.9375rem" }}>Calculator</strong>
          <input
            value={calcInput}
            onChange={(e) => onCalcInputChange(e.target.value)}
            style={{
              width: "100%",
              marginTop: 10,
              marginBottom: 10,
              fontSize: 16,
              padding: "0.5rem 0.65rem",
              borderRadius: ss.radiusSm,
              border: `1px solid ${ss.border}`
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="ss-btn ss-btn--primary" onClick={onEvalCalc}>
              =
            </button>
            <button type="button" className="ss-btn" onClick={onClearCalc}>
              Clear
            </button>
            <button type="button" className="ss-btn" onClick={onCloseCalculator}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
};
