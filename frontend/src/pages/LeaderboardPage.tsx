import React from "react";
import { Link } from "react-router-dom";
import { ss } from "../theme";

type LeaderRow = { user_id?: number; full_name: string; avg_score: number; session_count?: number };

type Meta = {
  timezone: string;
  weekLabel: string;
  weekStartsAt: string;
  weekEndsAt: string;
  leaderboardResetsAt: string;
  me: { rank: number; full_name: string; avg_score: number; session_count?: number } | null;
};

type ExamType = "JAMB" | "WAEC" | "NECO";

type Props = {
  leaderboard: LeaderRow[];
  leaderboardMeta: Meta | null;
  examType: ExamType;
  onExamTypeChange: (exam: ExamType) => void;
  loading?: boolean;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function podiumSlots(rows: LeaderRow[]): Array<{ row: LeaderRow; place: 1 | 2 | 3 }> {
  if (rows.length === 0) return [];
  if (rows.length === 1) return [{ row: rows[0], place: 1 }];
  if (rows.length === 2) {
    return [
      { row: rows[1], place: 2 },
      { row: rows[0], place: 1 }
    ];
  }
  return [
    { row: rows[1], place: 2 },
    { row: rows[0], place: 1 },
    { row: rows[2], place: 3 }
  ];
}

const podiumLabel: Record<1 | 2 | 3, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd"
};

