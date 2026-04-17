import React, { useEffect, useState } from "react";
import { API_BASE } from "../api";
import { fetchCatalogTopics } from "../api/questions";
import { requestJson } from "../apiClient";
import { ss } from "../theme";

type QuestionRow = {
  id: number;
  exam_type: string;
  subject_code: string;
  question_body: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation: string;
  difficulty?: string;
  source?: string;
  topic_id?: number | null;
  year?: number | null;
  lesson_link?: string | null;
  image_url?: string | null;
};

const PAGE_SIZE = 50;

type ListResponse = {
  questions?: QuestionRow[];
  limit?: number;
  offset?: number;
  returned?: number;
  hasMore?: boolean;
  message?: string;
};

type Props = {
  authHeader: Record<string, string>;
  setMessage: (msg: string) => void;
  handleUnauthorized: (res: Response) => boolean;
};

export const AdminPage: React.FC<Props> = ({ authHeader, setMessage, handleUnauthorized }) => {
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [selected, setSelected] = useState<QuestionRow | null>(null);
  const [listOffset, setListOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filterExam, setFilterExam] = useState<string>("");
  const [filterSubject, setFilterSubject] = useState<string>("");
  const [filterTopicId, setFilterTopicId] = useState<number | null>(null);
  const [topicsForFilter, setTopicsForFilter] = useState<Array<{ id: number; topic_name: string; question_count: number }>>(
    []
  );
  const [createDraft, setCreateDraft] = useState<{
    exam_type: "JAMB" | "WAEC" | "NECO";
    subject_code: string;
    topic_id: string;
    year: string;
    question_body: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: "A" | "B" | "C" | "D";
    explanation: string;
    lesson_link: string;
    difficulty: string;
    source: string;
    image_url: string;
  }>({
    exam_type: "JAMB",
    subject_code: "ENG",
    topic_id: "",
    year: "",
    question_body: "",
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    correct_option: "A",
    explanation: "",
    lesson_link: "",
    difficulty: "medium",
    source: "ai_generated",
    image_url: ""
  });

  useEffect(() => {
    if (!filterExam || !filterSubject.trim()) {
      setTopicsForFilter([]);
      setFilterTopicId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const sc = filterSubject.trim().toUpperCase();
      const { res, data } = await fetchCatalogTopics(authHeader, { examType: filterExam, subjectCode: sc });
      if (handleUnauthorized(res)) return;
      if (cancelled) return;
      if (!res.ok) {
        setTopicsForFilter([]);
        return;
      }
      const list = data.topics || [];
      setTopicsForFilter(list);
      setFilterTopicId((prev) => {
        if (prev == null) return null;
        return list.some((t) => t.id === prev) ? prev : null;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleUnauthorized from parent is stable for 401 handling
  }, [filterExam, filterSubject, authHeader]);

  const fetchPage = async (targetOffset: number) => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(targetOffset)
    });
    if (filterExam) {
      params.set("examType", filterExam);
    }
    const subj = filterSubject.trim().toUpperCase();
    if (filterExam && subj) {
      params.set("subjectCode", subj);
    }
    if (filterExam && subj && filterTopicId != null) {
      params.set("topicId", String(filterTopicId));
    }
    const { res, data } = await requestJson<ListResponse>(`${API_BASE}/admin/questions?${params}`, {
      headers: authHeader
    });
    if (handleUnauthorized(res)) return;
    if (!res.ok) {
      setMessage(data.message || "Failed to load admin questions.");
      return;
    }
    const list = data.questions || [];
    setRows(list);
    setListOffset(typeof data.offset === "number" ? data.offset : targetOffset);
    setHasMore(Boolean(data.hasMore));
    const n = typeof data.returned === "number" ? data.returned : list.length;
    setMessage(`Loaded ${n} question(s) at offset ${typeof data.offset === "number" ? data.offset : targetOffset}.`);
  };

  const loadFirstPage = () => {
    setListOffset(0);
    void fetchPage(0);
  };

  const loadNextPage = () => {
    if (!hasMore) return;
    void fetchPage(listOffset + rows.length);
  };

  const loadPrevPage = () => {
    if (listOffset <= 0) return;
    void fetchPage(Math.max(0, listOffset - PAGE_SIZE));
  };

  const saveSelected = async () => {
    if (!selected) return;
    const { res, data } = await requestJson<{ ok?: boolean; message?: string }>(
      `${API_BASE}/admin/questions/${selected.id}`,
      {
        method: "PUT",
        headers: authHeader,
        body: JSON.stringify(selected)
      }
    );
    if (handleUnauthorized(res)) return;
    if (!res.ok) {
      setMessage(data.message || "Failed to update question.");
      return;
    }
    setMessage(data.ok ? "Question updated." : "No changes saved.");
    if (data.ok) void fetchPage(listOffset);
  };

  const createQuestion = async () => {
    if (
      !createDraft.subject_code.trim() ||
      !createDraft.question_body.trim() ||
      !createDraft.option_a.trim() ||
      !createDraft.option_b.trim() ||
      !createDraft.option_c.trim() ||
      !createDraft.option_d.trim() ||
      !createDraft.explanation.trim()
    ) {
      setMessage("Fill all required create-question fields.");
      return;
    }
    const payload = {
      exam_type: createDraft.exam_type,
      subject_code: createDraft.subject_code.trim().toUpperCase(),
      topic_id: createDraft.topic_id.trim() ? Number(createDraft.topic_id) : null,
      year: createDraft.year.trim() ? Number(createDraft.year) : null,
      question_body: createDraft.question_body.trim(),
      option_a: createDraft.option_a.trim(),
      option_b: createDraft.option_b.trim(),
      option_c: createDraft.option_c.trim(),
      option_d: createDraft.option_d.trim(),
      correct_option: createDraft.correct_option,
      explanation: createDraft.explanation.trim(),
      lesson_link: createDraft.lesson_link.trim() || null,
      difficulty: createDraft.difficulty.trim() || "medium",
      source: createDraft.source.trim() || "ai_generated",
      image_url: createDraft.image_url.trim() || null
    };
    const { res, data } = await requestJson<{ id?: number; message?: string }>(`${API_BASE}/admin/questions`, {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify(payload)
    });
    if (handleUnauthorized(res)) return;
    if (!res.ok) {
      setMessage(data.message || "Failed to create question.");
      return;
    }
    setMessage(`Question created (#${data.id ?? "new"}).`);
    setCreateDraft((prev) => ({
      ...prev,
      question_body: "",
      option_a: "",
      option_b: "",
      option_c: "",
      option_d: "",
      explanation: "",
      lesson_link: "",
      image_url: ""
    }));
    void fetchPage(0);
  };

  return (
    <>
      <h1 className="ss-page-title">Admin · Questions</h1>
      <div className="ss-section" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: "1rem" }}>Create question</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="ss-field" style={{ marginBottom: 0, minWidth: 120 }}>
              <label htmlFor="create-exam">Exam</label>
              <select
                id="create-exam"
                value={createDraft.exam_type}
                onChange={(e) => setCreateDraft({ ...createDraft, exam_type: e.target.value as "JAMB" | "WAEC" | "NECO" })}
              >
                <option value="JAMB">JAMB</option>
                <option value="WAEC">WAEC</option>
                <option value="NECO">NECO</option>
              </select>
            </div>
            <div className="ss-field" style={{ marginBottom: 0, minWidth: 120 }}>
              <label htmlFor="create-subject">Subject</label>
              <input
                id="create-subject"
                value={createDraft.subject_code}
                onChange={(e) => setCreateDraft({ ...createDraft, subject_code: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="ss-field" style={{ marginBottom: 0, minWidth: 120 }}>
              <label htmlFor="create-topic">Topic ID</label>
              <input
                id="create-topic"
                value={createDraft.topic_id}
                onChange={(e) => setCreateDraft({ ...createDraft, topic_id: e.target.value })}
                placeholder="optional"
              />
            </div>
            <div className="ss-field" style={{ marginBottom: 0, minWidth: 120 }}>
              <label htmlFor="create-year">Year</label>
              <input
                id="create-year"
                value={createDraft.year}
                onChange={(e) => setCreateDraft({ ...createDraft, year: e.target.value })}
                placeholder="optional"
              />
            </div>
          </div>
          <div className="ss-field" style={{ marginBottom: 0 }}>
            <label htmlFor="create-body">Question body</label>
            <textarea
              id="create-body"
              style={{ minHeight: 90 }}
              value={createDraft.question_body}
              onChange={(e) => setCreateDraft({ ...createDraft, question_body: e.target.value })}
            />
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <div className="ss-field" style={{ marginBottom: 0 }}>
              <label htmlFor="create-a">Option A</label>
              <input id="create-a" value={createDraft.option_a} onChange={(e) => setCreateDraft({ ...createDraft, option_a: e.target.value })} />
            </div>
            <div className="ss-field" style={{ marginBottom: 0 }}>
              <label htmlFor="create-b">Option B</label>
              <input id="create-b" value={createDraft.option_b} onChange={(e) => setCreateDraft({ ...createDraft, option_b: e.target.value })} />
            </div>
            <div className="ss-field" style={{ marginBottom: 0 }}>
              <label htmlFor="create-c">Option C</label>
              <input id="create-c" value={createDraft.option_c} onChange={(e) => setCreateDraft({ ...createDraft, option_c: e.target.value })} />
            </div>
            <div className="ss-field" style={{ marginBottom: 0 }}>
              <label htmlFor="create-d">Option D</label>
              <input id="create-d" value={createDraft.option_d} onChange={(e) => setCreateDraft({ ...createDraft, option_d: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="ss-field" style={{ marginBottom: 0, minWidth: 120 }}>
              <label htmlFor="create-correct">Correct option</label>
              <select
                id="create-correct"
                value={createDraft.correct_option}
                onChange={(e) => setCreateDraft({ ...createDraft, correct_option: e.target.value as "A" | "B" | "C" | "D" })}
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </div>
            <div className="ss-field" style={{ marginBottom: 0, minWidth: 140 }}>
              <label htmlFor="create-difficulty">Difficulty</label>
              <input
                id="create-difficulty"
                value={createDraft.difficulty}
                onChange={(e) => setCreateDraft({ ...createDraft, difficulty: e.target.value })}
              />
            </div>
            <div className="ss-field" style={{ marginBottom: 0, minWidth: 140 }}>
              <label htmlFor="create-source">Source</label>
              <input
                id="create-source"
                value={createDraft.source}
                onChange={(e) => setCreateDraft({ ...createDraft, source: e.target.value })}
              />
            </div>
          </div>
          <div className="ss-field" style={{ marginBottom: 0 }}>
            <label htmlFor="create-explanation">Explanation</label>
            <textarea
              id="create-explanation"
              style={{ minHeight: 80 }}
              value={createDraft.explanation}
              onChange={(e) => setCreateDraft({ ...createDraft, explanation: e.target.value })}
            />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="ss-field" style={{ marginBottom: 0, flex: "1 1 260px" }}>
              <label htmlFor="create-lesson">Lesson link</label>
              <input
                id="create-lesson"
                value={createDraft.lesson_link}
                onChange={(e) => setCreateDraft({ ...createDraft, lesson_link: e.target.value })}
                placeholder="optional"
              />
            </div>
            <div className="ss-field" style={{ marginBottom: 0, flex: "1 1 260px" }}>
              <label htmlFor="create-image">Image URL</label>
              <input
                id="create-image"
                value={createDraft.image_url}
                onChange={(e) => setCreateDraft({ ...createDraft, image_url: e.target.value })}
                placeholder="optional"
              />
            </div>
          </div>
          <div>
            <button type="button" className="ss-btn ss-btn--primary" onClick={() => void createQuestion()}>
              Create question
            </button>
          </div>
        </div>
      </div>
      <div className="ss-section" style={{ marginBottom: "1rem", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div className="ss-field" style={{ marginBottom: 0, minWidth: 140 }}>
            <label htmlFor="adm-filter-exam">Exam</label>
            <select
              id="adm-filter-exam"
              value={filterExam}
              onChange={(e) => {
                setFilterExam(e.target.value);
                if (!e.target.value) {
                  setFilterSubject("");
                  setFilterTopicId(null);
                }
              }}
            >
              <option value="">All exams</option>
              <option value="JAMB">JAMB</option>
              <option value="WAEC">WAEC</option>
              <option value="NECO">NECO</option>
            </select>
          </div>
          <div className="ss-field" style={{ marginBottom: 0, minWidth: 120 }}>
            <label htmlFor="adm-filter-subject">Subject code</label>
            <input
              id="adm-filter-subject"
              placeholder={filterExam ? "e.g. ENG" : "Pick exam first"}
              value={filterSubject}
              onChange={(e) => {
                setFilterSubject(e.target.value);
                setFilterTopicId(null);
              }}
              disabled={!filterExam}
              maxLength={8}
            />
          </div>
          <div className="ss-field" style={{ marginBottom: 0, minWidth: 200, flex: "1 1 220px" }}>
            <label htmlFor="adm-filter-topic">Topic</label>
            <select
              id="adm-filter-topic"
              value={filterTopicId == null ? "" : String(filterTopicId)}
              onChange={(e) => {
                const v = e.target.value;
                setFilterTopicId(v === "" ? null : Number(v));
              }}
              disabled={!filterExam || !filterSubject.trim() || topicsForFilter.length === 0}
            >
              <option value="">Any topic</option>
              {topicsForFilter.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.topic_name} ({t.question_count})
                </option>
              ))}
            </select>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: "0.8125rem", color: ss.muted, maxWidth: "52ch" }}>
          Subject filter applies together with exam. Leave subject empty to list all subjects for that exam. Optional topic
          narrows the list after exam and subject are set.
        </p>
      </div>
      <div className="ss-section" style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" className="ss-btn ss-btn--primary" onClick={loadFirstPage}>
          Load first page
        </button>
        <button type="button" className="ss-btn" onClick={loadPrevPage} disabled={listOffset <= 0}>
          Previous
        </button>
        <button type="button" className="ss-btn" onClick={loadNextPage} disabled={!hasMore}>
          Next
        </button>
        <span style={{ color: ss.muted, fontSize: "0.875rem" }}>
          Offset {listOffset} · {PAGE_SIZE} per page
          {hasMore ? " · more after this page" : ""}
        </span>
      </div>
      <div className="ss-section ss-admin-grid">
        <div
          style={{
            maxHeight: 360,
            overflow: "auto",
            border: `1px solid ${ss.border}`,
            borderRadius: ss.radiusSm,
            padding: 8,
            background: ss.bg
          }}
        >
          {rows.map((r) => (
            <button
              type="button"
              key={r.id}
              onClick={() => setSelected({ ...r })}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                marginBottom: 8,
                minHeight: 44,
                padding: "10px 12px",
                fontSize: "0.875rem",
                borderRadius: ss.radiusSm,
                border: `1px solid ${selected?.id === r.id ? ss.primary : ss.border}`,
                background: selected?.id === r.id ? ss.primaryMuted : ss.surface,
                color: ss.text,
                cursor: "pointer"
              }}
            >
              #{r.id} [{r.exam_type}-{r.subject_code}
              {r.topic_id != null ? ` · t${r.topic_id}` : ""}] {r.question_body.slice(0, 72)}
              {r.question_body.length > 72 ? "…" : ""}
            </button>
          ))}
        </div>
        <div>
          {!selected ? (
            <p style={{ color: ss.muted, fontSize: "0.9375rem", margin: 0 }}>Select a question to edit.</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div className="ss-field" style={{ marginBottom: 0, minWidth: 120 }}>
                  <label htmlFor="adm-exam">Exam</label>
                  <input id="adm-exam" value={selected.exam_type} onChange={(e) => setSelected({ ...selected, exam_type: e.target.value.toUpperCase() })} />
                </div>
                <div className="ss-field" style={{ marginBottom: 0, minWidth: 120 }}>
                  <label htmlFor="adm-subject">Subject</label>
                  <input
                    id="adm-subject"
                    value={selected.subject_code}
                    onChange={(e) => setSelected({ ...selected, subject_code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="ss-field" style={{ marginBottom: 0, minWidth: 120 }}>
                  <label htmlFor="adm-topic-id">Topic ID</label>
                  <input
                    id="adm-topic-id"
                    value={selected.topic_id ?? ""}
                    onChange={(e) =>
                      setSelected({ ...selected, topic_id: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                </div>
                <div className="ss-field" style={{ marginBottom: 0, minWidth: 120 }}>
                  <label htmlFor="adm-year">Year</label>
                  <input
                    id="adm-year"
                    value={selected.year ?? ""}
                    onChange={(e) => setSelected({ ...selected, year: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="ss-field">
                <label htmlFor="adm-q">Question</label>
                <textarea
                  id="adm-q"
                  style={{ minHeight: 120 }}
                  value={selected.question_body}
                  onChange={(e) => setSelected({ ...selected, question_body: e.target.value })}
                />
              </div>
              <div className="ss-field">
                <label htmlFor="adm-correct">Correct option</label>
                <input
                  id="adm-correct"
                  value={selected.correct_option}
                  onChange={(e) => setSelected({ ...selected, correct_option: e.target.value.toUpperCase() })}
                />
              </div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                <div className="ss-field" style={{ marginBottom: 0 }}>
                  <label htmlFor="adm-a">Option A</label>
                  <input id="adm-a" value={selected.option_a} onChange={(e) => setSelected({ ...selected, option_a: e.target.value })} />
                </div>
                <div className="ss-field" style={{ marginBottom: 0 }}>
                  <label htmlFor="adm-b">Option B</label>
                  <input id="adm-b" value={selected.option_b} onChange={(e) => setSelected({ ...selected, option_b: e.target.value })} />
                </div>
                <div className="ss-field" style={{ marginBottom: 0 }}>
                  <label htmlFor="adm-c">Option C</label>
                  <input id="adm-c" value={selected.option_c} onChange={(e) => setSelected({ ...selected, option_c: e.target.value })} />
                </div>
                <div className="ss-field" style={{ marginBottom: 0 }}>
                  <label htmlFor="adm-d">Option D</label>
                  <input id="adm-d" value={selected.option_d} onChange={(e) => setSelected({ ...selected, option_d: e.target.value })} />
                </div>
              </div>
              <div className="ss-field">
                <label htmlFor="adm-ex">Explanation</label>
                <textarea
                  id="adm-ex"
                  style={{ minHeight: 100 }}
                  value={selected.explanation}
                  onChange={(e) => setSelected({ ...selected, explanation: e.target.value })}
                />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div className="ss-field" style={{ marginBottom: 0, flex: "1 1 200px" }}>
                  <label htmlFor="adm-lesson">Lesson link</label>
                  <input
                    id="adm-lesson"
                    value={selected.lesson_link ?? ""}
                    onChange={(e) => setSelected({ ...selected, lesson_link: e.target.value })}
                  />
                </div>
                <div className="ss-field" style={{ marginBottom: 0, flex: "1 1 200px" }}>
                  <label htmlFor="adm-image">Image URL</label>
                  <input
                    id="adm-image"
                    value={selected.image_url ?? ""}
                    onChange={(e) => setSelected({ ...selected, image_url: e.target.value })}
                  />
                </div>
              </div>
              <button type="button" className="ss-btn ss-btn--primary" onClick={saveSelected}>
                Save changes
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
};
