import { db } from "./db";

type AnswerJoinRow = {
  question_id: number;
  selected_option: string;
  is_correct: number;
  time_spent_seconds: number;
  correct_option: string;
  explanation: string;
  lesson_link: string | null;
  subject_code: string;
  topic_id: number | null;
};

export function parseJsonArray<T>(raw: string | null | undefined): T[] {
  try {
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

export function isAdminUser(userId: number): boolean {
  const row = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(userId) as { is_admin: number } | undefined;
  return Boolean(row?.is_admin);
}

export function computePredictedScore(userId: number, examType: string): number | null {
  const rows = db
    .prepare(
      `SELECT percentage FROM exam_sessions
       WHERE user_id = ? AND exam_type = ? AND mode = 'mock' AND status = 'submitted'
       ORDER BY datetime(submitted_at) DESC
       LIMIT 3`
    )
    .all(userId, examType) as Array<{ percentage: number }>;

  if (rows.length === 0) return null;

  const weights = [0.5, 0.3, 0.2];
  let weighted = 0;
  let totalWeight = 0;
  rows.forEach((r, idx) => {
    const w = weights[idx] ?? 0.2;
    weighted += Number(r.percentage || 0) * w;
    totalWeight += w;
  });

  return Number((weighted / totalWeight).toFixed(1));
}

export function buildWrongAnswers(sessionId: number): Array<{
  questionId: number;
  selectedOption: string;
  correctOption: string;
  explanation: string;
  lesson_link: string | null;
}> {
  const session = db
    .prepare("SELECT question_ids_json FROM exam_sessions WHERE id = ?")
    .get(sessionId) as { question_ids_json: string } | undefined;
  if (!session) return [];

  const questionIds = parseJsonArray<number>(session.question_ids_json);
  const answers = db
    .prepare(`SELECT question_id, selected_option, is_correct FROM session_answers WHERE session_id = ?`)
    .all(sessionId) as Array<{ question_id: number; selected_option: string; is_correct: number }>;
  const answerByQid = new Map(answers.map((a) => [a.question_id, a]));

  const idsToScan = questionIds.length > 0 ? questionIds : [...new Set(answers.map((a) => a.question_id))];

  const qStmt = db.prepare(`SELECT id, correct_option, explanation, lesson_link FROM questions WHERE id = ?`);

  const wrong: Array<{
    questionId: number;
    selectedOption: string;
    correctOption: string;
    explanation: string;
    lesson_link: string | null;
  }> = [];

  for (const qid of idsToScan) {
    const ans = answerByQid.get(qid);
    if (ans && ans.is_correct === 1) continue;

    const q = qStmt.get(qid) as
      | { id: number; correct_option: string; explanation: string; lesson_link: string | null }
      | undefined;
    if (!q) continue;

    wrong.push({
      questionId: qid,
      selectedOption: ans?.selected_option ?? "(not answered)",
      correctOption: q.correct_option,
      explanation: q.explanation,
      lesson_link: q.lesson_link
    });
  }

  return wrong;
}

export function finalizeSession(sessionId: number, userId: number) {
  const session = db
    .prepare("SELECT id, user_id, exam_type, mode, status, question_ids_json FROM exam_sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, userId) as
    | { id: number; user_id: number; exam_type: string; mode: string; status: string; question_ids_json: string }
    | undefined;

  if (!session) return null;

  const rows = db
    .prepare(
      `SELECT sa.question_id, sa.selected_option, sa.is_correct, sa.time_spent_seconds, q.correct_option, q.explanation, q.lesson_link, q.subject_code, q.topic_id
       FROM session_answers sa JOIN questions q ON q.id = sa.question_id WHERE sa.session_id = ?`
    )
    .all(sessionId) as AnswerJoinRow[];

  const answerByQid = new Map(rows.map((r) => [r.question_id, r]));
  let plannedIds = parseJsonArray<number>(session.question_ids_json);
  if (plannedIds.length === 0) {
    plannedIds = rows.map((r) => r.question_id);
  }

  const total = plannedIds.length > 0 ? plannedIds.length : rows.length;
  let correct = 0;
  const subjectAgg = new Map<string, { total: number; correct: number }>();
  const topicAgg = new Map<string, { subject_code: string; topic_id: number | null; total: number; correct: number }>();
  const timePerQuestion: Array<{ question_id: number; time_spent_seconds: number }> = [];

  let metaById = new Map<number, { id: number; subject_code: string; topic_id: number | null }>();
  if (plannedIds.length > 0) {
    const placeholders = plannedIds.map(() => "?").join(",");
    const metas = db
      .prepare(`SELECT id, subject_code, topic_id FROM questions WHERE id IN (${placeholders})`)
      .all(...plannedIds) as Array<{ id: number; subject_code: string; topic_id: number | null }>;
    metaById = new Map(metas.map((m) => [m.id, m]));
  }

  for (const qid of plannedIds) {
    const ans = answerByQid.get(qid);
    const answeredCorrect = Boolean(ans && ans.is_correct === 1);
    if (answeredCorrect) correct += 1;

    const meta = metaById.get(qid);
    const subjectCode = meta?.subject_code ?? "UNKNOWN";
    const topicId = meta?.topic_id ?? null;

    const subject = subjectAgg.get(subjectCode) || { total: 0, correct: 0 };
    subject.total += 1;
    subject.correct += answeredCorrect ? 1 : 0;
    subjectAgg.set(subjectCode, subject);

    const topicKey = `${subjectCode}:${topicId ?? "none"}`;
    const topic = topicAgg.get(topicKey) || { subject_code: subjectCode, topic_id: topicId, total: 0, correct: 0 };
    topic.total += 1;
    topic.correct += answeredCorrect ? 1 : 0;
    topicAgg.set(topicKey, topic);

    timePerQuestion.push({ question_id: qid, time_spent_seconds: ans?.time_spent_seconds ?? 0 });
  }

  const percentage = total > 0 ? Number(((correct / total) * 100).toFixed(1)) : 0;
  const scaledJambScore = Math.round((percentage / 100) * 400);
  const passFail =
    session.exam_type === "JAMB" && session.mode === "mock"
      ? scaledJambScore >= 200
        ? "pass"
        : "fail"
      : percentage >= 50
        ? "pass"
        : "fail";

  const subjectBreakdown = Array.from(subjectAgg.entries()).map(([subject_code, v]) => ({
    subject_code,
    total: v.total,
    correct: v.correct,
    percentage: Number(((v.correct / Math.max(v.total, 1)) * 100).toFixed(1))
  }));

  const topicBreakdown = Array.from(topicAgg.values()).map((v) => ({
    subject_code: v.subject_code,
    topic_id: v.topic_id,
    total: v.total,
    correct: v.correct,
    percentage: Number(((v.correct / Math.max(v.total, 1)) * 100).toFixed(1))
  }));

  const saveStatsTx = db.transaction(() => {
    db.prepare(
      `UPDATE exam_sessions
         SET status = 'submitted',
             submitted_at = CURRENT_TIMESTAMP,
             score = ?,
             total_questions = ?,
             percentage = ?,
             pass_fail = ?,
             subject_breakdown_json = ?,
             topic_breakdown_json = ?,
             time_per_question_json = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      correct,
      total,
      percentage,
      passFail,
      JSON.stringify(subjectBreakdown),
      JSON.stringify(topicBreakdown),
      JSON.stringify(timePerQuestion),
      sessionId,
      userId
    );

    const submittedAt = db
      .prepare("SELECT submitted_at FROM exam_sessions WHERE id = ?")
      .get(sessionId) as { submitted_at: string } | undefined;
    const submittedAtIso = submittedAt?.submitted_at ?? new Date().toISOString();

    db.prepare(
      `INSERT INTO session_stats
         (session_id, user_id, exam_type, mode, score, total_questions, percentage, pass_fail, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         score = excluded.score,
         total_questions = excluded.total_questions,
         percentage = excluded.percentage,
         pass_fail = excluded.pass_fail,
         submitted_at = excluded.submitted_at`
    ).run(sessionId, userId, session.exam_type, session.mode, correct, total, percentage, passFail, submittedAtIso);

    const upsertTopic = db.prepare(
      `INSERT INTO topic_stats
         (session_id, user_id, exam_type, mode, subject_code, topic_id, topic_key, total, correct, percentage, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, topic_key) DO UPDATE SET
         total = excluded.total,
         correct = excluded.correct,
         percentage = excluded.percentage,
         submitted_at = excluded.submitted_at`
    );

    db.prepare("DELETE FROM topic_stats WHERE session_id = ?").run(sessionId);

    for (const row of topicBreakdown) {
      const topicKey = `${row.subject_code}:${row.topic_id ?? "none"}`;
      upsertTopic.run(
        sessionId,
        userId,
        session.exam_type,
        session.mode,
        row.subject_code,
        row.topic_id,
        topicKey,
        row.total,
        row.correct,
        row.percentage,
        submittedAtIso
      );
    }
  });

  saveStatsTx();

  return {
    sessionId,
    examType: session.exam_type,
    mode: session.mode,
    status: "submitted",
    score: correct,
    total,
    percentage,
    passFail,
    scaledJambScore: session.exam_type === "JAMB" ? scaledJambScore : null,
    subjectBreakdown,
    topicBreakdown,
    timePerQuestion,
    predictedScore: computePredictedScore(userId, session.exam_type),
    wrongAnswers: buildWrongAnswers(sessionId)
  };
}
