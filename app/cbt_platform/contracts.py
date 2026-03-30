"""Integration-ready contracts for the standalone CBT service."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

ExamType = Literal["JAMB", "WAEC", "NECO"]
ModeType = Literal["mock", "study", "drill"]
DifficultyType = Literal["easy", "medium", "hard"]
QuestionSourceType = Literal["past_question", "ai_generated"]


@dataclass(slots=True)
class RegisterUserInput:
    email: str
    password_hash: str
    full_name: str


@dataclass(slots=True)
class UserProfileInput:
    user_id: int
    school: str | None
    state: str | None
    target_exam: ExamType | None
    target_exam_year: int | None
    selected_subject_codes: list[str]
    parent_email: str | None


@dataclass(slots=True)
class CreateSessionInput:
    user_id: int
    exam_type: ExamType
    mode: ModeType
    subject_codes: list[str]
    topic_ids: list[int]
    duration_seconds: int | None
    explanation_mode: Literal["instant", "deferred"]
    light_timer_enabled: bool


@dataclass(slots=True)
class QuestionOptionDTO:
    id: int
    label: Literal["A", "B", "C", "D"]
    text: str


@dataclass(slots=True)
class QuestionDTO:
    id: int
    exam_type: ExamType
    subject_code: str
    topic_id: int
    year: int | None
    body: str
    image_url: str | None
    difficulty: DifficultyType
    source: QuestionSourceType
    explanation: str
    lesson_link: str | None
    options: list[QuestionOptionDTO]


@dataclass(slots=True)
class SessionResultDTO:
    session_id: int
    user_id: int
    exam_type: ExamType
    mode: ModeType
    total_questions: int
    correct_answers: int
    score_percent: float
    submitted_at: datetime
