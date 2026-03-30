"""Database connection and schema management for CBT platform."""

from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "sabischolar_cbt.sqlite3"


def get_connection(db_path: str | Path | None = None) -> sqlite3.Connection:
    path = Path(db_path) if db_path else DB_PATH
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db(connection: sqlite3.Connection) -> None:
    if _legacy_schema_detected(connection):
        _reset_cbt_schema(connection)

    schema = """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sabischolar_user_id TEXT UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        is_email_verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        jwt_token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        school TEXT,
        state TEXT,
        parent_email TEXT,
        target_exam TEXT CHECK(target_exam IN ('JAMB','WAEC','NECO')),
        target_exam_year INTEGER,
        selected_subject_codes TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_type TEXT NOT NULL CHECK(exam_type IN ('JAMB','WAEC','NECO')),
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        is_core INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(exam_type, code)
    );

    CREATE TABLE IF NOT EXISTS topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(subject_id, name)
    );

    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_type TEXT NOT NULL CHECK(exam_type IN ('JAMB','WAEC','NECO')),
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
        topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
        year INTEGER,
        body TEXT NOT NULL,
        image_url TEXT,
        correct_label TEXT NOT NULL CHECK(correct_label IN ('A','B','C','D')),
        explanation TEXT NOT NULL,
        lesson_link TEXT,
        difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
        source TEXT NOT NULL CHECK(source IN ('past_question','ai_generated')),
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS question_options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        label TEXT NOT NULL CHECK(label IN ('A','B','C','D')),
        option_text TEXT NOT NULL,
        UNIQUE(question_id, label)
    );

    CREATE TABLE IF NOT EXISTS exam_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exam_type TEXT NOT NULL CHECK(exam_type IN ('JAMB','WAEC','NECO')),
        mode TEXT NOT NULL CHECK(mode IN ('mock','study','drill')),
        subject_codes TEXT NOT NULL DEFAULT '[]',
        topic_ids TEXT NOT NULL DEFAULT '[]',
        question_count INTEGER NOT NULL DEFAULT 0,
        duration_seconds INTEGER,
        remaining_seconds INTEGER,
        light_timer_enabled INTEGER NOT NULL DEFAULT 0,
        explanation_mode TEXT NOT NULL CHECK(explanation_mode IN ('instant','deferred')),
        current_question_index INTEGER NOT NULL DEFAULT 0,
        is_submitted INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        submitted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS session_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        selected_label TEXT CHECK(selected_label IN ('A','B','C','D')),
        is_flagged INTEGER NOT NULL DEFAULT 0,
        is_correct INTEGER,
        answered_at TEXT,
        time_spent_seconds INTEGER NOT NULL DEFAULT 0,
        UNIQUE(session_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS weekly_leaderboard_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        week_start_wat TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exam_type TEXT NOT NULL CHECK(exam_type IN ('JAMB','WAEC','NECO')),
        session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
        score_percent REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(week_start_wat, exam_type, session_id)
    );

    CREATE INDEX IF NOT EXISTS idx_questions_filter
    ON questions(exam_type, subject_id, topic_id, difficulty, source);

    CREATE INDEX IF NOT EXISTS idx_sessions_user_exam
    ON exam_sessions(user_id, exam_type, mode, started_at);

    CREATE INDEX IF NOT EXISTS idx_users_sabi_id
    ON users(sabischolar_user_id);

    CREATE INDEX IF NOT EXISTS idx_session_answers_session
    ON session_answers(session_id, question_id);

    CREATE INDEX IF NOT EXISTS idx_leaderboard_week_exam
    ON weekly_leaderboard_scores(week_start_wat, exam_type, score_percent DESC);
    """
    connection.executescript(schema)
    connection.commit()


def _legacy_schema_detected(connection: sqlite3.Connection) -> bool:
    table = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'questions'"
    ).fetchone()
    if not table:
        return False
    columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(questions)").fetchall()
    }
    required = {"subject_id", "topic_id", "correct_label", "lesson_link"}
    return not required.issubset(columns)


def _reset_cbt_schema(connection: sqlite3.Connection) -> None:
    connection.execute("PRAGMA foreign_keys = OFF")
    tables = [
        "weekly_leaderboard_scores",
        "session_answers",
        "exam_sessions",
        "question_options",
        "questions",
        "topics",
        "subjects",
        "user_profiles",
        "password_reset_tokens",
        "email_verification_tokens",
        "users",
    ]
    for table in tables:
        try:
            connection.execute(f"DROP TABLE IF EXISTS {table}")
        except sqlite3.OperationalError:
            # Legacy DBs may contain broken FK references; best effort cleanup.
            pass
    connection.execute("PRAGMA foreign_keys = ON")
    connection.commit()
