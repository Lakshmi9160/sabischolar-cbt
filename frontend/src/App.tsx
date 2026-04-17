import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { API_BASE } from "./api";
import { fetchCatalogTopics } from "./api/questions";
import { requestJson } from "./apiClient";
import type { CatalogExam } from "./catalogSubjects";
import {
  defaultSubjectForExam,
  JAMB_MOCK_SUBJECT_CODES,
  normalizeCatalogSubject,
  subjectsForExam
} from "./catalogSubjects";
import { AppHeader } from "./components/AppHeader";
import { DashboardPanel } from "./components/DashboardPanel";
import { RequireAdmin, RequireAuth } from "./components/RouteGuards";
import { AuthPage } from "./pages/AuthPage";
import { ExamMode, Question, SessionResult } from "./types";
import { formatSeconds } from "./utils/formatSeconds";

const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const DrillSetupPage = lazy(() => import("./pages/DrillSetupPage").then((m) => ({ default: m.DrillSetupPage })));
const ExamPlayerPage = lazy(() => import("./pages/ExamPlayerPage").then((m) => ({ default: m.ExamPlayerPage })));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const LeaderboardPage = lazy(() => import("./pages/LeaderboardPage").then((m) => ({ default: m.LeaderboardPage })));
const RequestVerificationPage = lazy(() =>
  import("./pages/RequestVerificationPage").then((m) => ({ default: m.RequestVerificationPage }))
);
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const ResultsPage = lazy(() => import("./pages/ResultsPage").then((m) => ({ default: m.ResultsPage })));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage })));

type AnswerFeedback = {
  isCorrect: boolean;
  selectedOption: string;
  correctOption: string;
  explanation: string;
  lessonLink: string | null;
};

