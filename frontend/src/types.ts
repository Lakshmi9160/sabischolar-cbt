export type AppPage = "auth" | "dashboard" | "exam" | "results" | "leaderboard" | "admin";
export type ExamMode = "mock" | "study" | "drill";

export type Question = {
  id: number;
  subject_code?: string;
  question_body: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  image_url?: string | null;
};

export type SessionResult = {
  sessionId: number;
  examType?: string;
  mode?: string;
  status?: string;
  score: number;
  total: number;
  percentage: number;
  passFail: string;
  scaledJambScore?: number | null;
  predictedScore?: number | null;
  subjectBreakdown?: Array<{ subject_code: string; percentage: number; correct: number; total: number }>;
  topicBreakdown?: Array<{
    subject_code: string;
    topic_id: number | null;
    percentage: number;
    correct: number;
    total: number;
  }>;
  wrongAnswers?: Array<{
    questionId: number;
    selectedOption: string;
    correctOption: string;
    explanation: string;
    lesson_link: string | null;
  }>;
};

