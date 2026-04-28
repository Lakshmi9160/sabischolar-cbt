import type { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";

function clampQuestionLimit(raw: unknown): number {
  const n = Number(raw ?? 20);
  return Math.min(100, Math.max(1, Number.isFinite(n) ? n : 20));
}

export function mountCatalog(router: Router): void {
  /** Canonical seeded subjects for an exam (JAMB / WAEC / NECO). */
  router.get("/subjects", requireAuth, (req, res) => {
    const raw = String(req.query.examType || "JAMB")
      .trim()
      .toUpperCase();
    const examType = raw === "WAEC" || raw === "NECO" || raw === "JAMB" ? raw : "JAMB";
    const rows = db
      .prepare(
        `SELECT exam_type, subject_code, subject_name FROM subjects WHERE exam_type = ? ORDER BY subject_code ASC`
      )
      .all(examType);
    res.json({ subjects: rows });
  });

  router.get("/questions", requireAuth, (req, res) => {
    const examType = String(req.query.examType || "JAMB");
    const subjectCode = String(req.query.subjectCode || "ENG");
    const topicIdParsed = req.query.topicId != null && String(req.query.topicId) !== "" ? Number(req.query.topicId) : NaN;
    const hasTopic = Number.isFinite(topicIdParsed) && topicIdParsed > 0;
    const yearParsed = req.query.year != null && String(req.query.year) !== "" ? Number(req.query.year) : NaN;
    const hasYear = Number.isFinite(yearParsed) && yearParsed > 0;
    const limit = clampQuestionLimit(req.query.limit);

    const rows =
      hasTopic && hasYear
        ? db
            .prepare(
              `SELECT * FROM questions WHERE exam_type = ? AND subject_code = ? AND topic_id = ? AND year = ? ORDER BY RANDOM() LIMIT ?`
            )
            .all(examType, subjectCode, topicIdParsed, yearParsed, limit)
        : hasTopic
          ? db
              .prepare(
                `SELECT * FROM questions WHERE exam_type = ? AND subject_code = ? AND topic_id = ? ORDER BY RANDOM() LIMIT ?`
              )
              .all(examType, subjectCode, topicIdParsed, limit)
          : hasYear
            ? db
                .prepare(
                  `SELECT * FROM questions WHERE exam_type = ? AND subject_code = ? AND year = ? ORDER BY RANDOM() LIMIT ?`
                )
                .all(examType, subjectCode, yearParsed, limit)
            : db
                .prepare(`SELECT * FROM questions WHERE exam_type = ? AND subject_code = ? ORDER BY RANDOM() LIMIT ?`)
                .all(examType, subjectCode, limit);

    res.json({ questions: rows });
  });

  router.get("/topics", requireAuth, (req, res) => {
    const examType = String(req.query.examType || "JAMB");
    const subjectCode = String(req.query.subjectCode || "ENG");
    const rows = db
      .prepare(
        `SELECT t.id, t.exam_type, t.subject_code, t.topic_name, COUNT(q.id) AS question_count
       FROM topics t
       LEFT JOIN questions q ON q.topic_id = t.id
       WHERE t.exam_type = ? AND t.subject_code = ?
       GROUP BY t.id, t.exam_type, t.subject_code, t.topic_name
       ORDER BY t.topic_name ASC`
      )
      .all(examType, subjectCode);
    res.json({ topics: rows });
  });
}
