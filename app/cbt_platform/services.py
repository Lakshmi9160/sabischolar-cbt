"""Service layer for auth, question delivery, sessions, results, and leaderboard."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import UTC, date, datetime, timedelta

from .contracts import CreateSessionInput, QuestionDTO, QuestionOptionDTO, RegisterUserInput, SessionResultDTO, UserProfileInput


def _b64url_encode(raw: bytes) -> str:
    return urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64url_decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return urlsafe_b64decode(raw + padding)


def exam_countdown_from_profile(target_exam: str | None, target_year: int | None) -> dict[str, object]:
    """Approximate main exam window per exam type; refine when official dates are wired in."""
    if not target_exam or not target_year:
        return {
            "has_target": False,
            "message": "Add your target exam and year in your profile to see a countdown.",
        }
    anchors: dict[str, tuple[int, int]] = {"JAMB": (4, 15), "WAEC": (5, 20), "NECO": (6, 10)}
    month, day = anchors.get(target_exam, (4, 15))
    try:
        exam_day = date(int(target_year), month, day)
    except (ValueError, TypeError):
        exam_day = date(int(target_year), month, 28)
    today = datetime.now(UTC).date()
    days_remaining = (exam_day - today).days
    return {
        "has_target": True,
        "exam_type": target_exam,
        "year": int(target_year),
        "approx_exam_date": exam_day.isoformat(),
        "days_remaining": days_remaining,
        "message": None,
    }


class CBTService:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection
        self.jwt_secret = os.getenv("SABISCHOLAR_JWT_SECRET", "sabischolar-dev-secret")

    @staticmethod
    def hash_password(raw_password: str) -> str:
        return hashlib.sha256(raw_password.encode("utf-8")).hexdigest()

    def register_user(self, payload: RegisterUserInput) -> int:
        cursor = self.connection.execute(
            "INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)",
            (payload.email.lower().strip(), payload.password_hash, payload.full_name.strip()),
        )
        user_id = int(cursor.lastrowid)
        token = secrets.token_urlsafe(32)
        expires_at = (datetime.now(UTC) + timedelta(hours=24)).isoformat()
        self.connection.execute(
            """
            INSERT INTO email_verification_tokens (user_id, token, expires_at)
            VALUES (?, ?, ?)
            """,
            (user_id, token, expires_at),
        )
        self.connection.commit()
        return user_id

    def ensure_user_for_sabischolar_id(self, sabischolar_user_id: str, fallback_name: str = "SabiScholar Student") -> int:
        row = self.connection.execute(
            "SELECT id FROM users WHERE sabischolar_user_id = ?",
            (sabischolar_user_id,),
        ).fetchone()
        if row:
            return int(row["id"])
        email = f"{sabischolar_user_id}@sabi.local"
        cursor = self.connection.execute(
            """
            INSERT INTO users (sabischolar_user_id, email, password_hash, full_name, is_email_verified)
            VALUES (?, ?, ?, ?, 1)
            """,
            (sabischolar_user_id, email, "external-auth", fallback_name),
        )
        user_id = int(cursor.lastrowid)
        self.connection.commit()
        return user_id

    def login_user(self, email: str, raw_password: str) -> str | None:
        row = self.connection.execute(
            "SELECT id, password_hash, sabischolar_user_id FROM users WHERE email = ?",
            (email.lower().strip(),),
        ).fetchone()
        if not row:
            return None
        if row["password_hash"] != self.hash_password(raw_password):
            return None
        subject = row["sabischolar_user_id"] or str(row["id"])
        token = self._mint_jwt(subject=subject, user_id=int(row["id"]))
        expires_at = (datetime.now(UTC) + timedelta(days=14)).isoformat()
        self.connection.execute(
            "INSERT INTO auth_sessions (user_id, jwt_token, expires_at) VALUES (?, ?, ?)",
            (row["id"], token, expires_at),
        )
        self.connection.commit()
        return token

    def authenticate_token(self, token: str) -> int | None:
        payload = self._verify_jwt(token)
        if not payload:
            return None
        row = self.connection.execute(
            """
            SELECT user_id FROM auth_sessions
            WHERE jwt_token = ? AND revoked_at IS NULL AND expires_at > ?
            """,
            (token, datetime.now(UTC).isoformat()),
        ).fetchone()
        return None if not row else int(row["user_id"])

    def current_user_brief(self, user_id: int) -> dict[str, object] | None:
        row = self.connection.execute(
            """
            SELECT id, email, full_name, is_email_verified, sabischolar_user_id
            FROM users WHERE id = ?
            """,
            (user_id,),
        ).fetchone()
        if not row:
            return None
        return {
            "user_id": int(row["id"]),
            "email": row["email"],
            "full_name": row["full_name"],
            "is_email_verified": bool(row["is_email_verified"]),
            "sabischolar_user_id": row["sabischolar_user_id"],
        }

    def verify_email(self, token: str) -> bool:
        token_row = self.connection.execute(
            """
            SELECT id, user_id, expires_at, used_at
            FROM email_verification_tokens
            WHERE token = ?
            """,
            (token,),
        ).fetchone()
        if not token_row or token_row["used_at"]:
            return False
        if datetime.fromisoformat(token_row["expires_at"]) < datetime.now(UTC):
            return False

        self.connection.execute("UPDATE users SET is_email_verified = 1 WHERE id = ?", (token_row["user_id"],))
        self.connection.execute(
            "UPDATE email_verification_tokens SET used_at = ? WHERE id = ?",
            (datetime.now(UTC).isoformat(), token_row["id"]),
        )
        self.connection.commit()
        return True

    def create_password_reset_token(self, email: str) -> str | None:
        user = self.connection.execute("SELECT id FROM users WHERE email = ?", (email.lower().strip(),)).fetchone()
        if not user:
            return None
        token = secrets.token_urlsafe(32)
        expires_at = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
        self.connection.execute(
            "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
            (user["id"], token, expires_at),
        )
        self.connection.commit()
        return token

    def upsert_profile(self, payload: UserProfileInput) -> None:
        self.connection.execute(
            """
            INSERT INTO user_profiles (
                user_id, school, state, parent_email, target_exam, target_exam_year, selected_subject_codes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                school = excluded.school,
                state = excluded.state,
                parent_email = excluded.parent_email,
                target_exam = excluded.target_exam,
                target_exam_year = excluded.target_exam_year,
                selected_subject_codes = excluded.selected_subject_codes,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                payload.user_id,
                payload.school,
                payload.state,
                payload.parent_email,
                payload.target_exam,
                payload.target_exam_year,
                json.dumps(payload.selected_subject_codes),
            ),
        )
        self.connection.commit()

    def create_exam_session(self, payload: CreateSessionInput, question_ids: list[int]) -> int:
        duration = payload.duration_seconds
        cursor = self.connection.execute(
            """
            INSERT INTO exam_sessions (
                user_id, exam_type, mode, subject_codes, topic_ids, question_count,
                duration_seconds, remaining_seconds, light_timer_enabled, explanation_mode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.user_id,
                payload.exam_type,
                payload.mode,
                json.dumps(payload.subject_codes),
                json.dumps(payload.topic_ids),
                len(question_ids),
                duration,
                duration,
                int(payload.light_timer_enabled),
                payload.explanation_mode,
            ),
        )
        session_id = int(cursor.lastrowid)
        for qid in question_ids:
            self.connection.execute(
                "INSERT INTO session_answers (session_id, question_id) VALUES (?, ?)",
                (session_id, qid),
            )
        self.connection.commit()
        return session_id

    def fetch_questions(
        self,
        exam_type: str,
        subject_codes: list[str] | None = None,
        topic_ids: list[int] | None = None,
        limit: int = 50,
        randomize: bool = True,
    ) -> list[QuestionDTO]:
        filters = ["q.exam_type = ?"]
        params: list[object] = [exam_type]
        if subject_codes:
            placeholders = ",".join("?" for _ in subject_codes)
            filters.append(f"s.code IN ({placeholders})")
            params.extend(subject_codes)
        if topic_ids:
            placeholders = ",".join("?" for _ in topic_ids)
            filters.append(f"q.topic_id IN ({placeholders})")
            params.extend(topic_ids)
        where_clause = " AND ".join(filters)

        order_clause = "RANDOM()" if randomize else "q.id"
        question_rows = self.connection.execute(
            f"""
            SELECT q.id, q.exam_type, s.code AS subject_code, q.topic_id, q.year, q.body, q.image_url,
                   q.difficulty, q.source, q.explanation, q.lesson_link
            FROM questions q
            JOIN subjects s ON s.id = q.subject_id
            WHERE {where_clause}
            ORDER BY {order_clause}
            LIMIT ?
            """,
            [*params, limit],
        ).fetchall()

        questions: list[QuestionDTO] = []
        for row in question_rows:
            option_rows = self.connection.execute(
                "SELECT id, label, option_text FROM question_options WHERE question_id = ? ORDER BY label",
                (row["id"],),
            ).fetchall()
            options = [
                QuestionOptionDTO(id=int(opt["id"]), label=opt["label"], text=opt["option_text"]) for opt in option_rows
            ]
            questions.append(
                QuestionDTO(
                    id=row["id"],
                    exam_type=row["exam_type"],
                    subject_code=row["subject_code"],
                    topic_id=row["topic_id"],
                    year=row["year"],
                    body=row["body"],
                    image_url=row["image_url"],
                    difficulty=row["difficulty"],
                    source=row["source"],
                    explanation=row["explanation"],
                    lesson_link=row["lesson_link"],
                    options=options,
                )
            )
        return questions

    def admin_create_question(
        self,
        *,
        exam_type: str,
        subject_id: int,
        topic_id: int,
        year: int | None,
        body: str,
        image_url: str | None,
        options: dict[str, str],
        correct_label: str,
        explanation: str,
        lesson_link: str | None,
        difficulty: str,
        source: str,
        created_by_user_id: int,
    ) -> int:
        cursor = self.connection.execute(
            """
            INSERT INTO questions (
                exam_type, subject_id, topic_id, year, body, image_url, correct_label,
                explanation, lesson_link, difficulty, source, created_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                exam_type,
                subject_id,
                topic_id,
                year,
                body,
                image_url,
                correct_label,
                explanation,
                lesson_link,
                difficulty,
                source,
                created_by_user_id,
            ),
        )
        question_id = int(cursor.lastrowid)
        for label in ("A", "B", "C", "D"):
            self.connection.execute(
                "INSERT INTO question_options (question_id, label, option_text) VALUES (?, ?, ?)",
                (question_id, label, options[label]),
            )
        self.connection.commit()
        return question_id

    def admin_update_question(
        self,
        question_id: int,
        *,
        body: str,
        image_url: str | None,
        correct_label: str,
        explanation: str,
        lesson_link: str | None,
        difficulty: str,
    ) -> None:
        self.connection.execute(
            """
            UPDATE questions
            SET body = ?, image_url = ?, correct_label = ?, explanation = ?, lesson_link = ?,
                difficulty = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (body, image_url, correct_label, explanation, lesson_link, difficulty, question_id),
        )
        self.connection.commit()

    def admin_list_taxonomy(self) -> dict[str, object]:
        subject_rows = self.connection.execute(
            "SELECT id, exam_type, code, name, is_core FROM subjects ORDER BY exam_type, code"
        ).fetchall()
        topic_rows = self.connection.execute(
            "SELECT id, subject_id, name FROM topics ORDER BY subject_id, name"
        ).fetchall()
        topics_by_subject: dict[int, list[dict[str, object]]] = {}
        for row in topic_rows:
            topics_by_subject.setdefault(int(row["subject_id"]), []).append({"id": row["id"], "name": row["name"]})
        exams: dict[str, list[dict[str, object]]] = {}
        for row in subject_rows:
            exams.setdefault(row["exam_type"], []).append(
                {
                    "subject_id": row["id"],
                    "code": row["code"],
                    "name": row["name"],
                    "is_core": bool(row["is_core"]),
                    "topics": topics_by_subject.get(int(row["id"]), []),
                }
            )
        return {"exams": exams}

    def admin_list_questions(
        self, exam_type: str | None = None, subject_id: int | None = None, topic_id: int | None = None, limit: int = 100
    ) -> list[dict[str, object]]:
        filters = ["1 = 1"]
        params: list[object] = []
        if exam_type:
            filters.append("q.exam_type = ?")
            params.append(exam_type)
        if subject_id:
            filters.append("q.subject_id = ?")
            params.append(subject_id)
        if topic_id:
            filters.append("q.topic_id = ?")
            params.append(topic_id)
        where = " AND ".join(filters)
        rows = self.connection.execute(
            f"""
            SELECT q.id, q.exam_type, q.subject_id, q.topic_id, q.year, q.body, q.image_url, q.correct_label,
                   q.explanation, q.lesson_link, q.difficulty, q.source, s.code AS subject_code, t.name AS topic_name
            FROM questions q
            JOIN subjects s ON s.id = q.subject_id
            JOIN topics t ON t.id = q.topic_id
            WHERE {where}
            ORDER BY q.id DESC
            LIMIT ?
            """,
            [*params, limit],
        ).fetchall()
        data: list[dict[str, object]] = []
        for row in rows:
            option_rows = self.connection.execute(
                "SELECT label, option_text FROM question_options WHERE question_id = ? ORDER BY label",
                (row["id"],),
            ).fetchall()
            data.append(
                {
                    "id": row["id"],
                    "exam_type": row["exam_type"],
                    "subject_id": row["subject_id"],
                    "subject_code": row["subject_code"],
                    "topic_id": row["topic_id"],
                    "topic_name": row["topic_name"],
                    "year": row["year"],
                    "body": row["body"],
                    "image_url": row["image_url"],
                    "correct_label": row["correct_label"],
                    "explanation": row["explanation"],
                    "lesson_link": row["lesson_link"],
                    "difficulty": row["difficulty"],
                    "source": row["source"],
                    "options": {opt["label"]: opt["option_text"] for opt in option_rows},
                }
            )
        return data

    def save_answer(
        self,
        session_id: int,
        question_id: int,
        selected_label: str | None,
        is_flagged: bool,
        time_spent_seconds: int,
    ) -> None:
        correct_row = self.connection.execute(
            "SELECT correct_label FROM questions WHERE id = ?",
            (question_id,),
        ).fetchone()
        is_correct = None
        answered_at = None
        if selected_label:
            is_correct = int(selected_label == correct_row["correct_label"])
            answered_at = datetime.now(UTC).isoformat()
        self.connection.execute(
            """
            UPDATE session_answers
            SET selected_label = ?, is_flagged = ?, is_correct = ?, answered_at = ?,
                time_spent_seconds = ?
            WHERE session_id = ? AND question_id = ?
            """,
            (selected_label, int(is_flagged), is_correct, answered_at, time_spent_seconds, session_id, question_id),
        )
        self.connection.commit()

    def update_session_state(self, session_id: int, current_question_index: int, remaining_seconds: int | None = None) -> None:
        if remaining_seconds is None:
            self.connection.execute(
                "UPDATE exam_sessions SET current_question_index = ? WHERE id = ?",
                (current_question_index, session_id),
            )
        else:
            self.connection.execute(
                "UPDATE exam_sessions SET current_question_index = ?, remaining_seconds = ? WHERE id = ?",
                (current_question_index, max(0, remaining_seconds), session_id),
            )
        self.connection.commit()

    def get_session_bundle(self, session_id: int) -> dict[str, object] | None:
        session = self.connection.execute("SELECT * FROM exam_sessions WHERE id = ?", (session_id,)).fetchone()
        if not session:
            return None
        rows = self.connection.execute(
            """
            SELECT sa.question_id, sa.selected_label, sa.is_flagged, sa.time_spent_seconds,
                   q.exam_type, q.year, q.body, q.image_url, q.explanation, q.lesson_link, q.difficulty,
                   q.correct_label, s.code AS subject_code, t.name AS topic_name
            FROM session_answers sa
            JOIN questions q ON q.id = sa.question_id
            JOIN subjects s ON s.id = q.subject_id
            JOIN topics t ON t.id = q.topic_id
            WHERE sa.session_id = ?
            ORDER BY sa.id
            """,
            (session_id,),
        ).fetchall()
        questions: list[dict[str, object]] = []
        for row in rows:
            options = self.connection.execute(
                "SELECT label, option_text FROM question_options WHERE question_id = ? ORDER BY label",
                (row["question_id"],),
            ).fetchall()
            show_explanation = bool(session["is_submitted"]) or session["mode"] != "mock"
            questions.append(
                {
                    "id": row["question_id"],
                    "subject_code": row["subject_code"],
                    "topic_name": row["topic_name"],
                    "year": row["year"],
                    "body": row["body"],
                    "image_url": row["image_url"],
                    "difficulty": row["difficulty"],
                    "selected_label": row["selected_label"],
                    "is_flagged": bool(row["is_flagged"]),
                    "time_spent_seconds": row["time_spent_seconds"],
                    "correct_label": row["correct_label"] if show_explanation else None,
                    "explanation": row["explanation"] if show_explanation else None,
                    "lesson_link": row["lesson_link"] if show_explanation else None,
                    "options": [{"label": opt["label"], "text": opt["option_text"]} for opt in options],
                }
            )
        return {
            "session": {
                "id": session["id"],
                "user_id": session["user_id"],
                "exam_type": session["exam_type"],
                "mode": session["mode"],
                "subject_codes": json.loads(session["subject_codes"]),
                "duration_seconds": session["duration_seconds"],
                "remaining_seconds": session["remaining_seconds"],
                "current_question_index": session["current_question_index"],
                "is_submitted": bool(session["is_submitted"]),
                "explanation_mode": session["explanation_mode"],
                "light_timer_enabled": bool(session["light_timer_enabled"]),
            },
            "questions": questions,
        }

    def submit_session(self, session_id: int) -> SessionResultDTO:
        session_row = self.connection.execute(
            "SELECT user_id, exam_type, mode, question_count FROM exam_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        score_row = self.connection.execute(
            """
            SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct
            FROM session_answers WHERE session_id = ?
            """,
            (session_id,),
        ).fetchone()

        total = int(score_row["total"])
        correct = int(score_row["correct"])
        percent = (correct / total) * 100 if total else 0.0
        submitted_at = datetime.now(UTC).isoformat()
        self.connection.execute(
            """
            UPDATE exam_sessions
            SET is_submitted = 1, submitted_at = ?, remaining_seconds = 0
            WHERE id = ?
            """,
            (submitted_at, session_id),
        )

        # Only mock sessions count toward leaderboard.
        if session_row["mode"] == "mock":
            week_start = self._week_start_wat_iso()
            self.connection.execute(
                """
                INSERT INTO weekly_leaderboard_scores
                    (week_start_wat, user_id, exam_type, session_id, score_percent)
                VALUES (?, ?, ?, ?, ?)
                """,
                (week_start, session_row["user_id"], session_row["exam_type"], session_id, percent),
            )
        self.connection.commit()

        return SessionResultDTO(
            session_id=session_id,
            user_id=session_row["user_id"],
            exam_type=session_row["exam_type"],
            mode=session_row["mode"],
            total_questions=total,
            correct_answers=correct,
            score_percent=round(percent, 2),
            submitted_at=datetime.fromisoformat(submitted_at),
        )

    def leaderboard(self, exam_type: str, user_id: int, limit: int = 20) -> dict[str, object]:
        week_start = self._week_start_wat_iso()
        top_rows = self.connection.execute(
            """
            SELECT u.full_name, w.user_id, MAX(w.score_percent) AS best_score
            FROM weekly_leaderboard_scores w
            JOIN users u ON u.id = w.user_id
            WHERE w.week_start_wat = ? AND w.exam_type = ?
            GROUP BY w.user_id
            ORDER BY best_score DESC, u.full_name ASC
            LIMIT ?
            """,
            (week_start, exam_type, limit),
        ).fetchall()

        ranked_rows = self.connection.execute(
            """
            SELECT user_id, best_score, rank
            FROM (
                SELECT user_id,
                       MAX(score_percent) AS best_score,
                       DENSE_RANK() OVER (ORDER BY MAX(score_percent) DESC) AS rank
                FROM weekly_leaderboard_scores
                WHERE week_start_wat = ? AND exam_type = ?
                GROUP BY user_id
            )
            WHERE user_id = ?
            """,
            (week_start, exam_type, user_id),
        ).fetchone()

        return {
            "week_start_wat": week_start,
            "exam_type": exam_type,
            "top": [
                {"rank": idx + 1, "user_id": row["user_id"], "full_name": row["full_name"], "score": row["best_score"]}
                for idx, row in enumerate(top_rows)
            ],
            "current_user_rank": None
            if not ranked_rows
            else {"rank": ranked_rows["rank"], "user_id": ranked_rows["user_id"], "score": ranked_rows["best_score"]},
        }

    def session_results_detail(self, session_id: int) -> dict[str, object]:
        session = self.connection.execute(
            "SELECT * FROM exam_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        rows = self.connection.execute(
            """
            SELECT sa.question_id, sa.selected_label, sa.is_correct, sa.time_spent_seconds, sa.is_flagged,
                   q.correct_label, q.explanation, q.lesson_link, t.name AS topic_name, s.code AS subject_code
            FROM session_answers sa
            JOIN questions q ON q.id = sa.question_id
            JOIN topics t ON t.id = q.topic_id
            JOIN subjects s ON s.id = q.subject_id
            WHERE sa.session_id = ?
            """,
            (session_id,),
        ).fetchall()
        total = len(rows)
        correct = sum(1 for row in rows if row["is_correct"] == 1)
        by_subject: dict[str, dict[str, int]] = {}
        by_topic: dict[str, dict[str, int]] = {}
        review_items: list[dict[str, object]] = []
        for row in rows:
            subject = row["subject_code"]
            topic = row["topic_name"]
            by_subject.setdefault(subject, {"attempted": 0, "correct": 0})
            by_topic.setdefault(topic, {"attempted": 0, "correct": 0})
            by_subject[subject]["attempted"] += 1
            by_topic[topic]["attempted"] += 1
            if row["is_correct"] == 1:
                by_subject[subject]["correct"] += 1
                by_topic[topic]["correct"] += 1
            else:
                review_items.append(
                    {
                        "question_id": row["question_id"],
                        "selected_label": row["selected_label"],
                        "correct_label": row["correct_label"],
                        "explanation": row["explanation"],
                        "lesson_link": row["lesson_link"],
                    }
                )
        predicted = self._predicted_score(session["user_id"], session["exam_type"])
        pass_indicator = None
        if session["exam_type"] == "JAMB":
            pass_indicator = {"cutoff_score": 50.0, "passed": ((correct / total) * 100 if total else 0.0) >= 50.0}
        return {
            "session_id": session_id,
            "exam_type": session["exam_type"],
            "mode": session["mode"],
            "score_percent": round((correct / total) * 100 if total else 0.0, 2),
            "overall": {"total_questions": total, "correct_answers": correct},
            "pass_indicator": pass_indicator,
            "by_subject": by_subject,
            "by_topic": by_topic,
            "time_per_question": [{"question_id": row["question_id"], "seconds": row["time_spent_seconds"]} for row in rows],
            "questions_to_review": review_items,
            "predicted_exam_score_percent": predicted,
            "weak_topics": self._weak_topics(session["user_id"], session["exam_type"], limit=3),
        }

    def student_dashboard(self, user_id: int) -> dict[str, object]:
        user = self.connection.execute("SELECT full_name FROM users WHERE id = ?", (user_id,)).fetchone()
        profile_row = self.connection.execute(
            """
            SELECT school, state, target_exam, target_exam_year, selected_subject_codes
            FROM user_profiles WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
        profile: dict[str, object] | None = None
        if profile_row:
            profile = {
                "school": profile_row["school"],
                "state": profile_row["state"],
                "target_exam": profile_row["target_exam"],
                "target_exam_year": profile_row["target_exam_year"],
                "selected_subject_codes": json.loads(profile_row["selected_subject_codes"] or "[]"),
            }
        recent = self.connection.execute(
            """
            SELECT id, exam_type, mode, submitted_at
            FROM exam_sessions
            WHERE user_id = ? AND is_submitted = 1
            ORDER BY submitted_at DESC
            LIMIT 3
            """,
            (user_id,),
        ).fetchall()
        recent_sessions = [self.session_results_detail(row["id"]) for row in recent]
        target_exam = profile["target_exam"] if profile else None
        target_year = profile["target_exam_year"] if profile else None
        return {
            "greeting_name": None if not user else user["full_name"],
            "profile": profile,
            "exam_countdown": exam_countdown_from_profile(
                str(target_exam) if target_exam else None,
                int(target_year) if target_year is not None else None,
            ),
            "recent_sessions": recent_sessions,
            "weak_topics": self._weak_topics(user_id, None, limit=3),
            "streak_days": self._streak_days(user_id),
        }

    def _predicted_score(self, user_id: int, exam_type: str) -> float | None:
        rows = self.connection.execute(
            """
            SELECT id FROM exam_sessions
            WHERE user_id = ? AND exam_type = ? AND mode = 'mock' AND is_submitted = 1
            ORDER BY submitted_at DESC
            LIMIT 3
            """,
            (user_id, exam_type),
        ).fetchall()
        if not rows:
            return None
        scores: list[float] = []
        for row in rows:
            score_row = self.connection.execute(
                """
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN sa.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct
                FROM session_answers sa
                WHERE sa.session_id = ?
                """,
                (row["id"],),
            ).fetchone()
            total = int(score_row["total"])
            correct = int(score_row["correct"])
            scores.append((correct / total) * 100 if total else 0.0)
        return round(sum(scores) / len(scores), 2)

    def _weak_topics(self, user_id: int, exam_type: str | None, limit: int = 3) -> list[dict[str, object]]:
        filters = ["es.user_id = ?", "es.is_submitted = 1"]
        params: list[object] = [user_id]
        if exam_type:
            filters.append("es.exam_type = ?")
            params.append(exam_type)
        where = " AND ".join(filters)
        rows = self.connection.execute(
            f"""
            SELECT t.name AS topic_name,
                   COUNT(*) AS attempted,
                   COALESCE(SUM(CASE WHEN sa.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct
            FROM session_answers sa
            JOIN exam_sessions es ON es.id = sa.session_id
            JOIN questions q ON q.id = sa.question_id
            JOIN topics t ON t.id = q.topic_id
            WHERE {where}
            GROUP BY t.name
            HAVING attempted >= 1
            ORDER BY (CAST(correct AS REAL) / attempted) ASC, attempted DESC
            LIMIT ?
            """,
            [*params, limit],
        ).fetchall()
        return [
            {"topic": row["topic_name"], "accuracy": round((row["correct"] / row["attempted"]) * 100, 2), "attempted": row["attempted"]}
            for row in rows
        ]

    def _streak_days(self, user_id: int) -> int:
        rows = self.connection.execute(
            """
            SELECT DISTINCT DATE(submitted_at) AS day
            FROM exam_sessions
            WHERE user_id = ? AND is_submitted = 1
            ORDER BY day DESC
            """,
            (user_id,),
        ).fetchall()
        if not rows:
            return 0
        streak = 0
        cursor_day = datetime.now(UTC).date()
        seen = {datetime.fromisoformat(row["day"]).date() for row in rows if row["day"]}
        while cursor_day in seen:
            streak += 1
            cursor_day = cursor_day - timedelta(days=1)
        return streak

    def _mint_jwt(self, subject: str, user_id: int) -> str:
        now = int(datetime.now(UTC).timestamp())
        payload = {
            "iss": "sabischolar",
            "sub": subject,
            "uid": user_id,
            "iat": now,
            "exp": now + (14 * 24 * 3600),
            "scope": "cbt",
        }
        header = {"alg": "HS256", "typ": "JWT"}
        header_segment = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        payload_segment = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
        signature = hmac.new(self.jwt_secret.encode("utf-8"), signing_input, digestmod=hashlib.sha256).digest()
        return f"{header_segment}.{payload_segment}.{_b64url_encode(signature)}"

    def _verify_jwt(self, token: str) -> dict[str, object] | None:
        try:
            header_segment, payload_segment, signature_segment = token.split(".")
            signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
            expected_sig = hmac.new(self.jwt_secret.encode("utf-8"), signing_input, digestmod=hashlib.sha256).digest()
            if not hmac.compare_digest(_b64url_decode(signature_segment), expected_sig):
                return None
            payload = json.loads(_b64url_decode(payload_segment).decode("utf-8"))
            if int(payload["exp"]) < int(datetime.now(UTC).timestamp()):
                return None
            return payload
        except (ValueError, KeyError, json.JSONDecodeError):
            return None

    @staticmethod
    def _week_start_wat_iso(now_utc: datetime | None = None) -> str:
        # WAT is UTC+1 and leaderboard resets Sunday midnight WAT.
        now_utc = now_utc or datetime.now(UTC)
        wat_now = now_utc + timedelta(hours=1)
        days_since_sunday = (wat_now.weekday() + 1) % 7
        sunday = (wat_now - timedelta(days=days_since_sunday)).replace(hour=0, minute=0, second=0, microsecond=0)
        return sunday.date().isoformat()
