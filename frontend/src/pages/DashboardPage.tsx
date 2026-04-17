import React from "react";
import { ExamMode } from "../types";

type Props = {
  onStart: (mode: ExamMode) => void;
  dashboard: {
    recentSessions: Array<{ id: number; exam_type: string; mode: string; status: string }>;
    weakTopics: Array<{
      topic_id: number | null;
      topic_name?: string | null;
      subject_code?: string | null;
      exam_type?: string | null;
      total: number;
      correct: number;
    }>;
  } | null;
  loadDashboard: () => void;
};

export const DashboardPage: React.FC<Props> = ({ onStart, dashboard, loadDashboard }) => {
  return (
    <section>
      <h2>Student Dashboard</h2>
      <p>Welcome back. Choose your mode and continue your streak.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <button onClick={() => onStart("mock")}>Start JAMB Mock</button>
        <button onClick={() => onStart("study")}>Start Study Mode</button>
        <button onClick={() => onStart("drill")}>Start Topic Drill</button>
        <button onClick={loadDashboard}>Refresh Dashboard</button>
      </div>
      {!dashboard ? (
        <p>No dashboard data yet.</p>
      ) : (
        <>
          <h3>Recent sessions</h3>
          <ul>
            {dashboard.recentSessions.map((s) => (
              <li key={s.id}>
                #{s.id} {s.exam_type} - {s.mode} ({s.status})
              </li>
            ))}
          </ul>
          <h3>Weak topics</h3>
          <ul>
            {dashboard.weakTopics.map((t, idx) => {
              const name =
                t.topic_name && t.topic_name.trim()
                  ? `${t.topic_name}${t.subject_code ? ` (${t.subject_code})` : ""}`
                  : t.topic_id != null
                    ? `Topic #${t.topic_id}`
                    : "Uncategorized";
              return (
                <li key={`${t.topic_id ?? "none"}-${idx}`}>
                  {name}: {t.correct}/{t.total}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
};

