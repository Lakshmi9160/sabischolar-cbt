import React from "react";

type TopicRow = { id: number; topic_name: string; question_count: number };

type ExamType = "JAMB" | "WAEC" | "NECO";

type Props = {
  drillExamType: ExamType;
  onDrillExamTypeChange: (exam: ExamType) => void;
  drillSubject: string;
  /** Seeded catalog subjects for the selected exam (must align with backend seed). */
  drillSubjectCodes: readonly string[];
  onDrillSubjectChange: (subject: string) => void;
  drillExplanationMode: "instant" | "deferred";
  onDrillExplanationModeChange: (mode: "instant" | "deferred") => void;
  drillLightTimerEnabled: boolean;
  onDrillLightTimerEnabledChange: (enabled: boolean) => void;
  topics: TopicRow[];
  drillTopicId: number | null;
  setDrillTopicId: (id: number | null) => void;
  drillCount: number;
  setDrillCount: (n: number) => void;
  onStartDrill: () => void;
};

export const DrillSetupPage: React.FC<Props> = ({
  drillExamType,
  onDrillExamTypeChange,
  drillSubject,
  drillSubjectCodes,
  onDrillSubjectChange,
  drillExplanationMode,
  onDrillExplanationModeChange,
  drillLightTimerEnabled,
  onDrillLightTimerEnabledChange,
  topics,
  drillTopicId,
  setDrillTopicId,
  drillCount,
  setDrillCount,
  onStartDrill
}) => (
    <>
      <h1 className="ss-page-title">Topic drill</h1>
      <div className="ss-section" style={{ maxWidth: 400 }}>
        <div className="ss-field">
          <label htmlFor="drill-exam">Exam</label>
          <select
            id="drill-exam"
            value={drillExamType}
            onChange={(e) => onDrillExamTypeChange(e.target.value as ExamType)}
          >
            <option value="JAMB">JAMB</option>
            <option value="WAEC">WAEC</option>
            <option value="NECO">NECO</option>
          </select>
        </div>
        <div className="ss-field">
          <label htmlFor="drill-subject">Subject</label>
          <select
            id="drill-subject"
            value={drillSubject}
            onChange={(e) => {
              const next = e.target.value;
              onDrillSubjectChange(next);
            }}
          >
            {drillSubjectCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <div className="ss-field">
          <label htmlFor="drill-topic">Topic</label>
          <select
            id="drill-topic"
            value={drillTopicId ?? ""}
            onChange={(e) => setDrillTopicId(Number(e.target.value))}
          >
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.topic_name} ({t.question_count})
              </option>
            ))}
          </select>
        </div>
        <div className="ss-field">
          <label htmlFor="drill-count">Question count</label>
          <select id="drill-count" value={drillCount} onChange={(e) => setDrillCount(Number(e.target.value))}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={30}>30</option>
            <option value={50}>50</option>
          </select>
        </div>
        <div className="ss-field">
          <label htmlFor="drill-explanation">Explanation mode</label>
          <select
            id="drill-explanation"
            value={drillExplanationMode}
            onChange={(e) => onDrillExplanationModeChange(e.target.value as "instant" | "deferred")}
          >
            <option value="instant">Instant (after each answer)</option>
            <option value="deferred">Deferred (review later)</option>
          </select>
        </div>
        <div className="ss-field">
          <label htmlFor="drill-light-timer">Timer style</label>
          <select
            id="drill-light-timer"
            value={drillLightTimerEnabled ? "light" : "off"}
            onChange={(e) => onDrillLightTimerEnabledChange(e.target.value === "light")}
          >
            <option value="light">Light timer enabled</option>
            <option value="off">No timer</option>
          </select>
        </div>
        <button type="button" className="ss-btn ss-btn--primary" onClick={onStartDrill}>
          Start drill
        </button>
      </div>
    </>
);
