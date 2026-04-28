import type { Router } from "express";
import { db } from "../db";
import { AuthedRequest, requireAuth } from "../auth";
import { computePredictedScore } from "../sessionScoring";
import { computeStreakDays, examCountdown, getWatWeekBounds, toSqliteUtc } from "../watTime";

export function mountLeaderboardDashboard(router: Router): void {
  router.get("/leaderboard/weekly", requireAuth, (req: AuthedRequest, res) => {
    const raw = String(req.query.examType || "JAMB")
      .trim()
      .toUpperCase();
    const examType = raw === "WAEC" || raw === "NECO" || raw === "JAMB" ? raw : "JAMB";
    const { weekStart, weekEnd, weekLabel, leaderboardResetsAt } = getWatWeekBounds();
    const startSql = toSqliteUtc(weekStart);
    const endSql = toSqliteUtc(weekEnd);

    const weekFilter = `
    s.mode = 'mock' AND s.status = 'submitted' AND s.exam_type = ?
      AND s.percentage IS NOT NULL
      AND datetime(s.submitted_at) >= datetime(?)
      AND datetime(s.submitted_at) <= datetime(?)
  `;

    const top20 = db
      .prepare(
        `SELECT u.id as user_id, u.full_name,
              ROUND(AVG(s.percentage), 1) as avg_score,
              COUNT(s.id) as session_count
       FROM exam_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE ${weekFilter}
       GROUP BY u.id
       ORDER BY avg_score DESC, session_count DESC
       LIMIT 20`
      )
      .all(examType, startSql, endSql);

    const allRows = db
      .prepare(
        `SELECT u.id as user_id, u.full_name,
              ROUND(AVG(s.percentage), 1) as avg_score,
              COUNT(s.id) as session_count
       FROM exam_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE ${weekFilter}
       GROUP BY u.id
       ORDER BY avg_score DESC, session_count DESC`
      )
      .all(examType, startSql, endSql) as Array<{
      user_id: number;
      full_name: string;
      avg_score: number;
      session_count: number;
    }>;

    const myRank = allRows.findIndex((r) => r.user_id === req.user!.userId);
    res.json({
      timezone: "Africa/Lagos",
      weekLabel,
      weekStartsAt: weekStart.toISOString(),
      weekEndsAt: weekEnd.toISOString(),
      leaderboardResetsAt: leaderboardResetsAt.toISOString(),
      top20,
      me: myRank >= 0 ? { rank: myRank + 1, ...allRows[myRank] } : null
    });
  });

  router.get("/dashboard", requireAuth, (req: AuthedRequest, res) => {
    const userId = req.user!.userId;
    const user = db
      .prepare("SELECT full_name, sabischolar_user_id, target_exam, target_exam_year FROM users WHERE id = ?")
      .get(userId) as
      | { full_name: string; sabischolar_user_id: string | null; target_exam: string | null; target_exam_year: number | null }
      | undefined;

    const recentSessions = db
      .prepare("SELECT id, exam_type, mode, status, started_at, submitted_at FROM exam_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 3")
      .all(userId);

    const targetNorm = (user?.target_exam ?? "").trim().toUpperCase();
    const weakExamScope =
      targetNorm === "JAMB" || targetNorm === "WAEC" || targetNorm === "NECO" ? targetNorm : null;

    // Prefer rollups from topic_stats for speed; fallback to live aggregation for older DBs.
    const weakFromRollupSql = `SELECT ts.topic_id,
              MAX(t.topic_name) AS topic_name,
              MAX(ts.subject_code) AS subject_code,
              MAX(ts.exam_type) AS exam_type,
              SUM(ts.total) AS total,
              SUM(ts.correct) AS correct
       FROM topic_stats ts
       LEFT JOIN topics t ON t.id = ts.topic_id
       WHERE ts.user_id = ?
       __WEAK_EXAM_FILTER__
       GROUP BY ts.topic_key
       ORDER BY (CAST(SUM(ts.correct) AS REAL) / SUM(ts.total)) ASC
       LIMIT 3`;

    const weakFromAnswersSql = `SELECT q.topic_id,
              MAX(t.topic_name) AS topic_name,
              MAX(t.subject_code) AS subject_code,
              MAX(t.exam_type) AS exam_type,
              COUNT(*) AS total,
              SUM(CASE WHEN sa.is_correct = 1 THEN 1 ELSE 0 END) AS correct
       FROM session_answers sa
       JOIN questions q ON q.id = sa.question_id
       JOIN exam_sessions s ON s.id = sa.session_id
       LEFT JOIN topics t ON t.id = q.topic_id
       WHERE s.user_id = ?
       __WEAK_EXAM_FILTER__
       GROUP BY q.topic_id
       ORDER BY (CAST(SUM(CASE WHEN sa.is_correct = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*)) ASC
       LIMIT 3`;

    const weakTopicsFromRollup = weakExamScope
      ? db
          .prepare(weakFromRollupSql.replace("__WEAK_EXAM_FILTER__", "AND ts.exam_type = ?"))
          .all(userId, weakExamScope)
      : db.prepare(weakFromRollupSql.replace("__WEAK_EXAM_FILTER__", "")).all(userId);

    const weakTopics =
      Array.isArray(weakTopicsFromRollup) && weakTopicsFromRollup.length > 0
        ? weakTopicsFromRollup
        : weakExamScope
          ? db
              .prepare(weakFromAnswersSql.replace("__WEAK_EXAM_FILTER__", "AND s.exam_type = ?"))
              .all(userId, weakExamScope)
          : db.prepare(weakFromAnswersSql.replace("__WEAK_EXAM_FILTER__", "")).all(userId);

    const submittedRows = db
      .prepare(`SELECT submitted_at FROM exam_sessions WHERE user_id = ? AND status = 'submitted' AND submitted_at IS NOT NULL`)
      .all(userId) as Array<{ submitted_at: string }>;

    const streakDays = computeStreakDays(submittedRows.map((r) => r.submitted_at));
    const examCountdownPayload = examCountdown(user?.target_exam ?? null, user?.target_exam_year ?? null);

    const lastSubmitted = db
      .prepare(
        `SELECT id FROM exam_sessions WHERE user_id = ? AND status = 'submitted' ORDER BY datetime(submitted_at) DESC LIMIT 1`
      )
      .get(userId) as { id: number } | undefined;

    res.json({
      lastSubmittedSessionId: lastSubmitted?.id ?? null,
      profile: user
        ? {
            fullName: user.full_name,
            sabischolar_user_id: user.sabischolar_user_id,
            targetExam: user.target_exam,
            targetExamYear: user.target_exam_year
          }
        : null,
      recentSessions,
      weakTopics,
      streakDays,
      examCountdown: examCountdownPayload,
      /** Weighted avg % from last up to 3 submitted mocks per exam (`sessionScoring.computePredictedScore`). */
      predictedMockPercentByExam: {
        JAMB: computePredictedScore(userId, "JAMB"),
        WAEC: computePredictedScore(userId, "WAEC"),
        NECO: computePredictedScore(userId, "NECO")
      }
    });
  });
}
