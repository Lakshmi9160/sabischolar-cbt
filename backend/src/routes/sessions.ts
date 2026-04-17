import type { Router } from "express";
import { db } from "../db";
import { AuthedRequest, requireAuth } from "../auth";
import { buildWrongAnswers, computePredictedScore, finalizeSession, parseJsonArray } from "../sessionScoring";

const ALLOWED_DRILL_COUNTS = new Set([10, 20, 30, 50]);
const WAEC_NECO_DEFAULT_DURATION_SECONDS = 60 * 60;

export function mountSessions(router: Router): void {
  router.post("/sessions", requireAuth, (req: AuthedRequest, res) => {
    const { examType, mode, subjectCodes, questionIds, durationSeconds, explanationMode, lightTimerEnabled, topicIds, questionCount } =
      req.body;
    const normalizedSubjects = Array.from(new Set((subjectCodes ?? []).map((s: string) => String(s).toUpperCase())));
    let resolvedQuestionIds: number[] = Array.isArray(questionIds) ? questionIds.map((q: number) => Number(q)) : [];
    let resolvedDuration = Number(durationSeconds ?? 0);

    if (!examType || !mode) {
      res.status(400).json({ message: "examType and mode are required" });
      return;
    }

    if (mode === "mock" && examType === "JAMB") {
      if (normalizedSubjects.length !== 4 || !normalizedSubjects.includes("ENG")) {
        res.status(400).json({ message: "JAMB mock requires ENG + 3 other subjects (total 4)" });
        return;
      }
      resolvedDuration = 2 * 60 * 60;
      if (resolvedQuestionIds.length === 0) {
        const ids: number[] = [];
        for (const subject of normalizedSubjects) {
          const rows = db
            .prepare("SELECT id FROM questions WHERE exam_type = 'JAMB' AND subject_code = ? ORDER BY RANDOM() LIMIT 25")
            .all(subject) as Array<{ id: number }>;
          if (rows.length < 25) {
            res.status(400).json({ message: `Not enough JAMB questions for subject ${subject}. Need at least 25.` });
            return;
          }
          ids.push(...rows.map((r) => r.id));
        }
        resolvedQuestionIds = ids;
      }
      if (resolvedQuestionIds.length !== 100) {
        res.status(400).json({ message: "JAMB mock must contain exactly 100 questions." });
        return;
      }
    }

    if (mode === "mock" && (examType === "WAEC" || examType === "NECO")) {
      if (normalizedSubjects.length !== 1) {
        res.status(400).json({ message: `${examType} mock is per-subject and requires exactly one subject code.` });
        return;
      }
      if (resolvedDuration <= 0) resolvedDuration = WAEC_NECO_DEFAULT_DURATION_SECONDS;
      if (resolvedQuestionIds.length === 0) {
        const rows = db
          .prepare("SELECT id FROM questions WHERE exam_type = ? AND subject_code = ? ORDER BY RANDOM() LIMIT 50")
          .all(examType, normalizedSubjects[0]) as Array<{ id: number }>;
        resolvedQuestionIds = rows.map((r) => r.id);
      }
    }

    if (mode === "study") {
      resolvedDuration = 0;
      if (resolvedQuestionIds.length === 0) {
        const primarySubject = normalizedSubjects[0] || "ENG";
        const rows = db
          .prepare("SELECT id FROM questions WHERE exam_type = ? AND subject_code = ? ORDER BY RANDOM() LIMIT 20")
          .all(examType, primarySubject) as Array<{ id: number }>;
        resolvedQuestionIds = rows.map((r) => r.id);
      }
    }

    if (mode === "drill") {
      if (normalizedSubjects.length !== 1) {
        res.status(400).json({ message: "Topic drill requires exactly one subject." });
        return;
      }
      const count = Number(questionCount ?? 10);
      if (!ALLOWED_DRILL_COUNTS.has(count)) {
        res.status(400).json({ message: "Topic drill questionCount must be one of 10, 20, 30, or 50." });
        return;
      }
      const topicId = Number(Array.isArray(topicIds) ? topicIds[0] : null);
      if (!topicId) {
        res.status(400).json({ message: "Topic drill requires a topicIds array with one topic id." });
        return;
      }
      if (resolvedQuestionIds.length === 0) {
        const rows = db
          .prepare(
            "SELECT id FROM questions WHERE exam_type = ? AND subject_code = ? AND topic_id = ? ORDER BY RANDOM() LIMIT ?"
          )
          .all(examType, normalizedSubjects[0], topicId, count) as Array<{ id: number }>;
        resolvedQuestionIds = rows.map((r) => r.id);
      }
    }

    if (resolvedQuestionIds.length === 0) {
      res.status(400).json({ message: "No questions selected for this session." });
      return;
    }

    db.prepare(`UPDATE exam_sessions SET status = 'abandoned' WHERE user_id = ? AND status = 'in_progress'`).run(
      req.user!.userId
    );

    const result = db
      .prepare(
        `INSERT INTO exam_sessions (
        user_id, exam_type, mode, duration_seconds, remaining_seconds, subject_codes_json, question_ids_json, explanation_mode, light_timer_enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user!.userId,
        examType,
        mode,
        resolvedDuration,
        resolvedDuration,
        JSON.stringify(normalizedSubjects),
        JSON.stringify(resolvedQuestionIds),
        explanationMode ?? "deferred",
        lightTimerEnabled ? 1 : 0
      );

    res.json({
      sessionId: Number(result.lastInsertRowid),
      durationSeconds: resolvedDuration,
      questionCount: resolvedQuestionIds.length
    });
  });

  router.get("/sessions/active", requireAuth, (req: AuthedRequest, res) => {
    const row = db
      .prepare(
        `SELECT id, exam_type, mode, remaining_seconds, current_question_index, flagged_question_ids_json, explanation_mode, light_timer_enabled
         FROM exam_sessions
         WHERE user_id = ? AND status = 'in_progress'
         ORDER BY id DESC
         LIMIT 1`
      )
      .get(req.user!.userId) as
      | {
          id: number;
          exam_type: string;
          mode: string;
          remaining_seconds: number;
          current_question_index: number;
          flagged_question_ids_json: string;
          explanation_mode: string;
          light_timer_enabled: number;
        }
      | undefined;

    if (!row) {
      res.json({ session: null });
      return;
    }

    const flaggedQuestionIds = parseJsonArray<number>(row.flagged_question_ids_json);
    const answerRows = db
      .prepare(`SELECT question_id, selected_option FROM session_answers WHERE session_id = ?`)
      .all(row.id) as Array<{ question_id: number; selected_option: string | null }>;

    const answersByQuestionId: Record<string, string> = {};
    for (const a of answerRows) {
      if (a.selected_option != null && a.selected_option !== "") {
        answersByQuestionId[String(a.question_id)] = a.selected_option;
      }
    }

    res.json({
      session: {
        id: row.id,
        examType: row.exam_type,
        mode: row.mode,
        remainingSeconds: Number(row.remaining_seconds ?? 0),
        currentQuestionIndex: Number(row.current_question_index ?? 0),
        flaggedQuestionIds,
        answersByQuestionId,
        explanationMode: row.explanation_mode || "deferred",
        lightTimerEnabled: Boolean(row.light_timer_enabled)
      }
    });
  });

  router.patch("/sessions/:id/progress", requireAuth, (req: AuthedRequest, res) => {
    const sessionId = Number(req.params.id);
    const { currentQuestionIndex, remainingSeconds, flaggedQuestionIds } = req.body;
    const nextRemaining = Number(remainingSeconds || 0);

    const meta = db
      .prepare("SELECT duration_seconds, status FROM exam_sessions WHERE id = ? AND user_id = ?")
      .get(sessionId, req.user!.userId) as { duration_seconds: number; status: string } | undefined;

    if (!meta || meta.status !== "in_progress") {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    const durationSeconds = Number(meta.duration_seconds || 0);
    const isTimedSession = durationSeconds > 0;

    // Only auto-submit when the countdown actually reached zero for a timed (e.g. mock) exam.
    // Study / drill use remaining_seconds === 0 by design; they must not finalize on every navigation.
    if (isTimedSession && nextRemaining <= 0) {
      db.prepare(
        "UPDATE exam_sessions SET current_question_index = ?, remaining_seconds = 0, flagged_question_ids_json = ? WHERE id = ? AND user_id = ? AND status = 'in_progress'"
      ).run(Number(currentQuestionIndex || 0), JSON.stringify(flaggedQuestionIds ?? []), sessionId, req.user!.userId);
      const result = finalizeSession(sessionId, req.user!.userId);
      res.json({ ok: true, autoSubmitted: true, result });
      return;
    }

    db.prepare(
      "UPDATE exam_sessions SET current_question_index = ?, remaining_seconds = ?, flagged_question_ids_json = ? WHERE id = ? AND user_id = ?"
    ).run(
      Number(currentQuestionIndex || 0),
      Math.max(0, nextRemaining),
      JSON.stringify(flaggedQuestionIds ?? []),
      sessionId,
      req.user!.userId
    );
    res.json({ ok: true });
  });

  router.get("/sessions/:id/questions", requireAuth, (req: AuthedRequest, res) => {
    const sessionId = Number(req.params.id);
    const session = db
      .prepare("SELECT question_ids_json FROM exam_sessions WHERE id = ? AND user_id = ?")
      .get(sessionId, req.user!.userId) as { question_ids_json: string } | undefined;
    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    const questionIds = parseJsonArray<number>(session.question_ids_json);
    if (questionIds.length === 0) {
      res.json({ questions: [] });
      return;
    }

    const placeholders = questionIds.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT id, exam_type, subject_code, topic_id, year, question_body, option_a, option_b, option_c, option_d, image_url
       FROM questions WHERE id IN (${placeholders})`
      )
      .all(...questionIds) as Array<{
      id: number;
      exam_type: string;
      subject_code: string;
      topic_id: number | null;
      year: number | null;
      question_body: string;
      option_a: string;
      option_b: string;
      option_c: string;
      option_d: string;
      image_url: string | null;
    }>;

    const order = new Map<number, number>();
    questionIds.forEach((id, idx) => order.set(id, idx));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    res.json({ questions: rows });
  });

  router.post("/sessions/:id/answers", requireAuth, (req, res) => {
    const sessionId = Number(req.params.id);
    const { questionId, selectedOption, timeSpentSeconds } = req.body;
    const session = db
      .prepare("SELECT status FROM exam_sessions WHERE id = ?")
      .get(sessionId) as { status: string } | undefined;
    if (!session || session.status !== "in_progress") {
      res.status(409).json({ message: "Session is not in progress." });
      return;
    }
    const q = db
      .prepare("SELECT correct_option, explanation, lesson_link FROM questions WHERE id = ?")
      .get(questionId) as { correct_option: string; explanation: string; lesson_link: string | null } | undefined;
    if (!q) {
      res.status(404).json({ message: "Question not found" });
      return;
    }
    const isCorrect = q.correct_option === selectedOption ? 1 : 0;
    db.prepare(
      `INSERT INTO session_answers (session_id, question_id, selected_option, is_correct, time_spent_seconds)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id, question_id) DO UPDATE SET
       selected_option = excluded.selected_option,
       is_correct = excluded.is_correct,
       time_spent_seconds = excluded.time_spent_seconds`
    ).run(sessionId, questionId, selectedOption, isCorrect, Number(timeSpentSeconds || 0));
    res.json({
      ok: true,
      isCorrect: Boolean(isCorrect),
      correctOption: q.correct_option,
      explanation: q.explanation,
      lessonLink: q.lesson_link
    });
  });

  router.post("/sessions/:id/submit", requireAuth, (req: AuthedRequest, res) => {
    const sessionId = Number(req.params.id);
    const result = finalizeSession(sessionId, req.user!.userId);
    if (!result) {
      res.status(404).json({ message: "Session not found" });
      return;
    }
    res.json(result);
  });

  router.get("/sessions/:id/result", requireAuth, (req: AuthedRequest, res) => {
    const sessionId = Number(req.params.id);
    const session = db
      .prepare(
        `SELECT id, exam_type, mode, status, score, total_questions, percentage, pass_fail, subject_breakdown_json, topic_breakdown_json, time_per_question_json
       FROM exam_sessions WHERE id = ? AND user_id = ?`
      )
      .get(sessionId, req.user!.userId) as
      | {
          id: number;
          exam_type: string;
          mode: string;
          status: string;
          score: number;
          total_questions: number;
          percentage: number;
          pass_fail: string | null;
          subject_breakdown_json: string | null;
          topic_breakdown_json: string | null;
          time_per_question_json: string | null;
        }
      | undefined;

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    const pct = Number(session.percentage || 0);
    const scaledJamb = session.exam_type === "JAMB" ? Math.round((pct / 100) * 400) : null;

    res.json({
      sessionId: session.id,
      examType: session.exam_type,
      mode: session.mode,
      status: session.status,
      score: session.score,
      total: session.total_questions,
      percentage: session.percentage,
      passFail: session.pass_fail,
      scaledJambScore: scaledJamb,
      subjectBreakdown: parseJsonArray(session.subject_breakdown_json),
      topicBreakdown: parseJsonArray(session.topic_breakdown_json),
      timePerQuestion: parseJsonArray(session.time_per_question_json),
      predictedScore: computePredictedScore(req.user!.userId, session.exam_type),
      wrongAnswers: buildWrongAnswers(session.id)
    });
  });
}
