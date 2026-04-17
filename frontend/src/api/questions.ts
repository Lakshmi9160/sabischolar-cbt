import { API_BASE } from "../api";
import { requestJson } from "../apiClient";
import type { Question } from "../types";

export type CatalogTopicRow = {
  id: number;
  exam_type?: string;
  subject_code?: string;
  topic_name: string;
  question_count: number;
};

export async function fetchCatalogTopics(
  authHeader: Record<string, string>,
  params: { examType: string; subjectCode: string }
): Promise<{ res: Response; data: { topics?: CatalogTopicRow[]; message?: string } }> {
  const q = new URLSearchParams({
    examType: params.examType,
    subjectCode: params.subjectCode
  });
  return requestJson(`${API_BASE}/topics?${q}`, { headers: authHeader });
}

export async function fetchCatalogQuestions(
  authHeader: Record<string, string>,
  params: {
    examType: string;
    subjectCode: string;
    limit?: number;
    topicId?: number;
    year?: number;
  }
): Promise<{ res: Response; data: { questions?: Question[]; message?: string } }> {
  const q = new URLSearchParams({
    examType: params.examType,
    subjectCode: params.subjectCode,
    limit: String(params.limit ?? 20)
  });
  if (params.topicId != null && Number.isFinite(params.topicId)) {
    q.set("topicId", String(params.topicId));
  }
  if (params.year != null && Number.isFinite(params.year)) {
    q.set("year", String(params.year));
  }
  return requestJson(`${API_BASE}/questions?${q}`, { headers: authHeader });
}