export const App: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState<string>(() => localStorage.getItem("cbt_token") || "");
  const [profileReady, setProfileReady] = useState(() => !localStorage.getItem("cbt_token"));
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState("Ready.");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionExamType, setSessionExamType] = useState<string>("JAMB");
  const [mode, setMode] = useState<ExamMode>("mock");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flaggedIds, setFlaggedIds] = useState<number[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [selectedByQuestion, setSelectedByQuestion] = useState<Record<number, string>>({});
  const [result, setResult] = useState<SessionResult | null>(null);
  const [loadingLastResult, setLoadingLastResult] = useState(false);
  const [leaderboard, setLeaderboard] = useState<
    Array<{ user_id?: number; full_name: string; avg_score: number; session_count?: number }>
  >([]);
  const [leaderboardMeta, setLeaderboardMeta] = useState<{
    timezone: string;
    weekLabel: string;
    weekStartsAt: string;
    weekEndsAt: string;
    leaderboardResetsAt: string;
    me: { rank: number; full_name: string; avg_score: number; session_count?: number } | null;
  } | null>(null);
  const [leaderboardExamType, setLeaderboardExamType] = useState<"JAMB" | "WAEC" | "NECO">("JAMB");
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const leaderboardProfileSyncedRef = useRef(false);
  const [topics, setTopics] = useState<Array<{ id: number; topic_name: string; question_count: number }>>([]);
  const [studyExamType, setStudyExamType] = useState<CatalogExam>("JAMB");
  const [studySubject, setStudySubject] = useState<string>(() => defaultSubjectForExam("JAMB"));
  const [drillExamType, setDrillExamType] = useState<CatalogExam>("JAMB");
  const [drillSubject, setDrillSubject] = useState(() => defaultSubjectForExam("JAMB"));
  const [drillTopicId, setDrillTopicId] = useState<number | null>(null);
  const [drillCount, setDrillCount] = useState(10);
  const [drillExplanationMode, setDrillExplanationMode] = useState<"instant" | "deferred">("instant");
  const [drillLightTimerEnabled, setDrillLightTimerEnabled] = useState(true);
  const [sessionExplanationMode, setSessionExplanationMode] = useState<"instant" | "deferred">("deferred");
  const [answerFeedbackByQuestion, setAnswerFeedbackByQuestion] = useState<Record<number, AnswerFeedback>>({});
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcInput, setCalcInput] = useState("0");
  const [authEmail, setAuthEmail] = useState("student@example.com");
  const [authPassword, setAuthPassword] = useState("123456");
  const [authFullName, setAuthFullName] = useState("Demo Student");
  const [authSabiScholarUserId, setAuthSabiScholarUserId] = useState("");
  const [dashboard, setDashboard] = useState<{
    profile: {
      fullName: string;
      sabischolar_user_id?: string | null;
      targetExam: string | null;
      targetExamYear: number | null;
    } | null;
    recentSessions: Array<{ id: number; exam_type: string; mode: string; status: string }>;
    weakTopics: Array<{
      topic_id: number | null;
      topic_name?: string | null;
      subject_code?: string | null;
      exam_type?: string | null;
      total: number;
      correct: number;
    }>;
    streakDays: number;
    examCountdown: { examDateIso: string; daysRemaining: number; label: string } | null;
    lastSubmittedSessionId?: number | null;
    predictedMockPercentByExam?: {
      JAMB: number | null;
      WAEC: number | null;
      NECO: number | null;
    };
  } | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [activeSessionPreview, setActiveSessionPreview] = useState<{
    id: number;
    mode: string;
    examType: string;
  } | null>(null);

  const authHeader = useMemo(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token]
  );

  const currentQuestion = questions[currentIndex];

  const saveToken = (nextToken: string) => {
    localStorage.setItem("cbt_token", nextToken);
    setToken(nextToken);
  };

  const clearExpiredSession = (msg = "Session expired. Please log in again.") => {
    localStorage.removeItem("cbt_token");
    setToken("");
    setIsAdmin(false);
    setProfileReady(true);
    setSessionId(null);
    setSessionExamType("JAMB");
    setStudyExamType("JAMB");
    setStudySubject(defaultSubjectForExam("JAMB"));
    setQuestions([]);
    setAnswerFeedbackByQuestion({});
    setSessionExplanationMode("deferred");
    setResult(null);
    setDashboard(null);
    setActiveSessionPreview(null);
    leaderboardProfileSyncedRef.current = false;
    setMessage(msg);
    navigate("/auth", { replace: true });
  };

  const logout = () => {
    localStorage.removeItem("cbt_token");
    setToken("");
    setIsAdmin(false);
    setProfileReady(true);
    setSessionId(null);
    setSessionExamType("JAMB");
    setStudyExamType("JAMB");
    setStudySubject(defaultSubjectForExam("JAMB"));
    setQuestions([]);
    setAnswerFeedbackByQuestion({});
    setSessionExplanationMode("deferred");
    setResult(null);
    setDashboard(null);
    setActiveSessionPreview(null);
    leaderboardProfileSyncedRef.current = false;
    setMessage("Logged out.");
    navigate("/auth", { replace: true });
  };

  const handleUnauthorized = (res: Response): boolean => {
    if (res.status !== 401) return false;
    clearExpiredSession("Invalid or expired token. Please log in again.");
    return true;
  };

  useEffect(() => {
    if (!token) {
      setIsAdmin(false);
      setProfileReady(true);
      return;
    }
    setProfileReady(false);
    let cancelled = false;
    void (async () => {
      try {
        const { res, data } = await requestJson<{ is_admin?: number }>(`${API_BASE}/auth/me`, {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
        });
        if (res.status === 401) {
          if (!cancelled) clearExpiredSession("Invalid or expired token. Please log in again.");
          return;
        }
        if (cancelled || !res.ok || !data) return;
        setIsAdmin(Boolean(data.is_admin));
      } finally {
        if (!cancelled) setProfileReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (location.pathname === "/exam" && event.key.toLowerCase() === "c") {
        setShowCalculator((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [location.pathname]);

  useEffect(() => {
    if (message === "Ready.") return;
    const timer = window.setTimeout(() => setMessage("Ready."), 4500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const register = async () => {
    if (!authEmail || !authPassword || !authFullName) {
      setMessage("Please enter full name, email, and password.");
      return;
    }
    const { res, data } = await requestJson<{ token?: string; message?: string }>(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: authEmail,
        password: authPassword,
        fullName: authFullName,
        sabischolarUserId: authSabiScholarUserId || null,
        targetExam: "JAMB",
        targetExamYear: 2026,
        selectedSubjects: ["ENG", "MTH", "PHY", "BIO"]
      })
    });
    if (res.ok) {
      if (!data.token) {
        setMessage("Register succeeded but no token returned.");
        return;
      }
      saveToken(data.token);
      setMessage("Registered and logged in.");
      navigate("/dashboard");
    } else {
      setMessage(data.message || "Register failed.");
    }
  };

  const login = async () => {
    if (!authEmail || !authPassword) {
      setMessage("Please enter email and password.");
      return;
    }
    const { res, data } = await requestJson<{ token?: string; message?: string }>(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: authEmail, password: authPassword })
    });
    if (res.ok) {
      if (!data.token) {
        setMessage("Login succeeded but no token returned.");
        return;
      }
      saveToken(data.token);
      setMessage("Logged in.");
      navigate("/dashboard");
    } else {
      setMessage(data.message || "Login failed.");
    }
  };

  const pushProgress = async (nextRemainingSeconds: number, nextIndex: number, nextFlagged: number[]) => {
    if (!sessionId) return;
    const { res, data } = await requestJson<{ autoSubmitted?: boolean; result?: SessionResult }>(
      `${API_BASE}/sessions/${sessionId}/progress`,
      {
      method: "PATCH",
      headers: authHeader,
      body: JSON.stringify({
        currentQuestionIndex: nextIndex,
        remainingSeconds: nextRemainingSeconds,
        flaggedQuestionIds: nextFlagged
      })
      }
    );
    if (handleUnauthorized(res)) return;
    if (!res.ok) return;
    if (data.autoSubmitted && data.result) {
      setResult(data.result as SessionResult);
      navigate("/results");
      setMessage("Session auto-submitted because timer reached zero.");
    }
  };

  const loadSessionQuestions = useCallback(
    async (nextSessionId: number): Promise<Question[] | null> => {
      const { res: qRes, data: qData } = await requestJson<{ questions?: Question[]; message?: string }>(
        `${API_BASE}/sessions/${nextSessionId}/questions`,
        { headers: authHeader }
      );
      if (handleUnauthorized(qRes)) return null;
      if (!qRes.ok) {
        setMessage(qData.message || "Failed to load session questions.");
        return null;
      }
      const list = qData.questions || [];
      setQuestions(list);
      return list;
    },
    [authHeader]
  );

  useEffect(() => {
    if (location.pathname !== "/exam" || !token) return;
    if (questions.length > 0) return;

    let cancelled = false;

    void (async () => {
      type ActivePayload = {
        session: {
          id: number;
          examType: string;
          mode: string;
          explanationMode: "instant" | "deferred";
          lightTimerEnabled: boolean;
          remainingSeconds: number;
          currentQuestionIndex: number;
          flaggedQuestionIds: number[];
          answersByQuestionId: Record<string, string>;
        } | null;
        message?: string;
      };

      const { res, data } = await requestJson<ActivePayload>(`${API_BASE}/sessions/active`, {
        headers: authHeader
      });
      if (handleUnauthorized(res)) return;
      if (cancelled) return;
      if (!res.ok) {
        setMessage(data.message || "Could not check for an active exam.");
        navigate("/dashboard", { replace: true });
        return;
      }
      if (!data.session) {
        setMessage("No active exam. Start from the dashboard.");
        navigate("/dashboard", { replace: true });
        return;
      }

      const s = data.session;

      const { res: qRes, data: qData } = await requestJson<{ questions?: Question[]; message?: string }>(
        `${API_BASE}/sessions/${s.id}/questions`,
        { headers: authHeader }
      );
      if (handleUnauthorized(qRes)) return;
      if (cancelled) return;
      if (!qRes.ok) {
        setMessage(qData.message || "Failed to load exam questions.");
        navigate("/dashboard", { replace: true });
        return;
      }
      const list = qData.questions || [];
      if (list.length === 0) {
        setMessage("Active session has no questions.");
        navigate("/dashboard", { replace: true });
        return;
      }

      const selected: Record<number, string> = {};
      if (s.answersByQuestionId) {
        for (const [k, v] of Object.entries(s.answersByQuestionId)) {
          selected[Number(k)] = v;
        }
      }

      const maxIdx = Math.max(0, list.length - 1);
      const idx = Math.min(Math.max(0, Number(s.currentQuestionIndex ?? 0)), maxIdx);

      setSessionId(s.id);
      setSessionExamType(String(s.examType || "JAMB").toUpperCase());
      setMode(s.mode as ExamMode);
      setSessionExplanationMode(s.explanationMode === "instant" ? "instant" : "deferred");
      setRemainingSeconds(Math.max(0, Number(s.remainingSeconds)));
      setFlaggedIds(Array.isArray(s.flaggedQuestionIds) ? s.flaggedQuestionIds : []);
      setSelectedByQuestion(selected);
      setQuestions(list);
      setCurrentIndex(idx);
      setMessage("Exam resumed from last saved progress.");
    })();

    return () => {
      cancelled = true;
    };
  }, [token, location.pathname, questions.length, authHeader, navigate]);

  const startSession = async (nextMode: ExamMode, drill?: { subject: string; topicId: number; count: number }) => {
    setMode(nextMode);
    setSelectedByQuestion({});
    setAnswerFeedbackByQuestion({});
    setFlaggedIds([]);
    setCurrentIndex(0);
    setResult(null);

    const payload =
      nextMode === "mock"
        ? studyExamType === "JAMB"
          ? {
              examType: "JAMB" as const,
              mode: "mock" as const,
              subjectCodes: [...JAMB_MOCK_SUBJECT_CODES],
              explanationMode: "deferred",
              lightTimerEnabled: false
            }
          : {
              examType: studyExamType,
              mode: "mock" as const,
              subjectCodes: [normalizeCatalogSubject(studyExamType, studySubject)],
              explanationMode: "deferred",
              lightTimerEnabled: false
            }
        : nextMode === "study"
          ? {
              examType: studyExamType,
              mode: "study",
              subjectCodes: [normalizeCatalogSubject(studyExamType, studySubject)],
              questionIds: [],
              explanationMode: "instant",
              lightTimerEnabled: false
            }
          : drill
            ? {
                examType: drillExamType,
                mode: "drill",
                subjectCodes: [normalizeCatalogSubject(drillExamType, drill.subject)],
                topicIds: [drill.topicId],
                questionCount: drill.count,
                explanationMode: drillExplanationMode,
                lightTimerEnabled: drillLightTimerEnabled
              }
            : {
              examType: drillExamType,
              mode: "drill",
              subjectCodes: [normalizeCatalogSubject(drillExamType, drillSubject)],
              topicIds: [1],
              questionCount: 10,
              explanationMode: drillExplanationMode,
              lightTimerEnabled: drillLightTimerEnabled
            };

    setSessionExamType(nextMode === "drill" ? drillExamType : studyExamType);
    setSessionExplanationMode(
      nextMode === "mock" ? "deferred" : nextMode === "study" ? "instant" : drillExplanationMode
    );

    const { res: sRes, data: sData } = await requestJson<{
      sessionId?: number;
      durationSeconds?: number;
      message?: string;
    }>(`${API_BASE}/sessions`, {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify(payload)
    });
    if (handleUnauthorized(sRes)) return;
    if (!sRes.ok) {
      setMessage(sData.message || "Failed to create session.");
      return;
    }
    const nextSessionId = Number(sData.sessionId);
    setSessionId(nextSessionId);
    setRemainingSeconds(Number(sData.durationSeconds || 0));
    const list = await loadSessionQuestions(nextSessionId);
    if (list == null) return;
    navigate("/exam");
    setMessage(`${nextMode.toUpperCase()} session started.`);
  };

  const saveAnswer = async (questionId: number, selectedOption: string) => {
    if (!sessionId) return;
    setSelectedByQuestion((prev) => ({ ...prev, [questionId]: selectedOption }));
    const { res, data } = await requestJson<{
      isCorrect?: boolean;
      correctOption?: string;
      explanation?: string;
      lessonLink?: string | null;
      message?: string;
    }>(
      `${API_BASE}/sessions/${sessionId}/answers`,
      {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({ questionId, selectedOption, timeSpentSeconds: 30 })
      }
    );
    if (handleUnauthorized(res)) return;
    if (!res.ok) {
      setMessage(data.message || "Failed to save answer.");
      return;
    }
    const correctOption = data.correctOption;
    const explanation = data.explanation;
    if (typeof correctOption === "string" && typeof explanation === "string") {
      setAnswerFeedbackByQuestion((prev) => ({
        ...prev,
        [questionId]: {
          isCorrect: Boolean(data.isCorrect),
          selectedOption,
          correctOption,
          explanation,
          lessonLink: data.lessonLink ?? null
        }
      }));
    }
    if (mode !== "mock") {
      setMessage(data.isCorrect ? "Correct." : "Not correct.");
    }
  };

  const toggleFlag = () => {
    if (!currentQuestion) return;
    const exists = flaggedIds.includes(currentQuestion.id);
    const next = exists ? flaggedIds.filter((id) => id !== currentQuestion.id) : [...flaggedIds, currentQuestion.id];
    setFlaggedIds(next);
    void pushProgress(remainingSeconds, currentIndex, next);
  };

  const goTo = (index: number) => {
    const clamped = Math.max(0, Math.min(index, questions.length - 1));
    setCurrentIndex(clamped);
    void pushProgress(remainingSeconds, clamped, flaggedIds);
  };

  const loadResult = async (nextSessionId: number) => {
    const { res, data } = await requestJson<SessionResult & { message?: string }>(
      `${API_BASE}/sessions/${nextSessionId}/result`,
      { headers: authHeader }
    );
    if (handleUnauthorized(res)) return;
    if (!res.ok) {
      setMessage(data.message || "Failed to load results.");
      return;
    }
    setResult(data as SessionResult);
    navigate("/results");
  };

  const submitSession = async () => {
    if (!sessionId) return;
    const { res, data } = await requestJson<SessionResult & { message?: string }>(`${API_BASE}/sessions/${sessionId}/submit`, {
      method: "POST",
      headers: authHeader
    });
    if (handleUnauthorized(res)) return;
    if (!res.ok) {
      setMessage(data.message || "Failed to submit.");
      return;
    }
    setResult(data as SessionResult);
    setMessage(`Submitted. Score ${data.score}/${data.total} (${data.percentage}%).`);
    await loadResult(sessionId);
  };

  const studyWeakTopics = async () => {
    if (!result) {
      setMessage("No result loaded yet.");
      return;
    }
    const weakest = (result.topicBreakdown || [])
      .filter((t) => t.topic_id != null)
      .sort((a, b) => a.percentage - b.percentage)[0];

    if (!weakest || weakest.topic_id == null) {
      setMessage("No weak topic identified yet. Open Topic Drill setup to choose one.");
      navigate("/drill-setup");
      return;
    }

    const sc = String(weakest.subject_code ?? "")
      .trim()
      .toUpperCase();
    const ex = String(result.examType ?? "JAMB")
      .trim()
      .toUpperCase();
    const examQ = (ex === "WAEC" || ex === "NECO" ? ex : "JAMB") as CatalogExam;
    const subj = normalizeCatalogSubject(examQ, sc);
    navigate(
      `/drill-setup?examType=${encodeURIComponent(examQ)}&subject=${encodeURIComponent(subj)}&topicId=${weakest.topic_id}`
    );
  };

  useEffect(() => {
    if (location.pathname !== "/exam" || mode !== "mock" || !sessionId) return;
    if (remainingSeconds <= 0) {
      void pushProgress(0, currentIndex, flaggedIds);
      return;
    }
    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = Math.max(prev - 1, 0);
        if (next % 15 === 0 || next === 0) {
          void pushProgress(next, currentIndex, flaggedIds);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [location.pathname, mode, sessionId, currentIndex, flaggedIds, remainingSeconds]);

  const goLeaderboard = () => {
    navigate("/leaderboard");
  };

  useEffect(() => {
    if (location.pathname !== "/leaderboard" || !token) return;
    let cancelled = false;
    setLeaderboardLoading(true);
    void (async () => {
      try {
        const { res, data } = await requestJson<{
          top20?: Array<{ user_id?: number; full_name: string; avg_score: number; session_count?: number }>;
          timezone?: string;
          weekLabel?: string;
          weekStartsAt?: string;
          weekEndsAt?: string;
          leaderboardResetsAt?: string;
          me?: { rank: number; full_name: string; avg_score: number; session_count?: number } | null;
          message?: string;
        }>(`${API_BASE}/leaderboard/weekly?examType=${encodeURIComponent(leaderboardExamType)}`, {
          headers: authHeader
        });
        if (handleUnauthorized(res)) return;
        if (cancelled) return;
        if (!res.ok) {
          setMessage(data.message || "Failed to load leaderboard.");
          return;
        }
        setLeaderboard(data.top20 || []);
        setLeaderboardMeta({
          timezone: data.timezone || "Africa/Lagos",
          weekLabel: data.weekLabel || "",
          weekStartsAt: data.weekStartsAt || "",
          weekEndsAt: data.weekEndsAt || "",
          leaderboardResetsAt: data.leaderboardResetsAt || "",
          me: data.me ?? null
        });
      } finally {
        setLeaderboardLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleUnauthorized stable for 401
  }, [location.pathname, token, leaderboardExamType, authHeader]);

  const loadDashboard = async () => {
    setDashboardLoading(true);
    setActiveSessionPreview(null);
    try {
      const { res, data } = await requestJson<{
        profile?: {
          fullName: string;
          sabischolar_user_id?: string | null;
          targetExam: string | null;
          targetExamYear: number | null;
        } | null;
        recentSessions?: Array<{ id: number; exam_type: string; mode: string; status: string }>;
        weakTopics?: Array<{
          topic_id: number | null;
          topic_name?: string | null;
          subject_code?: string | null;
          exam_type?: string | null;
          total: number;
          correct: number;
        }>;
        streakDays?: number;
        examCountdown?: { examDateIso: string; daysRemaining: number; label: string } | null;
        lastSubmittedSessionId?: number | null;
        predictedMockPercentByExam?: {
          JAMB: number | null;
          WAEC: number | null;
          NECO: number | null;
        };
        message?: string;
      }>(`${API_BASE}/dashboard`, { headers: authHeader });
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        setMessage(data.message || "Failed to load dashboard.");
        return;
      }
      setDashboard({
        profile: data.profile ?? null,
        recentSessions: data.recentSessions || [],
        weakTopics: data.weakTopics || [],
        streakDays: typeof data.streakDays === "number" ? data.streakDays : 0,
        examCountdown: data.examCountdown ?? null,
        lastSubmittedSessionId:
          typeof data.lastSubmittedSessionId === "number" ? data.lastSubmittedSessionId : null,
        predictedMockPercentByExam: data.predictedMockPercentByExam
      });

      if (!leaderboardProfileSyncedRef.current && data.profile) {
        const raw = data.profile.targetExam;
        if (raw != null && String(raw).trim() !== "") {
          const t = String(raw).trim().toUpperCase();
          if (t === "JAMB" || t === "WAEC" || t === "NECO") {
            setLeaderboardExamType(t);
            setStudyExamType(t);
            setStudySubject((prev) => normalizeCatalogSubject(t, prev));
          }
        }
        leaderboardProfileSyncedRef.current = true;
      }

      const { res: activeRes, data: activeData } = await requestJson<{
        session: { id: number; examType: string; mode: string } | null;
      }>(`${API_BASE}/sessions/active`, { headers: authHeader });
      if (handleUnauthorized(activeRes)) return;
      if (activeRes.ok && activeData.session) {
        setActiveSessionPreview({
          id: activeData.session.id,
          mode: activeData.session.mode,
          examType: activeData.session.examType
        });
      }
    } catch {
      setMessage("Unable to reach backend. Ensure backend is running on port 4000.");
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    if (token && location.pathname === "/dashboard") {
      void loadDashboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on route + token only
  }, [token, location.pathname]);

  const loadTopics = useCallback(
    async (
      subjectCode: string,
      options?: { preferredTopicId?: number | null; examType?: CatalogExam }
    ) => {
      const exam = options?.examType ?? drillExamType;
      const { res, data } = await fetchCatalogTopics(authHeader, {
        examType: exam,
        subjectCode
      });
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        setMessage(data.message || "Failed to load topics.");
        return;
      }
      const list = data.topics || [];
      setTopics(list);
      const pref = options?.preferredTopicId;
      const pick =
        pref != null && pref > 0 && list.some((t) => t.id === pref) ? pref : list[0]?.id ?? null;
      setDrillTopicId(pick);
    },
    [authHeader, drillExamType]
  );

  useEffect(() => {
    if (location.pathname !== "/drill-setup" || !token) return;

    const params = new URLSearchParams(location.search);
    const exParam = params.get("examType")?.trim().toUpperCase() || "";
    const exFromUrl = exParam === "JAMB" || exParam === "WAEC" || exParam === "NECO" ? (exParam as CatalogExam) : null;

    const subParam = params.get("subject")?.trim().toUpperCase() || "";

    const tidRaw = params.get("topicId");
    const preferred =
      tidRaw != null && tidRaw !== "" && Number.isFinite(Number(tidRaw)) ? Number(tidRaw) : null;

    const effectiveExam = exFromUrl ?? drillExamType;
    if (exFromUrl && exFromUrl !== drillExamType) {
      setDrillExamType(exFromUrl);
    }

    const subFromUrl =
      subParam && normalizeCatalogSubject(effectiveExam, subParam) === subParam ? subParam : null;
    const code = normalizeCatalogSubject(effectiveExam, subFromUrl ?? drillSubject);
    if (code !== drillSubject) {
      setDrillSubject(code);
      return;
    }

    void loadTopics(code, { preferredTopicId: preferred, examType: effectiveExam });
  }, [location.pathname, location.search, token, drillSubject, drillExamType, loadTopics]);

  useEffect(() => {
    if (location.pathname !== "/results" || !token) return;
    if (result !== null) return;
    let cancelled = false;
    setLoadingLastResult(true);
    void (async () => {
      try {
        const { res, data } = await requestJson<{ lastSubmittedSessionId?: number | null }>(
          `${API_BASE}/dashboard`,
          { headers: authHeader }
        );
        if (handleUnauthorized(res)) return;
        if (!res.ok || cancelled) return;
        const sid = data.lastSubmittedSessionId as number | null | undefined;
        if (sid == null) return;
        const { res: r, data: rdata } = await requestJson<SessionResult>(`${API_BASE}/sessions/${sid}/result`, {
          headers: authHeader
        });
        if (handleUnauthorized(r)) return;
        if (!r.ok || cancelled) return;
        setResult(rdata as SessionResult);
      } finally {
        if (!cancelled) setLoadingLastResult(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleUnauthorized stable enough for 401 side-effect
  }, [location.pathname, token, result, authHeader]);

  const evaluateCalc = () => {
    try {
      // Simple local calculator for exam UI convenience.
      // eslint-disable-next-line no-new-func
      const resultValue = Function(`"use strict"; return (${calcInput})`)();
      setCalcInput(String(resultValue));
    } catch {
      setCalcInput("Error");
    }
  };

  return (
    <div className="ss-app">
      <AppHeader
        token={token}
        profileReady={profileReady}
        isAdmin={isAdmin}
        onLoadLeaderboard={goLeaderboard}
        onLogout={logout}
      />

      <main className="ss-main">
        {message !== "Ready." ? <p className="ss-message">{message}</p> : null}

        <Suspense fallback={<p className="ss-muted-line">Loading page…</p>}>
        <Routes>
        <Route
          path="/auth"
          element={
            token ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <AuthPage
                authFullName={authFullName}
                setAuthFullName={setAuthFullName}
                authSabiScholarUserId={authSabiScholarUserId}
                setAuthSabiScholarUserId={setAuthSabiScholarUserId}
                authEmail={authEmail}
                setAuthEmail={setAuthEmail}
                authPassword={authPassword}
                setAuthPassword={setAuthPassword}
                onLogin={() => void login()}
                onRegister={() => void register()}
              />
            )
          }
        />
        <Route path="/auth/verify" element={<VerifyEmailPage />} />
        <Route path="/auth/forgot" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset" element={<ResetPasswordPage />} />
        <Route
          path="/auth/request-verification"
          element={
            <RequireAuth token={token}>
              <RequestVerificationPage authHeader={authHeader} handleUnauthorized={handleUnauthorized} />
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth token={token}>
              {dashboardLoading ? (
                <p className="ss-muted-line">Loading dashboard…</p>
              ) : !dashboard ? (
                <div className="ss-section" style={{ maxWidth: 520 }}>
                  <h2 style={{ marginTop: 0 }}>Dashboard unavailable</h2>
                  <p className="ss-muted-line" style={{ marginTop: 0 }}>
                    We could not load your dashboard right now. Check backend server status and try again.
                  </p>
                  <button type="button" className="ss-btn ss-btn--primary" onClick={() => void loadDashboard()}>
                    Retry
                  </button>
                </div>
              ) : (
                <DashboardPanel
                  dashboard={dashboard}
                  onStart={startSession}
                  onRefresh={loadDashboard}
                  activeSession={activeSessionPreview}
                  onContinueExam={() => navigate("/exam")}
                  studyExamType={studyExamType}
                  onStudyExamTypeChange={(exam) => {
                    setStudyExamType(exam);
                    setStudySubject((prev) => normalizeCatalogSubject(exam, prev));
                  }}
                  studySubject={studySubject}
                  onStudySubjectChange={setStudySubject}
                />
              )}
            </RequireAuth>
          }
        />
        <Route
          path="/drill-setup"
          element={
            <RequireAuth token={token}>
              <DrillSetupPage
                drillExamType={drillExamType}
                onDrillExamTypeChange={(next) => {
                  setDrillExamType(next);
                  setDrillSubject((prev) => normalizeCatalogSubject(next, prev));
                  navigate("/drill-setup", { replace: true });
                }}
                drillSubject={drillSubject}
                onDrillSubjectChange={(next) => {
                  setDrillSubject(normalizeCatalogSubject(drillExamType, next));
                  navigate("/drill-setup", { replace: true });
                }}
                drillSubjectCodes={[...subjectsForExam(drillExamType)]}
                topics={topics}
                drillTopicId={drillTopicId}
                setDrillTopicId={setDrillTopicId}
                drillCount={drillCount}
                setDrillCount={setDrillCount}
                drillExplanationMode={drillExplanationMode}
                onDrillExplanationModeChange={setDrillExplanationMode}
                drillLightTimerEnabled={drillLightTimerEnabled}
                onDrillLightTimerEnabledChange={setDrillLightTimerEnabled}
                onStartDrill={() => {
                  if (!drillTopicId) return;
                  void startSession("drill", {
                    subject: drillSubject,
                    topicId: drillTopicId,
                    count: drillCount
                  });
                }}
              />
            </RequireAuth>
          }
        />
        <Route
          path="/exam"
          element={
            <RequireAuth token={token}>
              <ExamPlayerPage
                mode={mode}
                sessionExamType={sessionExamType}
                sessionExplanationMode={sessionExplanationMode}
                questions={questions}
                currentIndex={currentIndex}
                currentQuestion={currentQuestion}
                currentAnswerFeedback={currentQuestion ? answerFeedbackByQuestion[currentQuestion.id] : undefined}
                remainingSeconds={remainingSeconds}
                flaggedIds={flaggedIds}
                selectedByQuestion={selectedByQuestion}
                showCalculator={showCalculator}
                calcInput={calcInput}
                onCalcInputChange={setCalcInput}
                onOpenCalculator={() => setShowCalculator(true)}
                onCloseCalculator={() => setShowCalculator(false)}
                onEvalCalc={evaluateCalc}
                onClearCalc={() => setCalcInput("0")}
                formatSeconds={formatSeconds}
                onGoToIndex={goTo}
                onSelectOption={saveAnswer}
                onToggleFlag={toggleFlag}
                onPrevious={() => goTo(currentIndex - 1)}
                onNext={() => goTo(currentIndex + 1)}
                onSubmit={() => void submitSession()}
              />
            </RequireAuth>
          }
        />
        <Route
          path="/results"
          element={
            <RequireAuth token={token}>
              <h1 className="ss-page-title">Results</h1>
              <ResultsPage result={result} loadingLastResult={loadingLastResult} onStudyWeakTopics={studyWeakTopics} />
            </RequireAuth>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <RequireAuth token={token}>
              <LeaderboardPage
                leaderboard={leaderboard}
                leaderboardMeta={leaderboardMeta}
                examType={leaderboardExamType}
                onExamTypeChange={setLeaderboardExamType}
                loading={leaderboardLoading}
              />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAdmin token={token} profileReady={profileReady} isAdmin={isAdmin}>
              <AdminPage authHeader={authHeader} setMessage={setMessage} handleUnauthorized={handleUnauthorized} />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<Navigate to={token ? "/dashboard" : "/auth"} replace />} />
        </Routes>
        </Suspense>
      </main>
    </div>
  );
};

