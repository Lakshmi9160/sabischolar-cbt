import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { config } from "./config";

const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(config.dbPath);

export function initDb(): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sabischolar_user_id TEXT UNIQUE,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      full_name TEXT NOT NULL,
      school TEXT,
      state TEXT,
      target_exam TEXT,
      target_exam_year INTEGER,
      selected_subjects_json TEXT DEFAULT '[]',
      email_verified INTEGER DEFAULT 0,
      parent_email TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_type TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      subject_name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subjects_exam ON subjects(exam_type);

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_email_verification_token ON email_verification_tokens(token);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);

    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_type TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      topic_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_type TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      topic_id INTEGER,
      year INTEGER,
      question_body TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_option TEXT NOT NULL,
      explanation TEXT NOT NULL,
      lesson_link TEXT,
      difficulty TEXT NOT NULL,
      source TEXT NOT NULL,
      image_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_q_exam_subject_topic ON questions(exam_type, subject_code, topic_id);

    CREATE TABLE IF NOT EXISTS exam_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      exam_type TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      duration_seconds INTEGER DEFAULT 0,
      remaining_seconds INTEGER DEFAULT 0,
      current_question_index INTEGER DEFAULT 0,
      subject_codes_json TEXT DEFAULT '[]',
      question_ids_json TEXT DEFAULT '[]',
      flagged_question_ids_json TEXT DEFAULT '[]',
      explanation_mode TEXT DEFAULT 'deferred',
      light_timer_enabled INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      total_questions INTEGER DEFAULT 0,
      percentage REAL DEFAULT 0,
      pass_fail TEXT,
      subject_breakdown_json TEXT,
      topic_breakdown_json TEXT,
      time_per_question_json TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      submitted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON exam_sessions(user_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_exam_started ON exam_sessions(user_id, exam_type, started_at);

    CREATE TABLE IF NOT EXISTS session_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      selected_option TEXT,
      is_correct INTEGER,
      time_spent_seconds INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS session_stats (
      session_id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      exam_type TEXT NOT NULL,
      mode TEXT NOT NULL,
      score INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      percentage REAL NOT NULL,
      pass_fail TEXT NOT NULL,
      submitted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_stats_user_exam ON session_stats(user_id, exam_type, submitted_at);

    CREATE TABLE IF NOT EXISTS topic_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      exam_type TEXT NOT NULL,
      mode TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      topic_id INTEGER,
      topic_key TEXT NOT NULL,
      total INTEGER NOT NULL,
      correct INTEGER NOT NULL,
      percentage REAL NOT NULL,
      submitted_at TEXT NOT NULL,
      UNIQUE(session_id, topic_key)
    );
    CREATE INDEX IF NOT EXISTS idx_topic_stats_user_exam ON topic_stats(user_id, exam_type, submitted_at);
    CREATE INDEX IF NOT EXISTS idx_topic_stats_user_topic ON topic_stats(user_id, subject_code, topic_id);
  `);

  // Lightweight forward-compatible migrations for existing local databases.
  const addColumnIfMissing = (tableName: string, columnDef: string) => {
    try {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef};`);
    } catch {
      // Ignore duplicate-column errors for already-migrated databases.
    }
  };

  addColumnIfMissing("exam_sessions", "score INTEGER DEFAULT 0");
  addColumnIfMissing("exam_sessions", "total_questions INTEGER DEFAULT 0");
  addColumnIfMissing("exam_sessions", "percentage REAL DEFAULT 0");
  addColumnIfMissing("exam_sessions", "pass_fail TEXT");
  addColumnIfMissing("exam_sessions", "subject_breakdown_json TEXT");
  addColumnIfMissing("exam_sessions", "topic_breakdown_json TEXT");
  addColumnIfMissing("exam_sessions", "time_per_question_json TEXT");
  addColumnIfMissing("users", "is_admin INTEGER DEFAULT 0");
}

