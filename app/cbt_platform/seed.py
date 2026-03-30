"""Seed helper for representative exam data."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterable

from .taxonomy import EXAM_TAXONOMY

def _insert_subject(
    connection: sqlite3.Connection,
    exam_type: str,
    code: str,
    name: str,
    is_core: bool = False,
) -> int:
    connection.execute(
        """
        INSERT INTO subjects (exam_type, code, name, is_core)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(exam_type, code) DO UPDATE SET
            name = excluded.name,
            is_core = excluded.is_core
        """,
        (exam_type, code, name, int(is_core)),
    )
    row = connection.execute(
        "SELECT id FROM subjects WHERE exam_type = ? AND code = ?",
        (exam_type, code),
    ).fetchone()
    return int(row["id"])


def _insert_topic(connection: sqlite3.Connection, subject_id: int, name: str) -> int:
    connection.execute(
        """
        INSERT INTO topics (subject_id, name)
        VALUES (?, ?)
        ON CONFLICT(subject_id, name) DO NOTHING
        """,
        (subject_id, name),
    )
    row = connection.execute(
        "SELECT id FROM topics WHERE subject_id = ? AND name = ?",
        (subject_id, name),
    ).fetchone()
    return int(row["id"])


def _insert_question(
    connection: sqlite3.Connection,
    *,
    exam_type: str,
    subject_id: int,
    topic_id: int,
    year: int | None,
    body: str,
    options: dict[str, str],
    correct_label: str,
    explanation: str,
    lesson_link: str | None,
    difficulty: str,
    source: str,
) -> None:
    existing = connection.execute(
        "SELECT id FROM questions WHERE exam_type = ? AND body = ?",
        (exam_type, body),
    ).fetchone()
    if existing:
        return
    cursor = connection.execute(
        """
        INSERT INTO questions (
            exam_type, subject_id, topic_id, year, body, image_url, correct_label,
            explanation, lesson_link, difficulty, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            exam_type,
            subject_id,
            topic_id,
            year,
            body,
            None,
            correct_label,
            explanation,
            lesson_link,
            difficulty,
            source,
        ),
    )
    question_id = cursor.lastrowid
    for label in ("A", "B", "C", "D"):
        connection.execute(
            "INSERT INTO question_options (question_id, label, option_text) VALUES (?, ?, ?)",
            (question_id, label, options[label]),
        )


