import type { Request, Router } from "express";
import { db } from "../db";
import { AuthedRequest, requireAdmin, requireAuth } from "../auth";

function clampAdminPagination(query: Request["query"]): { limit: number; offset: number } {
  const rawLimit = Number(Array.isArray(query.limit) ? query.limit[0] : query.limit ?? 50);
  const limit = Math.min(200, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));
  const rawOffset = Number(Array.isArray(query.offset) ? query.offset[0] : query.offset ?? 0);
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
  return { limit, offset };
}

type QuestionPayload = {
  exam_type: string;
  subject_code: string;
  topic_id?: number | null;
  year?: number | null;
  question_body: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation: string;
  lesson_link?: string | null;
  difficulty?: string;
  source?: string;
  image_url?: string | null;
};

function validateQuestionPayload(raw: unknown): { ok: true; value: QuestionPayload } | { ok: false; message: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  const exam = String(b.exam_type ?? "").trim().toUpperCase();
  const subject = String(b.subject_code ?? "").trim().toUpperCase();
  const body = String(b.question_body ?? "").trim();
  const a = String(b.option_a ?? "").trim();
  const bb = String(b.option_b ?? "").trim();
  const c = String(b.option_c ?? "").trim();
  const d = String(b.option_d ?? "").trim();
  const correct = String(b.correct_option ?? "").trim().toUpperCase();
  const explanation = String(b.explanation ?? "").trim();

  if (!exam || !subject || !body || !a || !bb || !c || !d || !correct || !explanation) {
    return { ok: false, message: "Missing required question fields." };
  }
  if (!["A", "B", "C", "D"].includes(correct)) {
    return { ok: false, message: "correct_option must be one of A, B, C, D." };
  }
  const topicId = b.topic_id == null || b.topic_id === "" ? null : Number(b.topic_id);
  if (topicId != null && (!Number.isFinite(topicId) || topicId <= 0)) {
    return { ok: false, message: "topic_id must be a positive number when provided." };
  }
  const year = b.year == null || b.year === "" ? null : Number(b.year);
  if (year != null && (!Number.isFinite(year) || year < 1900 || year > 2100)) {
    return { ok: false, message: "year must be a valid number between 1900 and 2100." };
  }

  return {
    ok: true,
    value: {
      exam_type: exam,
      subject_code: subject,
      topic_id: topicId,
      year,
      question_body: body,
      option_a: a,
      option_b: bb,
      option_c: c,
      option_d: d,
      correct_option: correct,
      explanation,
      lesson_link: b.lesson_link == null || String(b.lesson_link).trim() === "" ? null : String(b.lesson_link),
      difficulty: String(b.difficulty ?? "medium").trim() || "medium",
      source: String(b.source ?? "ai_generated").trim() || "ai_generated",
      image_url: b.image_url == null || String(b.image_url).trim() === "" ? null : String(b.image_url)
    }
  };
}