function Avatar({
  name,
  size = 44,
  accent
}: {
  name: string;
  size?: number;
  accent?: string;
}) {
  const bg = accent ?? `linear-gradient(135deg, ${ss.primaryMuted} 0%, ${ss.primarySoft} 100%)`;
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: "50%",
        background: bg,
        border: `2px solid ${ss.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size > 40 ? "0.9375rem" : "0.8125rem",
        fontWeight: 800,
        color: ss.text,
        letterSpacing: "-0.02em"
      }}
    >
      {initials(name)}
    </div>
  );
}

export const LeaderboardPage: React.FC<Props> = ({
  leaderboard,
  leaderboardMeta,
  examType,
  onExamTypeChange,
  loading = false
}) => {
  const slots = podiumSlots(leaderboard);
  const allRows = leaderboard;
  const weeklyAverage =
    allRows.length > 0 ? Number((allRows.reduce((sum, r) => sum + Number(r.avg_score || 0), 0) / allRows.length).toFixed(1)) : 0;
  const resetLabel = leaderboardMeta
    ? new Date(leaderboardMeta.leaderboardResetsAt).toLocaleString(undefined, {
        timeZone: leaderboardMeta.timezone,
        dateStyle: "medium",
        timeStyle: "short"
      })
    : "";

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", paddingBottom: "2rem" }}>
      <div
        className="ss-section"
        style={{
          marginBottom: "1rem",
          border: `1px solid #e6e8ee`,
          borderRadius: ss.radiusLg,
          boxShadow: "0 1px 2px rgba(12,18,34,0.04), 0 10px 28px rgba(12,18,34,0.04)"
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                marginBottom: 6,
                fontSize: "0.75rem",
                color: "#667085",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 700
              }}
            >
              Weekly performance
            </div>
            <h1 className="ss-page-title" style={{ margin: "0 0 6px" }}>
              Leaderboard
            </h1>
            <p style={{ margin: 0, color: "#667085", fontSize: "0.9375rem" }}>
              Data-first ranking view for {examType} mock sessions.
            </p>
          </div>
          <div className="ss-field" style={{ marginBottom: 0, minWidth: 170 }}>
            <label htmlFor="lb-exam-type">Exam type</label>
            <select id="lb-exam-type" value={examType} onChange={(e) => onExamTypeChange(e.target.value as ExamType)}>
              <option value="JAMB">JAMB</option>
              <option value="WAEC">WAEC</option>
              <option value="NECO">NECO</option>
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          <div style={{ background: "#f8f9fc", border: "1px solid #e6e8ee", borderRadius: ss.radiusSm, padding: "0.7rem 0.8rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#667085", marginBottom: 2 }}>Participants</div>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>{allRows.length}</div>
          </div>
          <div style={{ background: "#f8f9fc", border: "1px solid #e6e8ee", borderRadius: ss.radiusSm, padding: "0.7rem 0.8rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#667085", marginBottom: 2 }}>Weekly average</div>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>{weeklyAverage}%</div>
          </div>
          <div style={{ background: "#f8f9fc", border: "1px solid #e6e8ee", borderRadius: ss.radiusSm, padding: "0.7rem 0.8rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#667085", marginBottom: 2 }}>Your rank</div>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
              {leaderboardMeta?.me ? `#${leaderboardMeta.me.rank}` : "-"}
            </div>
          </div>
        </div>
      </div>

      {leaderboardMeta && !loading ? (
        <div
          className="ss-section"
          style={{
            marginBottom: "1rem",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <div
              style={{
                padding: "8px 10px",
                borderRadius: ss.radiusSm,
                border: "1px solid #e6e8ee",
                background: "#f8f9fc",
                fontSize: "0.8125rem"
              }}
            >
              <strong>Week:</strong> {leaderboardMeta.weekLabel}
            </div>
            <div
              style={{
                padding: "8px 10px",
                borderRadius: ss.radiusSm,
                border: "1px solid #e6e8ee",
                background: "#f8f9fc",
                fontSize: "0.8125rem"
              }}
            >
              <strong>Resets:</strong> {resetLabel} ({leaderboardMeta.timezone})
            </div>
          </div>
          <Link to="/dashboard" className="ss-btn ss-btn--primary" style={{ textDecoration: "none", display: "inline-flex" }}>
            Take a mock
          </Link>
        </div>
      ) : null}

      {!loading && leaderboardMeta ? (
        <div
          className="ss-section"
          style={{
            marginBottom: "1rem",
            border: `1px solid ${leaderboardMeta.me ? "#d6e9ff" : "#e6e8ee"}`,
            background: leaderboardMeta.me ? "#f5f9ff" : ss.surface
          }}
        >
          {leaderboardMeta.me ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Avatar name={leaderboardMeta.me.full_name} size={44} accent="linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)" />
              <div>
                <div style={{ fontSize: "0.75rem", color: "#2563eb", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Your position
                </div>
                <div style={{ fontSize: "1.125rem", fontWeight: 800 }}>
                  #{leaderboardMeta.me.rank} <span style={{ color: "#667085", fontWeight: 600 }}>- {leaderboardMeta.me.avg_score}% average</span>
                </div>
                <div style={{ fontSize: "0.875rem", color: "#667085" }}>{leaderboardMeta.me.session_count ?? 0} mocks submitted</div>
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, color: "#667085", fontSize: "0.9375rem" }}>
              Submit at least one mock this week to appear in rankings.
            </p>
          )}
        </div>
      ) : null}

      <div className="ss-section" style={{ borderRadius: ss.radiusLg }}>
        {loading ? (
          <p className="ss-muted-line">Loading leaderboard...</p>
        ) : allRows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "1rem 0.5rem" }}>
            <p style={{ margin: "0 0 6px", fontSize: "1rem", fontWeight: 700 }}>No rankings yet</p>
            <p style={{ margin: 0, color: "#667085", fontSize: "0.875rem" }}>When mocks are submitted, rankings appear here.</p>
          </div>
        ) : (
          <>
            {slots.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}>
                {slots
                  .slice()
                  .sort((a, b) => a.place - b.place)
                  .map(({ row, place }) => (
                    <div
                      key={`${row.full_name}-${place}`}
                      style={{
                        border: "1px solid #e6e8ee",
                        borderTop: `3px solid ${place === 1 ? "#2563eb" : "#d0d5dd"}`,
                        borderRadius: ss.radiusSm,
                        background: "#fafbff",
                        padding: "0.75rem"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar name={row.full_name} size={36} accent="linear-gradient(135deg, #eef2ff 0%, #dbeafe 100%)" />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "0.75rem", color: "#667085", fontWeight: 700 }}>{podiumLabel[place]}</div>
                          <div
                            style={{
                              fontWeight: 700,
                              color: ss.text,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: "100%"
                            }}
                            title={row.full_name}
                          >
                            {row.full_name}
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                        <span style={{ color: "#667085" }}>Average</span>
                        <strong>{row.avg_score}%</strong>
                      </div>
                      <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "#667085" }}>
                        <span>Mocks</span>
                        <span>{row.session_count ?? 0}</span>
                      </div>
                    </div>
                  ))}
              </div>
            ) : null}

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e6e8ee" }}>
                    <th style={{ textAlign: "left", padding: "0.65rem 0.4rem", fontSize: "0.75rem", color: "#667085", fontWeight: 700 }}>Rank</th>
                    <th style={{ textAlign: "left", padding: "0.65rem 0.4rem", fontSize: "0.75rem", color: "#667085", fontWeight: 700 }}>Student</th>
                    <th style={{ textAlign: "left", padding: "0.65rem 0.4rem", fontSize: "0.75rem", color: "#667085", fontWeight: 700 }}>Average</th>
                    <th style={{ textAlign: "right", padding: "0.65rem 0.4rem", fontSize: "0.75rem", color: "#667085", fontWeight: 700 }}>Mocks</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((row, index) => {
                    const rank = index + 1;
                    const pct = Math.max(0, Math.min(100, Number(row.avg_score) || 0));
                    return (
                      <tr key={`${row.full_name}-${rank}`} style={{ borderTop: "1px solid #eef1f5" }}>
                        <td style={{ padding: "0.85rem 0.4rem", fontWeight: 700, color: "#667085", fontVariantNumeric: "tabular-nums" }}>{rank}</td>
                        <td style={{ padding: "0.8rem 0.4rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Avatar name={row.full_name} size={32} accent="linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)" />
                            <span style={{ fontWeight: 700, color: ss.text }}>{row.full_name}</span>
                          </div>
                        </td>
                        <td style={{ padding: "0.8rem 0.4rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ minWidth: 46, fontWeight: 700 }}>{row.avg_score}%</span>
                            <div style={{ height: 6, width: 120, background: "#e7ebf3", borderRadius: 99, overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: "#2563eb", borderRadius: 99 }} />
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "0.8rem 0.4rem", textAlign: "right", color: "#667085" }}>{row.session_count ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