def seed_reference_data(connection: sqlite3.Connection) -> None:
    subjects = [
        (exam_type, code, data["name"], bool(data["is_core"]))
        for exam_type, subjects_by_exam in EXAM_TAXONOMY.items()
        for code, data in subjects_by_exam.items()
    ]

    subject_ids: dict[tuple[str, str], int] = {}
    for exam_type, code, name, is_core in subjects:
        subject_ids[(exam_type, code)] = _insert_subject(connection, exam_type, code, name, is_core)

    topic_ids: dict[tuple[str, str, str], int] = {}
    topic_keys = [
        (exam_type, code, topic)
        for exam_type, subjects_by_exam in EXAM_TAXONOMY.items()
        for code, data in subjects_by_exam.items()
        for topic in list(data["topics"])
    ]
    for exam_type, code, topic_name in topic_keys:
        subject_id = subject_ids[(exam_type, code)]
        topic_ids[(exam_type, code, topic_name)] = _insert_topic(connection, subject_id, topic_name)

    base_rows: Iterable[tuple[str, str, str, int | None, str, dict[str, str], str, str, str, str]] = [
        ("JAMB", "ENG", "Lexis and Structure", 2020, "Choose the option that best completes the sentence: If I ____ the news earlier, I would have acted differently.", {"A": "know", "B": "knew", "C": "had known", "D": "have known"}, "C", "This is a third conditional sentence, so the if-clause takes past perfect: 'had known'.", "easy", "past_question"),
        ("JAMB", "MTH", "Algebra", 2021, "Solve for x: 3x + 5 = 20.", {"A": "x = 3", "B": "x = 5", "C": "x = 15", "D": "x = 25"}, "B", "Subtract 5 from both sides to get 3x = 15, then divide by 3 to get x = 5.", "easy", "past_question"),
        ("JAMB", "PHY", "Motion", 2022, "A car moves with uniform speed of 20 m/s for 10 seconds. What distance does it cover?", {"A": "2 m", "B": "30 m", "C": "200 m", "D": "2000 m"}, "C", "Distance = speed × time = 20 × 10 = 200 m.", "easy", "ai_generated"),
        ("JAMB", "BIO", "Ecology", 2019, "Which of the following is a biotic factor in an ecosystem?", {"A": "Sunlight", "B": "Temperature", "C": "Bacteria", "D": "Humidity"}, "C", "Biotic factors are living components. Bacteria are living organisms.", "medium", "past_question"),
        ("WAEC", "ENG", "Comprehension", 2021, "In comprehension questions, the best way to infer the meaning of a word is to use its ____.", {"A": "alphabet", "B": "context", "C": "punctuation", "D": "length"}, "B", "Context clues in surrounding sentences help determine intended meaning.", "easy", "ai_generated"),
        ("WAEC", "MTH", "Number Base", 2020, "Convert 1011₂ to base ten.", {"A": "9", "B": "10", "C": "11", "D": "12"}, "C", "1011₂ = 1×8 + 0×4 + 1×2 + 1×1 = 11.", "medium", "past_question"),
        ("WAEC", "PHY", "Energy", 2021, "Which unit is used for energy?", {"A": "Newton", "B": "Joule", "C": "Pascal", "D": "Watt"}, "B", "Energy is measured in joules (J).", "easy", "past_question"),
        ("NECO", "ENG", "Grammar", 2021, "Identify the correct sentence.", {"A": "Each of the boys have a pen.", "B": "Each of the boys has a pen.", "C": "Each of the boys are having a pen.", "D": "Each boys has pen."}, "B", "The subject 'Each' is singular, so the verb should be 'has'.", "easy", "past_question"),
        ("NECO", "MTH", "Statistics", 2022, "Find the mean of 2, 4, 6, 8.", {"A": "4", "B": "5", "C": "6", "D": "7"}, "B", "Mean = (2 + 4 + 6 + 8) / 4 = 20 / 4 = 5.", "easy", "ai_generated"),
        ("NECO", "BIO", "Cell Biology", 2020, "Which organelle controls cell activities?", {"A": "Nucleus", "B": "Ribosome", "C": "Vacuole", "D": "Cell wall"}, "A", "The nucleus contains genetic material and controls the cell.", "easy", "past_question"),
    ]

    question_rows: list[tuple[str, str, str, int | None, str, dict[str, str], str, str, str, str]] = list(base_rows)
    for exam in ("JAMB", "WAEC", "NECO"):
        candidates = [row for row in base_rows if row[0] == exam]
        for idx in range(1, 21 - len(candidates) + 1):
            base = candidates[idx % len(candidates)]
            question_rows.append(
                (
                    base[0],
                    base[1],
                    base[2],
                    (base[3] or 2020) + (idx % 4),
                    f"{base[4]} (Practice set {idx})",
                    base[5],
                    base[6],
                    f"{base[7]} This item is part of an extended practice set for {exam}.",
                    base[8],
                    "ai_generated" if idx % 2 == 0 else base[9],
                )
            )

    for exam_type, code, topic_name, year, body, options, correct, explanation, difficulty, source in question_rows:
        _insert_question(
            connection,
            exam_type=exam_type,
            subject_id=subject_ids[(exam_type, code)],
            topic_id=topic_ids[(exam_type, code, topic_name)],
            year=year,
            body=body,
            options=options,
            correct_label=correct,
            explanation=explanation,
            lesson_link=None,
            difficulty=difficulty,
            source=source,
        )

    connection.commit()

    # Keep a sample profile payload shape close to future integration contracts.
    connection.execute(
        """
        INSERT OR IGNORE INTO users (id, sabischolar_user_id, email, password_hash, full_name, is_email_verified)
        VALUES (1, 'sabi_demo_1', 'student@example.com', 'demo-hash', 'Demo Student', 1)
        """
    )
    connection.execute(
        """
        INSERT OR IGNORE INTO user_profiles
            (user_id, school, state, parent_email, target_exam, target_exam_year, selected_subject_codes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            1,
            "Sabi Demonstration School",
            "Lagos",
            "parent@example.com",
            "JAMB",
            2026,
            json.dumps(["ENG", "MTH", "PHY", "BIO"]),
        ),
    )
    connection.commit()