export function mountAdminQuestions(router: Router): void {
  router.get("/admin/questions", requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const examType = req.query.examType ? String(req.query.examType) : null;
    const subjectCode = req.query.subjectCode ? String(req.query.subjectCode) : null;
    const topicIdRaw = req.query.topicId;
    const topicIdParsed = topicIdRaw != null && String(topicIdRaw) !== "" ? Number(topicIdRaw) : NaN;
    const topicId = Number.isFinite(topicIdParsed) && topicIdParsed > 0 ? topicIdParsed : null;
    const { limit, offset } = clampAdminPagination(req.query);

    if (topicId != null && (!examType || !subjectCode)) {
      res.status(400).json({ message: "topicId filter requires examType and subjectCode" });
      return;
    }

    const rows =
      examType && subjectCode && topicId != null
        ? db
            .prepare(
              "SELECT * FROM questions WHERE exam_type = ? AND subject_code = ? AND topic_id = ? ORDER BY id DESC LIMIT ? OFFSET ?"
            )
            .all(examType, subjectCode, topicId, limit, offset)
        : examType && subjectCode
          ? db
              .prepare("SELECT * FROM questions WHERE exam_type = ? AND subject_code = ? ORDER BY id DESC LIMIT ? OFFSET ?")
              .all(examType, subjectCode, limit, offset)
          : examType
            ? db.prepare("SELECT * FROM questions WHERE exam_type = ? ORDER BY id DESC LIMIT ? OFFSET ?").all(examType, limit, offset)
            : db.prepare("SELECT * FROM questions ORDER BY id DESC LIMIT ? OFFSET ?").all(limit, offset);

    const list = rows as unknown[];
    res.json({
      questions: list,
      limit,
      offset,
      returned: list.length,
      hasMore: list.length === limit
    });
  });

  router.post("/admin/questions", requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const parsed = validateQuestionPayload(req.body);
    if (!parsed.ok) {
      res.status(400).json({ message: parsed.message });
      return;
    }
    const q = parsed.value;

    const result = db
      .prepare(
        `INSERT INTO questions (exam_type, subject_code, topic_id, year, question_body, option_a, option_b, option_c, option_d, correct_option, explanation, lesson_link, difficulty, source, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        q.exam_type,
        q.subject_code,
        q.topic_id ?? null,
        q.year ?? null,
        q.question_body,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.correct_option,
        q.explanation,
        q.lesson_link ?? null,
        q.difficulty ?? "medium",
        q.source ?? "ai_generated",
        q.image_url ?? null
      );
    res.json({ id: Number(result.lastInsertRowid) });
  });

  router.put("/admin/questions/:id", requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const questionId = Number(req.params.id);
    if (!Number.isFinite(questionId) || questionId <= 0) {
      res.status(400).json({ message: "Invalid question id." });
      return;
    }
    const parsed = validateQuestionPayload(req.body);
    if (!parsed.ok) {
      res.status(400).json({ message: parsed.message });
      return;
    }
    const q = parsed.value;

    const update = db.prepare(
      `UPDATE questions
       SET exam_type = ?,
           subject_code = ?,
           topic_id = ?,
           year = ?,
           question_body = ?,
           option_a = ?,
           option_b = ?,
           option_c = ?,
           option_d = ?,
           correct_option = ?,
           explanation = ?,
           lesson_link = ?,
           difficulty = ?,
           source = ?,
           image_url = ?
     WHERE id = ?`
    );
    const result = update.run(
      q.exam_type,
      q.subject_code,
      q.topic_id ?? null,
      q.year ?? null,
      q.question_body,
      q.option_a,
      q.option_b,
      q.option_c,
      q.option_d,
      q.correct_option,
      q.explanation,
      q.lesson_link ?? null,
      q.difficulty ?? "medium",
      q.source ?? "ai_generated",
      q.image_url ?? null,
      questionId
    );
    res.json({ ok: result.changes > 0 });
  });

  router.patch("/admin/questions/:id", requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const questionId = Number(req.params.id);
    if (!Number.isFinite(questionId) || questionId <= 0) {
      res.status(400).json({ message: "Invalid question id." });
      return;
    }

    const existing = db.prepare("SELECT * FROM questions WHERE id = ?").get(questionId) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ message: "Question not found." });
      return;
    }

    const merged = { ...existing, ...(req.body as Record<string, unknown>) };
    const parsed = validateQuestionPayload(merged);
    if (!parsed.ok) {
      res.status(400).json({ message: parsed.message });
      return;
    }
    const q = parsed.value;
    const result = db
      .prepare(
        `UPDATE questions
         SET exam_type = ?,
             subject_code = ?,
             topic_id = ?,
             year = ?,
             question_body = ?,
             option_a = ?,
             option_b = ?,
             option_c = ?,
             option_d = ?,
             correct_option = ?,
             explanation = ?,
             lesson_link = ?,
             difficulty = ?,
             source = ?,
             image_url = ?
       WHERE id = ?`
      )
      .run(
        q.exam_type,
        q.subject_code,
        q.topic_id ?? null,
        q.year ?? null,
        q.question_body,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.correct_option,
        q.explanation,
        q.lesson_link ?? null,
        q.difficulty ?? "medium",
        q.source ?? "ai_generated",
        q.image_url ?? null,
        questionId
      );
    res.json({ ok: result.changes > 0 });
  });
}
