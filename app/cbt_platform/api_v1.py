"""Versioned HTTP API for SabiScholar CBT v1."""

from __future__ import annotations

import json
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .contracts import CreateSessionInput, RegisterUserInput, UserProfileInput
from .db import get_connection, init_db
from .seed import seed_reference_data
from .services import CBTService

API_PREFIX = "/api/cbt/v1"
ADMIN_KEY = "cbt-admin-dev"


class CBTApiHandler(BaseHTTPRequestHandler):
    def _json_response(self, status: int, payload: dict[str, object]) -> None:
        try:
            raw = json.dumps(payload, default=str, ensure_ascii=False).encode("utf-8")
        except TypeError as exc:
            status = 500
            raw = json.dumps(
                {"error": "json_serialization_failed", "detail": str(exc)},
                default=str,
                ensure_ascii=False,
            ).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _parse_json_body(self) -> dict[str, object] | None:
        """Parse POST/PUT body. On failure sends 400 and returns None."""
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        try:
            raw = self.rfile.read(length).decode("utf-8")
        except UnicodeDecodeError as exc:
            self._json_response(400, {"error": "invalid_body", "detail": f"Body must be UTF-8: {exc}"})
            return None
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            self._json_response(
                400,
                {
                    "error": "invalid_json",
                    "detail": str(exc),
                    "hint": "Send a JSON object with header Content-Type: application/json",
                },
            )
            return None
        if not isinstance(data, dict):
            self._json_response(
                400,
                {"error": "invalid_json", "detail": "JSON root must be an object {}, not an array or primitive"},
            )
            return None
        return data

    def _html_response(self, html: str) -> None:
        raw = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _service(self) -> CBTService:
        connection = get_connection()
        init_db(connection)
        seed_reference_data(connection)
        return CBTService(connection)

    def _auth_user_id(self, service: CBTService) -> int | None:
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        return service.authenticate_token(auth.replace("Bearer ", "", 1).strip())

    def _is_admin(self) -> bool:
        return self.headers.get("X-Admin-Key") == ADMIN_KEY

    def do_GET(self) -> None:  # noqa: N802
        service = self._service()
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        path = parsed.path
        try:
            if path == f"{API_PREFIX}/health":
                self._json_response(200, {"ok": True, "service": "sabischolar-cbt-v1"})
                return
            if path == "/cbt/admin":
                self._html_response(_admin_ui_template())
                return
            if path == "/cbt":
                self._html_response(_cbt_hub_template())
                return
            if path == "/cbt/dashboard":
                self._html_response(_cbt_dashboard_template())
                return
            if path == "/cbt/leaderboard":
                self._html_response(_cbt_leaderboard_template())
                return
            if path == "/cbt/login":
                self._html_response(_cbt_login_template())
                return
            if path == "/cbt/register":
                self._html_response(_cbt_register_template())
                return
            if path in ("/cbt/mock", "/cbt/study", "/cbt/drill", "/cbt/results"):
                self._html_response(_ui_template(path))
                return
            if path == f"{API_PREFIX}/launch":
                sabi_id = query.get("sabischolar_user_id", [None])[0]
                if not sabi_id:
                    self._json_response(400, {"error": "sabischolar_user_id query param is required"})
                    return
                user_id = service.ensure_user_for_sabischolar_id(str(sabi_id))
                self._json_response(200, {"bound_user_id": user_id, "sabischolar_user_id": sabi_id})
                return
            if path == f"{API_PREFIX}/questions":
                exam_type = query.get("exam_type", ["JAMB"])[0]
                subject_codes = query.get("subject_code", [])
                topic_ids = [int(raw) for raw in query.get("topic_id", [])]
                limit = int(query.get("limit", ["20"])[0])
                questions = service.fetch_questions(exam_type, subject_codes or None, topic_ids or None, limit=limit)
                self._json_response(200, {"items": [asdict(question) for question in questions]})
                return
            if path == f"{API_PREFIX}/leaderboard":
                exam_type = query.get("exam_type", ["JAMB"])[0]
                auth_uid = self._auth_user_id(service)
                q_uid = query.get("user_id", [None])[0]
                if auth_uid is not None:
                    user_id = auth_uid
                elif q_uid:
                    user_id = int(q_uid)
                else:
                    user_id = 1
                self._json_response(200, service.leaderboard(exam_type, user_id))
                return
            if path == f"{API_PREFIX}/me":
                auth_uid = self._auth_user_id(service)
                if auth_uid is None:
                    self._json_response(401, {"error": "Unauthorized", "detail": "Missing or invalid Bearer token"})
                    return
                brief = service.current_user_brief(auth_uid)
                if not brief:
                    self._json_response(404, {"error": "User not found"})
                    return
                self._json_response(200, brief)
                return
            if path == f"{API_PREFIX}/dashboard":
                auth_uid = self._auth_user_id(service)
                q_uid = query.get("user_id", [None])[0]
                if auth_uid is not None:
                    user_id = auth_uid
                elif q_uid:
                    user_id = int(q_uid)
                else:
                    user_id = 1
                self._json_response(200, service.student_dashboard(user_id))
                return
            if path.startswith(f"{API_PREFIX}/sessions/") and path.endswith("/results"):
                session_id = int(path.split("/")[-2])
                self._json_response(200, service.session_results_detail(session_id))
                return
            if path.startswith(f"{API_PREFIX}/sessions/"):
                session_id = int(path.split("/")[-1])
                bundle = service.get_session_bundle(session_id)
                if not bundle:
                    self._json_response(404, {"error": "Session not found"})
                    return
                self._json_response(200, bundle)
                return
            if path == f"{API_PREFIX}/admin/taxonomy":
                if not self._is_admin():
                    self._json_response(403, {"error": "Forbidden"})
                    return
                self._json_response(200, service.admin_list_taxonomy())
                return
            if path == f"{API_PREFIX}/admin/questions":
                if not self._is_admin():
                    self._json_response(403, {"error": "Forbidden"})
                    return
                exam_type = query.get("exam_type", [None])[0]
                subject_id = query.get("subject_id", [None])[0]
                topic_id = query.get("topic_id", [None])[0]
                limit = int(query.get("limit", ["100"])[0])
                items = service.admin_list_questions(
                    exam_type=exam_type,
                    subject_id=int(subject_id) if subject_id else None,
                    topic_id=int(topic_id) if topic_id else None,
                    limit=limit,
                )
                self._json_response(200, {"items": items})
                return
            self._json_response(404, {"error": "Route not found"})
        except Exception as exc:  # noqa: BLE001
            self._json_response(500, {"error": "internal_error", "detail": str(exc)})
        finally:
            service.connection.close()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        payload = self._parse_json_body()
        if payload is None:
            return
        service = self._service()
        try:
            if path == f"{API_PREFIX}/auth/register":
                if payload.get("sabischolar_user_id"):
                    user_id = service.ensure_user_for_sabischolar_id(str(payload["sabischolar_user_id"]))
                else:
                    user_id = service.register_user(
                        RegisterUserInput(
                            email=str(payload["email"]),
                            password_hash=service.hash_password(str(payload["password"])),
                            full_name=str(payload["full_name"]),
                        )
                    )
                self._json_response(201, {"user_id": user_id})
                return
            if path == f"{API_PREFIX}/auth/login":
                token = service.login_user(str(payload["email"]), str(payload["password"]))
                if not token:
                    self._json_response(401, {"error": "Invalid credentials"})
                    return
                self._json_response(200, {"token": token, "token_type": "Bearer"})
                return
            if path == f"{API_PREFIX}/auth/password-reset/request":
                token = service.create_password_reset_token(str(payload["email"]))
                self._json_response(200, {"reset_token": token, "message": "Use token to complete reset"})
                return
            if path == f"{API_PREFIX}/profiles/upsert":
                user_id = int(payload["user_id"])
                service.upsert_profile(
                    UserProfileInput(
                        user_id=user_id,
                        school=payload.get("school"),
                        state=payload.get("state"),
                        target_exam=payload.get("target_exam"),
                        target_exam_year=payload.get("target_exam_year"),
                        selected_subject_codes=list(payload.get("selected_subject_codes", [])),
                        parent_email=payload.get("parent_email"),
                    )
                )
                self._json_response(200, {"ok": True})
                return
            if path == f"{API_PREFIX}/sessions":
                user_id = self._auth_user_id(service)
                if not user_id and payload.get("sabischolar_user_id"):
                    user_id = service.ensure_user_for_sabischolar_id(str(payload["sabischolar_user_id"]))
                if not user_id:
                    self._json_response(401, {"error": "Unauthorized"})
                    return
                exam_type = str(payload["exam_type"])
                mode = str(payload["mode"])
                subject_codes = list(payload.get("subject_codes", []))
                topic_ids = [int(v) for v in payload.get("topic_ids", [])]
                limit = int(payload.get("question_count", 20))
                questions = service.fetch_questions(exam_type, subject_codes or None, topic_ids or None, limit=limit)
                session_id = service.create_exam_session(
                    CreateSessionInput(
                        user_id=user_id,
                        exam_type=exam_type,
                        mode=mode,
                        subject_codes=subject_codes,
                        topic_ids=topic_ids,
                        duration_seconds=payload.get("duration_seconds"),
                        explanation_mode=str(payload.get("explanation_mode", "deferred")),
                        light_timer_enabled=bool(payload.get("light_timer_enabled", False)),
                    ),
                    [item.id for item in questions],
                )
                self._json_response(201, {"session_id": session_id, "question_ids": [item.id for item in questions]})
                return
            if path.endswith("/answers") and "/sessions/" in path:
                session_id = int(path.split("/")[-2])
                service.save_answer(
                    session_id=session_id,
                    question_id=int(payload["question_id"]),
                    selected_label=payload.get("selected_label"),
                    is_flagged=bool(payload.get("is_flagged", False)),
                    time_spent_seconds=int(payload.get("time_spent_seconds", 0)),
                )
                self._json_response(200, {"ok": True})
                return
            if path.endswith("/state") and "/sessions/" in path:
                session_id = int(path.split("/")[-2])
                service.update_session_state(
                    session_id=session_id,
                    current_question_index=int(payload.get("current_question_index", 0)),
                    remaining_seconds=payload.get("remaining_seconds"),
                )
                self._json_response(200, {"ok": True})
                return
            if path.endswith("/submit") and "/sessions/" in path:
                session_id = int(path.split("/")[-2])
                result = service.submit_session(session_id)
                self._json_response(200, {"result": asdict(result)})
                return
            if path == f"{API_PREFIX}/admin/questions":
                if not self._is_admin():
                    self._json_response(403, {"error": "Forbidden"})
                    return
                question_id = service.admin_create_question(
                    exam_type=str(payload["exam_type"]),
                    subject_id=int(payload["subject_id"]),
                    topic_id=int(payload["topic_id"]),
                    year=payload.get("year"),
                    body=str(payload["body"]),
                    image_url=payload.get("image_url"),
                    options={k: str(v) for k, v in payload["options"].items()},
                    correct_label=str(payload["correct_label"]),
                    explanation=str(payload["explanation"]),
                    lesson_link=payload.get("lesson_link"),
                    difficulty=str(payload["difficulty"]),
                    source=str(payload["source"]),
                    created_by_user_id=int(payload.get("created_by_user_id", 1)),
                )
                self._json_response(201, {"question_id": question_id})
                return
            self._json_response(404, {"error": "Route not found"})
        except Exception as exc:  # noqa: BLE001
            self._json_response(500, {"error": "internal_error", "detail": str(exc)})
        finally:
            service.connection.close()

    def do_PUT(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        payload = self._parse_json_body()
        if payload is None:
            return
        service = self._service()
        try:
            if path.startswith(f"{API_PREFIX}/admin/questions/"):
                if not self._is_admin():
                    self._json_response(403, {"error": "Forbidden"})
                    return
                question_id = int(path.split("/")[-1])
                service.admin_update_question(
                    question_id=question_id,
                    body=str(payload["body"]),
                    image_url=payload.get("image_url"),
                    correct_label=str(payload["correct_label"]),
                    explanation=str(payload["explanation"]),
                    lesson_link=payload.get("lesson_link"),
                    difficulty=str(payload["difficulty"]),
                )
                self._json_response(200, {"ok": True, "question_id": question_id})
                return
            self._json_response(404, {"error": "Route not found"})
        except Exception as exc:  # noqa: BLE001
            self._json_response(500, {"error": "internal_error", "detail": str(exc)})
        finally:
            service.connection.close()


def run_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    server = ThreadingHTTPServer((host, port), CBTApiHandler)
    base = f"http://{host}:{port}"
    print(f"CBT API: {base}{API_PREFIX}/health")
    print(f"CBT app: {base}/cbt  (auth: {base}/cbt/login)")
    server.serve_forever()


def _ui_template(path: str) -> str:
    mode = {
        "/cbt/mock": "mock",
        "/cbt/study": "study",
        "/cbt/drill": "drill",
        "/cbt/results": "results",
    }[path]
    return f"""<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>SabiScholar CBT</title>
  <style>
    body{{font-family:Arial,sans-serif;margin:0;background:#f6f8fb;color:#111827}}
    .topbar{{display:flex;justify-content:space-between;gap:8px;background:#0f172a;color:#fff;padding:12px;font-size:14px;position:sticky;top:0}}
    .urgent{{color:#fca5a5;animation:pulse 1s infinite}}
    @keyframes pulse{{0%{{opacity:1}}50%{{opacity:0.65}}100%{{opacity:1}}}}
    main{{padding:12px 12px 90px;display:grid;gap:12px}}
    .card{{background:#fff;border-radius:12px;padding:12px}}
    .question{{font-size:16px;line-height:1.5;margin:0 0 10px}}
    .option{{min-height:44px;width:100%;margin:6px 0;border-radius:10px;border:1px solid #d1d5db;background:#fff;text-align:left;padding:10px}}
    .option.selected{{border-color:#2563eb;background:#eff6ff}}
    .option.correct{{border-color:#16a34a;background:#ecfdf5}}
    .option.wrong{{border-color:#dc2626;background:#fef2f2}}
    .navigator{{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}}
    .nav-btn{{min-height:44px;border:1px solid #cbd5e1;border-radius:8px;background:#fff}}
    .nav-btn.answered{{background:#dbeafe;border-color:#2563eb}}
    .nav-btn.flagged{{background:#fef3c7;border-color:#d97706}}
    footer{{position:fixed;left:0;right:0;bottom:0;background:#fff;padding:10px;border-top:1px solid #e5e7eb;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}}
    .btn{{min-height:44px;border:1px solid #d1d5db;border-radius:10px;background:#fff}}
    .btn.primary{{background:#2563eb;border-color:#2563eb;color:#fff}}
    .hide{{display:none}}
    .muted{{color:#6b7280}}
    .empty{{padding:24px;text-align:center}}
  </style>
</head>
<body data-mode="{mode}">
  <div class="topbar">
    <span id="studentName">Student</span>
    <span id="subjectTabs">-</span>
    <span id="timer">--:--</span>
  </div>
  <main id="app"></main>
  <footer id="actions" class="hide">
    <button class="btn" id="prevBtn">Previous</button>
    <button class="btn" id="flagBtn">Flag</button>
    <button class="btn" id="nextBtn">Next</button>
  </footer>
  <script>
    const mode = document.body.dataset.mode;
    const app = document.getElementById('app');
    const timerEl = document.getElementById('timer');
    const tabsEl = document.getElementById('subjectTabs');
    const actionsEl = document.getElementById('actions');
    const KEY = 'cbt_session_' + mode;
    let state = {{session:null, questions:[], idx:0, startedAt:Date.now(), lastChangeAt:Date.now()}};
    const params = new URLSearchParams(location.search);
    const userId = Number(params.get('user_id') || '1');
    function authHeaders() {{
      const t = localStorage.getItem('cbt_access_token');
      return t ? {{ Authorization: 'Bearer ' + t }} : {{}};
    }}
    const examType = params.get('exam_type') || 'JAMB';
    const subjectCodes = (params.get('subjects') || 'ENG,MTH,PHY,BIO').split(',').filter(Boolean);
    const questionCount = Number(params.get('count') || (mode === 'mock' ? '20' : '10'));
    const durationSeconds = mode === 'mock' ? 2 * 60 * 60 : (mode === 'drill' && params.get('timer') === 'on' ? 30 * 60 : null);
    const explanationMode = (mode === 'study' || params.get('explain') === 'instant') ? 'instant' : 'deferred';

    async function api(path, options={{}}) {{
      const response = await fetch(path, {{
        headers: {{'Content-Type':'application/json', ...authHeaders(), ...(options.headers || {{}})}},
        ...options
      }});
      return response.json();
    }}
    function fmt(secs) {{
      if (secs == null) return '--:--';
      const m = Math.floor(secs / 60).toString().padStart(2,'0');
      const s = Math.floor(secs % 60).toString().padStart(2,'0');
      const h = Math.floor(secs / 3600).toString();
      return h > 0 ? h.padStart(2,'0') + ':' + m + ':' + s : m + ':' + s;
    }}
    function persistLocal() {{
      localStorage.setItem(KEY, JSON.stringify({{sessionId: state.session?.id, idx: state.idx, remaining: state.session?.remaining_seconds}}));
    }}
    async function bootstrap() {{
      if (mode === 'results') {{
        await renderResultsPage();
        return;
      }}
      let sessionId = Number(params.get('session_id') || '0');
      if (!sessionId) {{
        const cached = localStorage.getItem(KEY);
        if (cached) {{
          try {{ sessionId = Number(JSON.parse(cached).sessionId || 0); }} catch (_) {{}}
        }}
      }}
      if (!sessionId) {{
        const token = localStorage.getItem('cbt_access_token');
        const sessionPayload = {{
            exam_type: examType,
            mode: mode,
            subject_codes: subjectCodes,
            topic_ids: [],
            question_count: questionCount,
            duration_seconds: durationSeconds,
            explanation_mode: explanationMode,
            light_timer_enabled: false
        }};
        if (!token) sessionPayload.user_id = userId;
        const created = await api('{API_PREFIX}/sessions', {{
          method:'POST',
          body: JSON.stringify(sessionPayload)
        }});
        sessionId = created.session_id;
      }}
      const bundle = await api('{API_PREFIX}/sessions/' + sessionId);
      state.session = bundle.session;
      state.questions = bundle.questions;
      state.idx = Math.min(state.session.current_question_index || 0, Math.max(state.questions.length - 1, 0));
      tabsEl.textContent = (state.session.subject_codes || []).join(' | ') || '-';
      actionsEl.classList.remove('hide');
      render();
      persistLocal();
      if (!state.session.is_submitted) setInterval(tick, 1000);
    }}
    async function tick() {{
      if (!state.session || state.session.is_submitted) return;
      if (state.session.remaining_seconds != null) {{
        state.session.remaining_seconds -= 1;
        if (state.session.remaining_seconds < 0) state.session.remaining_seconds = 0;
        if (state.session.remaining_seconds <= 10 * 60) timerEl.classList.add('urgent');
        timerEl.textContent = fmt(state.session.remaining_seconds);
        if (state.session.remaining_seconds === 0) {{
          await submitSession();
          return;
        }}
      }} else {{
        timerEl.textContent = 'No timer';
      }}
      if (Date.now() - state.lastChangeAt > 3000) {{
        state.lastChangeAt = Date.now();
        await api('{API_PREFIX}/sessions/' + state.session.id + '/state', {{
          method:'POST',
          body: JSON.stringify({{
            current_question_index: state.idx,
            remaining_seconds: state.session.remaining_seconds
          }})
        }});
      }}
    }}
    function currentQ() {{ return state.questions[state.idx]; }}
    function navClass(question) {{
      if (question.is_flagged) return 'nav-btn flagged';
      if (question.selected_label) return 'nav-btn answered';
      return 'nav-btn';
    }}
    function explanationBlock(q) {{
      if (!q.explanation) return '';
      const lesson = q.lesson_link ? `<a class="btn primary" style="display:inline-block;text-decoration:none;padding:10px 12px" href="${{q.lesson_link}}">Watch lesson on SabiScholar</a>` : '';
      return `<div class="card"><strong>Explanation</strong><p class="question">${{q.explanation}}</p>${{lesson}}</div>`;
    }}
    function render() {{
      if (!state.questions.length) {{
        app.innerHTML = '<section class="card empty"><h3>Welcome to SabiScholar CBT</h3><p class="muted">Start your first session to see your progress and analytics.</p></section>';
        return;
      }}
      const q = currentQ();
      timerEl.textContent = fmt(state.session.remaining_seconds);
      app.innerHTML = `
        <section class="card">
          <div class="muted">Question ${{state.idx + 1}} of ${{state.questions.length}} • ${{q.subject_code}}</div>
          <p class="question">${{q.body}}</p>
          ${{q.options.map(opt => {{
            let cls = 'option';
            if (q.selected_label === opt.label) cls += ' selected';
            if (state.session.is_submitted && opt.label === q.correct_label) cls += ' correct';
            if (state.session.is_submitted && q.selected_label === opt.label && q.selected_label !== q.correct_label) cls += ' wrong';
            return `<button class="${{cls}}" data-option="${{opt.label}}">${{opt.label}}. ${{opt.text}}</button>`;
          }}).join('')}}
        </section>
        <section class="card">
          <div class="muted">Navigator</div>
          <div class="navigator">
            ${{state.questions.map((item, i) => `<button class="${{navClass(item)}}" data-nav="${{i}}">${{i + 1}}</button>`).join('')}}
          </div>
        </section>
        ${{(mode !== 'mock' || state.session.is_submitted || explanationMode === 'instant') ? explanationBlock(q) : ''}}
      `;
      wireEvents();
      document.getElementById('prevBtn').disabled = state.idx === 0;
      document.getElementById('nextBtn').textContent = state.idx === state.questions.length - 1 ? 'Submit' : 'Next';
      document.getElementById('flagBtn').textContent = q.is_flagged ? 'Unflag' : 'Flag';
    }}
    function wireEvents() {{
      app.querySelectorAll('[data-option]').forEach(el => el.onclick = async () => {{
        const label = el.dataset.option;
        const q = currentQ();
        q.selected_label = label;
        state.lastChangeAt = Date.now();
        await api('{API_PREFIX}/sessions/' + state.session.id + '/answers', {{
          method:'POST',
          body: JSON.stringify({{
            question_id: q.id,
            selected_label: label,
            is_flagged: q.is_flagged,
            time_spent_seconds: (q.time_spent_seconds || 0) + 1
          }})
        }});
        render();
        persistLocal();
      }});
      app.querySelectorAll('[data-nav]').forEach(el => el.onclick = async () => {{
        state.idx = Number(el.dataset.nav);
        state.lastChangeAt = Date.now();
        render();
        persistLocal();
      }});
      document.getElementById('prevBtn').onclick = () => {{
        if (state.idx > 0) {{ state.idx -= 1; state.lastChangeAt = Date.now(); render(); persistLocal(); }}
      }};
      document.getElementById('nextBtn').onclick = async () => {{
        if (state.idx < state.questions.length - 1) {{
          state.idx += 1;
          state.lastChangeAt = Date.now();
          render();
          persistLocal();
          return;
        }}
        await submitSession();
      }};
      document.getElementById('flagBtn').onclick = async () => {{
        const q = currentQ();
        q.is_flagged = !q.is_flagged;
        state.lastChangeAt = Date.now();
        await api('{API_PREFIX}/sessions/' + state.session.id + '/answers', {{
          method:'POST',
          body: JSON.stringify({{
            question_id: q.id,
            selected_label: q.selected_label,
            is_flagged: q.is_flagged,
            time_spent_seconds: q.time_spent_seconds || 0
          }})
        }});
        render();
      }};
    }}
    async function submitSession() {{
      if (state.session.is_submitted) return;
      const response = await api('{API_PREFIX}/sessions/' + state.session.id + '/submit', {{method:'POST', body:'{{}}'}});
      state.session.is_submitted = true;
      localStorage.removeItem(KEY);
      location.href = '/cbt/results?session_id=' + state.session.id + '&score=' + response.result.score_percent;
    }}
    async function renderResultsPage() {{
      const sessionId = Number(params.get('session_id') || '0');
      if (!sessionId) {{
        app.innerHTML = '<section class="card empty"><h3>No session result yet</h3><p class="muted">Complete a session to see results.</p></section>';
        return;
      }}
      const result = await api('{API_PREFIX}/sessions/' + sessionId + '/results');
      const weak = (result.weak_topics || []).map(item => `<li>${{item.topic}} - ${{item.accuracy}}%</li>`).join('');
      const review = (result.questions_to_review || []).map(item => `<li>Q${{item.question_id}}: Correct is ${{item.correct_label}}. ${{item.explanation}}</li>`).join('');
      app.innerHTML = `
        <section class="card">
          <h2 style="margin:0 0 8px">Score: ${{result.score_percent}}%</h2>
          <p class="question">${{result.score_percent >= 50 ? 'Great progress. Keep it up.' : 'You are improving. Focus on weak topics and try again.'}}</p>
        </section>
        <section class="card"><h3>Weak Topics</h3><ul>${{weak || '<li>No weak topics yet.</li>'}}</ul></section>
        <section class="card"><h3>Questions to Review</h3><ul>${{review || '<li>No incorrect questions. Excellent work.</li>'}}</ul></section>
        <section class="card"><a class="btn primary" href="/cbt/drill?exam_type=${{result.exam_type}}">Study weak topics</a></section>
      `;
    }}
    bootstrap();
  </script>
</body>
</html>"""


def _admin_ui_template() -> str:
    """Mobile-first question bank admin (protected by X-Admin-Key from browser)."""
    html = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>SabiScholar CBT — Admin</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 0; background: #f1f5f9; color: #0f172a; font-size: 16px; }
    header {
      background: #0f172a; color: #fff; padding: 12px 14px; position: sticky; top: 0; z-index: 10;
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
    }
    header h1 { margin: 0; font-size: 1.05rem; font-weight: 600; flex: 1 1 100%; }
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    label { font-size: 0.85rem; color: #475569; font-weight: 500; }
    input, select, textarea, button {
      min-height: 44px; border-radius: 10px; border: 1px solid #cbd5e1; padding: 10px 12px; font-size: 16px;
      box-sizing: border-box; width: 100%;
    }
    textarea { min-height: 88px; resize: vertical; font-family: inherit; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .btn { background: #fff; cursor: pointer; font-weight: 500; }
    .btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }
    .btn-ghost { background: transparent; color: #e2e8f0; border-color: #475569; }
    main { padding: 12px; max-width: 720px; margin: 0 auto; padding-bottom: 32px; }
    .card { background: #fff; border-radius: 14px; padding: 14px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
    .card h2 { margin: 0 0 12px; font-size: 1.1rem; }
    .msg { padding: 10px 12px; border-radius: 10px; margin-bottom: 12px; font-size: 0.95rem; }
    .msg.err { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .msg.ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
    .list-item { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
    .list-item p { margin: 6px 0 0; font-size: 0.9rem; color: #64748b; line-height: 1.4; }
    .tag { display: inline-block; background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; margin-right: 6px; }
    .muted { color: #64748b; font-size: 0.85rem; }
    .opts-readonly { background: #f8fafc; padding: 10px; border-radius: 8px; font-size: 0.9rem; white-space: pre-wrap; }
  </style>
</head>
<body>
  <header>
    <h1>Question bank admin</h1>
    <div class="field" style="flex:2;min-width:200px;margin:0">
      <label for="adminKey">Admin key (X-Admin-Key)</label>
      <input type="password" id="adminKey" placeholder="Paste admin key" autocomplete="off"/>
    </div>
    <button type="button" class="btn btn-ghost" id="saveKey" style="margin-top:22px;width:auto;min-width:100px">Save key</button>
  </header>
  <main>
    <div id="flash"></div>
    <section class="card">
      <h2>Browse &amp; filter</h2>
      <div class="row2">
        <div class="field"><label for="exam">Exam</label>
          <select id="exam"><option value="">—</option><option>JAMB</option><option>WAEC</option><option>NECO</option></select></div>
        <div class="field"><label for="limit">List limit</label>
          <input type="number" id="limit" value="50" min="1" max="200"/></div>
      </div>
      <div class="field"><label for="subject">Subject</label><select id="subject"><option value="">— Load taxonomy first —</option></select></div>
      <div class="field"><label for="topic">Topic</label><select id="topic"><option value="">—</option></select></div>
      <button type="button" class="btn btn-primary" id="loadList">Load questions</button>
    </section>
    <section class="card">
      <h2 id="formTitle">Create question</h2>
      <p class="muted" id="editHint" style="display:none">Editing updates body, media, answer key, explanation, lesson link, and difficulty only. To change options or taxonomy, create a new question.</p>
      <input type="hidden" id="editId" value=""/>
      <div class="row2">
        <div class="field"><label for="cExam">Exam</label><select id="cExam"><option>JAMB</option><option>WAEC</option><option>NECO</option></select></div>
        <div class="field"><label for="year">Year (optional)</label><input type="number" id="year" placeholder="e.g. 2024"/></div>
      </div>
      <div class="field"><label for="cSubject">Subject</label><select id="cSubject"></select></div>
      <div class="field"><label for="cTopic">Topic</label><select id="cTopic"></select></div>
      <div class="field"><label for="body">Question body</label><textarea id="body" required></textarea></div>
      <div class="field"><label for="imageUrl">Image URL (optional)</label><input type="url" id="imageUrl" placeholder="https://…"/></div>
      <div class="row2">
        <div class="field"><label>Option A</label><input type="text" id="optA" required/></div>
        <div class="field"><label>Option B</label><input type="text" id="optB" required/></div>
        <div class="field"><label>Option C</label><input type="text" id="optC" required/></div>
        <div class="field"><label>Option D</label><input type="text" id="optD" required/></div>
      </div>
      <div class="row2">
        <div class="field"><label for="correct">Correct answer</label>
          <select id="correct"><option>A</option><option>B</option><option>C</option><option>D</option></select></div>
        <div class="field"><label for="difficulty">Difficulty</label>
          <select id="difficulty"><option>easy</option><option>medium</option><option>hard</option></select></div>
        <div class="field"><label for="source">Source</label>
          <select id="source"><option value="past_question">past_question</option><option value="ai_generated">ai_generated</option></select></div>
        <div class="field"><label for="createdBy">Created by user id</label><input type="number" id="createdBy" value="1" min="1"/></div>
      </div>
      <div class="field"><label for="explanation">Explanation</label><textarea id="explanation" required></textarea></div>
      <div class="field"><label for="lessonLink">Lesson link (optional)</label><input type="url" id="lessonLink" placeholder="Future SabiScholar deep link"/></div>
      <div id="optsReadonlyWrap" style="display:none" class="field">
        <label>Options (read-only while editing)</label>
        <div class="opts-readonly" id="optsReadonly"></div>
      </div>
      <div class="row2" style="grid-template-columns:1fr 1fr">
        <button type="button" class="btn btn-primary" id="submitCreate">Create question</button>
        <button type="button" class="btn" id="submitEdit" style="display:none">Save changes</button>
      </div>
      <button type="button" class="btn" id="cancelEdit" style="display:none;margin-top:10px;width:100%">Cancel edit / new question</button>
    </section>
    <section class="card">
      <h2>Results</h2>
      <div id="list"></div>
    </section>
  </main>
  <script>
(function() {
  const API = "__API__";
  const LS_KEY = "cbt_admin_key";
  const adminKeyEl = document.getElementById("adminKey");
  const flashEl = document.getElementById("flash");
  const examEl = document.getElementById("exam");
  const subjectEl = document.getElementById("subject");
  const topicEl = document.getElementById("topic");
  const limitEl = document.getElementById("limit");
  const listEl = document.getElementById("list");
  let taxonomy = null;

  function flash(msg, isErr) {
    flashEl.innerHTML = msg ? "<div class=\"msg " + (isErr ? "err" : "ok") + "\">" + escapeHtml(msg) + "</div>" : "";
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }
  function headers() {
    const k = localStorage.getItem(LS_KEY) || adminKeyEl.value.trim();
    return { "Content-Type": "application/json", "X-Admin-Key": k };
  }
  async function api(path, opts) {
    const r = await fetch(API + path, Object.assign({ headers: headers() }, opts || {}));
    const text = await r.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
    if (!r.ok) throw new Error(data.detail || data.error || r.status + " " + r.statusText);
    return data;
  }

  document.getElementById("saveKey").onclick = function() {
    localStorage.setItem(LS_KEY, adminKeyEl.value.trim());
    flash("Key saved in this browser.", false);
    loadTaxonomy();
  };
  if (localStorage.getItem(LS_KEY)) adminKeyEl.value = localStorage.getItem(LS_KEY);

  async function loadTaxonomy() {
    try {
      taxonomy = await api("/admin/taxonomy", { method: "GET" });
      flash("", false);
      syncFilterSubjects();
      syncFormSubjects();
    } catch (e) {
      flash(e.message || String(e), true);
    }
  }

  function subjectsForExam(exam) {
    if (!taxonomy || !taxonomy.exams || !exam) return [];
    return taxonomy.exams[exam] || [];
  }

  function syncFilterSubjects() {
    const exam = examEl.value;
    subjectEl.innerHTML = "<option value=\"\">All subjects</option>";
    topicEl.innerHTML = "<option value=\"\">All topics</option>";
    subjectsForExam(exam).forEach(function(s) {
      const o = document.createElement("option");
      o.value = String(s.subject_id);
      o.textContent = s.code + " — " + s.name;
      subjectEl.appendChild(o);
    });
  }
  function syncFilterTopics() {
    var ex = examEl.value;
    const sid = subjectEl.value;
    topicEl.innerHTML = "<option value=\"\">All topics</option>";
    if (!sid) return;
    const sub = subjectsForExam(ex).find(function(x) { return String(x.subject_id) === sid; });
    if (!sub || !sub.topics) return;
    sub.topics.forEach(function(t) {
      const o = document.createElement("option");
      o.value = String(t.id);
      o.textContent = t.name;
      topicEl.appendChild(o);
    });
  }
  examEl.onchange = function() { syncFilterSubjects(); };
  subjectEl.onchange = syncFilterTopics;

  const cExamEl = document.getElementById("cExam");
  const cSubjectEl = document.getElementById("cSubject");
  const cTopicEl = document.getElementById("cTopic");

  function syncFormSubjects() {
    const exam = cExamEl.value;
    cSubjectEl.innerHTML = "";
    cTopicEl.innerHTML = "<option value=\"\">—</option>";
    subjectsForExam(exam).forEach(function(s) {
      const o = document.createElement("option");
      o.value = String(s.subject_id);
      o.textContent = s.code + " — " + s.name;
      cSubjectEl.appendChild(o);
    });
    syncFormTopics();
  }
  function syncFormTopics() {
    const sid = cSubjectEl.value;
    cTopicEl.innerHTML = "<option value=\"\">— select topic —</option>";
    if (!sid) return;
    const sub = subjectsForExam(cExamEl.value).find(function(x) { return String(x.subject_id) === sid; });
    if (!sub || !sub.topics) return;
    sub.topics.forEach(function(t) {
      const o = document.createElement("option");
      o.value = String(t.id);
      o.textContent = t.name;
      cTopicEl.appendChild(o);
    });
  }
  cExamEl.onchange = syncFormSubjects;
  cSubjectEl.onchange = syncFormTopics;

  document.getElementById("loadList").onclick = async function() {
    try {
      const q = new URLSearchParams();
      if (examEl.value) q.set("exam_type", examEl.value);
      if (subjectEl.value) q.set("subject_id", subjectEl.value);
      if (topicEl.value) q.set("topic_id", topicEl.value);
      q.set("limit", limitEl.value || "50");
      const data = await api("/admin/questions?" + q.toString(), { method: "GET" });
      renderList(data.items || []);
      flash("Loaded " + (data.items || []).length + " questions.", false);
    } catch (e) {
      flash(e.message || String(e), true);
    }
  };

  function renderList(items) {
    if (!items.length) {
      listEl.innerHTML = "<p class=\"muted\">No questions match this filter.</p>";
      return;
    }
    listEl.innerHTML = items.map(function(q) {
      var prev = (q.body || "").slice(0, 120).replace(/</g, "&lt;");
      return "<div class=\"list-item\" data-id=\"" + q.id + "\">" +
        "<div><span class=\"tag\">#" + q.id + "</span><span class=\"tag\">" + escapeHtml(q.exam_type) + "</span>" +
        "<span class=\"tag\">" + escapeHtml(q.subject_code) + "</span><span class=\"tag\">" + escapeHtml(q.topic_name) + "</span></div>" +
        "<p>" + prev + (q.body && q.body.length > 120 ? "…" : "") + "</p>" +
        "<button type=\"button\" class=\"btn btn-primary edit-btn\" data-id=\"" + q.id + "\" style=\"margin-top:8px\">Edit</button></div>";
    }).join("");
    listEl.querySelectorAll(".edit-btn").forEach(function(btn) {
      btn.onclick = function() { startEdit(Number(btn.dataset.id), items); };
    });
  }

  function setCreateMode() {
    document.getElementById("editId").value = "";
    document.getElementById("formTitle").textContent = "Create question";
    document.getElementById("editHint").style.display = "none";
    document.getElementById("optsReadonlyWrap").style.display = "none";
    document.getElementById("submitCreate").style.display = "block";
    document.getElementById("submitEdit").style.display = "none";
    document.getElementById("cancelEdit").style.display = "none";
    ["optA","optB","optC","optD","cExam","cSubject","cTopic","year","source","createdBy"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.removeAttribute("disabled");
    });
  }

  function startEdit(id, items) {
    var q = items.find(function(x) { return x.id === id; });
    if (!q) return;
    document.getElementById("editId").value = String(q.id);
    document.getElementById("formTitle").textContent = "Edit question #" + q.id;
    document.getElementById("editHint").style.display = "block";
    document.getElementById("optsReadonlyWrap").style.display = "block";
    var optLines = ["A: " + (q.options.A||""), "B: " + (q.options.B||""), "C: " + (q.options.C||""), "D: " + (q.options.D||"")];
    document.getElementById("optsReadonly").textContent = optLines.join("\n");
    cExamEl.value = q.exam_type;
    syncFormSubjects();
    cSubjectEl.value = String(q.subject_id);
    syncFormTopics();
    cTopicEl.value = String(q.topic_id);
    document.getElementById("year").value = q.year != null ? String(q.year) : "";
    document.getElementById("body").value = q.body || "";
    document.getElementById("imageUrl").value = q.image_url || "";
    document.getElementById("optA").value = q.options.A || "";
    document.getElementById("optB").value = q.options.B || "";
    document.getElementById("optC").value = q.options.C || "";
    document.getElementById("optD").value = q.options.D || "";
    document.getElementById("correct").value = q.correct_label;
    document.getElementById("difficulty").value = q.difficulty;
    document.getElementById("source").value = q.source;
    document.getElementById("explanation").value = q.explanation || "";
    document.getElementById("lessonLink").value = q.lesson_link || "";
    document.getElementById("submitCreate").style.display = "none";
    document.getElementById("submitEdit").style.display = "block";
    document.getElementById("cancelEdit").style.display = "block";
    ["optA","optB","optC","optD","cExam","cSubject","cTopic","year","source","createdBy"].forEach(function(id) {
      document.getElementById(id).setAttribute("disabled", "disabled");
    });
    window.scrollTo(0, 0);
    flash("Loaded question #" + q.id + " into the form.", false);
  }

  document.getElementById("cancelEdit").onclick = function() {
    setCreateMode();
    flash("Ready to create a new question.", false);
  };

  document.getElementById("submitCreate").onclick = async function() {
    try {
      var sid = Number(cSubjectEl.value);
      var tid = Number(cTopicEl.value);
      if (!sid || !tid) throw new Error("Select subject and topic.");
      var yearVal = document.getElementById("year").value.trim();
      var payload = {
        exam_type: cExamEl.value,
        subject_id: sid,
        topic_id: tid,
        year: yearVal ? Number(yearVal) : null,
        body: document.getElementById("body").value.trim(),
        image_url: document.getElementById("imageUrl").value.trim() || null,
        options: {
          A: document.getElementById("optA").value.trim(),
          B: document.getElementById("optB").value.trim(),
          C: document.getElementById("optC").value.trim(),
          D: document.getElementById("optD").value.trim()
        },
        correct_label: document.getElementById("correct").value,
        explanation: document.getElementById("explanation").value.trim(),
        lesson_link: document.getElementById("lessonLink").value.trim() || null,
        difficulty: document.getElementById("difficulty").value,
        source: document.getElementById("source").value,
        created_by_user_id: Number(document.getElementById("createdBy").value) || 1
      };
      var res = await api("/admin/questions", { method: "POST", body: JSON.stringify(payload) });
      flash("Created question #" + res.question_id, false);
      setCreateMode();
      document.getElementById("loadList").click();
    } catch (e) {
      flash(e.message || String(e), true);
    }
  };

  document.getElementById("submitEdit").onclick = async function() {
    try {
      var id = Number(document.getElementById("editId").value);
      if (!id) throw new Error("No question selected.");
      var payload = {
        body: document.getElementById("body").value.trim(),
        image_url: document.getElementById("imageUrl").value.trim() || null,
        correct_label: document.getElementById("correct").value,
        explanation: document.getElementById("explanation").value.trim(),
        lesson_link: document.getElementById("lessonLink").value.trim() || null,
        difficulty: document.getElementById("difficulty").value
      };
      await api("/admin/questions/" + id, { method: "PUT", body: JSON.stringify(payload) });
      flash("Saved question #" + id, false);
      setCreateMode();
      document.getElementById("loadList").click();
    } catch (e) {
      flash(e.message || String(e), true);
    }
  };

  loadTaxonomy();
})();
  </script>
</body>
</html>
"""
    return html.replace("__API__", API_PREFIX)


def _cbt_hub_template() -> str:
    return r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>SabiScholar CBT</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #f1f5f9; color: #0f172a; font-size: 16px; }
    header { background: #0f172a; color: #fff; padding: 16px; }
    h1 { margin: 0 0 6px; font-size: 1.2rem; }
    p { margin: 0; opacity: 0.9; font-size: 0.95rem; }
    main { padding: 16px; max-width: 480px; margin: 0 auto; }
    a.tile {
      display: block; min-height: 48px; padding: 14px 16px; margin-bottom: 10px;
      background: #fff; border-radius: 12px; text-decoration: none; color: #0f172a;
      border: 1px solid #e2e8f0; font-weight: 500;
    }
    a.tile:active { background: #e2e8f0; }
    .muted { font-size: 0.85rem; color: #64748b; margin-top: 16px; }
  </style>
</head>
<body>
  <header><h1>SabiScholar CBT</h1><p>JAMB · WAEC · NECO practice</p></header>
  <main>
    <a class="tile" href="/cbt/login">Sign in</a>
    <a class="tile" href="/cbt/register">Create account</a>
    <a class="tile" href="/cbt/dashboard">Dashboard — streak, weak topics, countdown</a>
    <a class="tile" href="/cbt/mock?user_id=1">Mock exam</a>
    <a class="tile" href="/cbt/study?user_id=1">Study mode</a>
    <a class="tile" href="/cbt/drill?user_id=1">Topic drill</a>
    <a class="tile" href="/cbt/leaderboard">Weekly leaderboard</a>
    <p class="muted">Signed-in users use a saved token (no <code>user_id</code> in links). Otherwise change <code>?user_id=</code> or set id on Dashboard. Deep link: <code>?sabischolar_user_id=</code> on Dashboard.</p>
    <p class="muted"><a href="/cbt/admin" style="color:#64748b">Question bank admin</a></p>
  </main>
</body>
</html>"""


def _cbt_dashboard_template() -> str:
    html = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Dashboard — SabiScholar CBT</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #f1f5f9; color: #0f172a; font-size: 16px; }
    header { background: #0f172a; color: #fff; padding: 14px 16px; position: sticky; top: 0; }
    header h1 { margin: 0; font-size: 1.1rem; }
    header p { margin: 4px 0 0; opacity: 0.9; font-size: 0.9rem; }
    main { padding: 14px; max-width: 520px; margin: 0 auto 32px; }
    .card { background: #fff; border-radius: 14px; padding: 14px; margin-bottom: 12px; border: 1px solid #e2e8f0; }
    .card h2 { margin: 0 0 10px; font-size: 1rem; }
    .countdown-big { font-size: 1.75rem; font-weight: 700; color: #2563eb; }
    .muted { color: #64748b; font-size: 0.9rem; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    a.btn {
      display: inline-flex; align-items: center; justify-content: center; min-height: 44px;
      padding: 0 14px; border-radius: 10px; background: #2563eb; color: #fff; text-decoration: none;
      font-weight: 500; font-size: 0.95rem;
    }
    a.btn.secondary { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; }
    ul { margin: 0; padding-left: 1.1rem; }
    li { margin: 6px 0; }
    .empty { text-align: center; padding: 20px 12px; }
    .pill { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem; margin-right: 6px; }
    input { min-height: 44px; padding: 10px 12px; border-radius: 10px; border: 1px solid #cbd5e1; width: 100%; max-width: 200px; font-size: 16px; box-sizing: border-box; }
  </style>
</head>
<body>
  <header>
    <h1 id="greeting">Your dashboard</h1>
    <p id="subgreet"></p>
  </header>
  <main>
    <div class="card">
      <h2>Your account</h2>
      <p class="muted" id="authLinks"><a href="/cbt/login" style="color:#2563eb">Sign in</a> · <a href="/cbt/register" style="color:#2563eb">Register</a></p>
      <p class="muted">User id (demo fallback if not signed in)</p>
      <input type="number" id="userId" min="1" value="1"/>
      <div class="row">
        <button type="button" class="btn secondary" id="saveUid" style="min-height:44px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;font-size:16px;cursor:pointer;padding:0 14px">Save</button>
        <button type="button" class="btn secondary" id="logoutBtn" style="min-height:44px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;font-size:16px;cursor:pointer;padding:0 14px;display:none">Sign out</button>
      </div>
    </div>
    <div class="card" id="countdownCard">
      <h2>Target exam</h2>
      <div id="countdownBody"></div>
    </div>
    <div class="card">
      <h2>Quick start</h2>
      <div class="row">
        <a class="btn" id="linkMock" href="#">Mock</a>
        <a class="btn secondary" id="linkStudy" href="#">Study</a>
        <a class="btn secondary" id="linkDrill" href="#">Drill</a>
      </div>
    </div>
    <div class="card">
      <h2>Streak</h2>
      <p id="streakText"></p>
    </div>
    <div class="card">
      <h2>Weak topics</h2>
      <div id="weakTopics"></div>
    </div>
    <div class="card">
      <h2>Recent sessions</h2>
      <div id="recent"></div>
    </div>
    <p class="muted" style="text-align:center"><a href="/cbt" style="color:#64748b">Home</a> · <a href="/cbt/leaderboard" style="color:#64748b">Leaderboard</a></p>
  </main>
  <script>
(function() {
  const API = "__API__";
  const LS_UID = "cbt_dashboard_user_id";
  const LS_TOK = "cbt_access_token";
  const params = new URLSearchParams(location.search);
  var uid = Number(params.get("user_id") || localStorage.getItem(LS_UID) || "1");
  document.getElementById("userId").value = String(uid);

  function authHeaders() {
    var t = localStorage.getItem(LS_TOK);
    return t ? { Authorization: "Bearer " + t } : {};
  }

  function updateAuthUi() {
    var t = localStorage.getItem(LS_TOK);
    document.getElementById("logoutBtn").style.display = t ? "inline-block" : "none";
    document.getElementById("authLinks").style.display = t ? "none" : "block";
  }

  async function resolveUser() {
    var sabi = params.get("sabischolar_user_id");
    if (sabi) {
      var r = await fetch(API + "/launch?sabischolar_user_id=" + encodeURIComponent(sabi));
      var j = await r.json();
      if (j.bound_user_id) {
        uid = j.bound_user_id;
        document.getElementById("userId").value = String(uid);
        localStorage.setItem(LS_UID, String(uid));
      }
    }
    var t = localStorage.getItem(LS_TOK);
    if (t) {
      try {
        var mr = await fetch(API + "/me", { headers: { Authorization: "Bearer " + t } });
        if (mr.ok) {
          var mj = await mr.json();
          uid = mj.user_id;
          document.getElementById("userId").value = String(uid);
          localStorage.setItem(LS_UID, String(uid));
        }
      } catch (e) {}
    }
    updateAuthUi();
  }

  function setLinks() {
    var u = document.getElementById("userId").value;
    var t = localStorage.getItem(LS_TOK);
    var q = t ? "" : ("?user_id=" + u);
    document.getElementById("linkMock").href = "/cbt/mock" + q;
    document.getElementById("linkStudy").href = "/cbt/study" + q;
    document.getElementById("linkDrill").href = "/cbt/drill" + q;
  }

  document.getElementById("logoutBtn").onclick = function() {
    localStorage.removeItem(LS_TOK);
    updateAuthUi();
    setLinks();
    load();
  };

  document.getElementById("saveUid").onclick = function() {
    localStorage.setItem(LS_UID, document.getElementById("userId").value);
    uid = Number(document.getElementById("userId").value);
    setLinks();
    load();
  };

  async function load() {
    uid = Number(document.getElementById("userId").value) || 1;
    var t = localStorage.getItem(LS_TOK);
    var qs = t ? "" : ("?user_id=" + uid);
    var r = await fetch(API + "/dashboard" + qs, { headers: authHeaders() });
    var d = await r.json();
    var name = d.greeting_name || "Student";
    document.getElementById("greeting").textContent = "Hi, " + name.split(" ")[0];
    document.getElementById("subgreet").textContent = d.profile && d.profile.school ? (d.profile.school + (d.profile.state ? " · " + d.profile.state : "")) : "Keep practising — small steps add up.";

    var cd = d.exam_countdown;
    var cdEl = document.getElementById("countdownBody");
    if (cd && cd.has_target) {
      cdEl.innerHTML = "<div class=\"pill\">" + cd.exam_type + " " + cd.year + "</div>" +
        "<p class=\"countdown-big\">" + cd.days_remaining + " days</p>" +
        "<p class=\"muted\">Approx. date: " + cd.approx_exam_date + " (update when you wire official dates)</p>";
    } else {
      cdEl.innerHTML = "<p class=\"muted\">" + (cd && cd.message ? cd.message : "Set target exam in your profile via API: POST " + API + "/profiles/upsert") + "</p>";
    }

    document.getElementById("streakText").textContent = d.streak_days ? (d.streak_days + "-day streak — nice work.") : "Complete a session today to start a streak.";

    var weak = d.weak_topics || [];
    document.getElementById("weakTopics").innerHTML = weak.length
      ? "<ul>" + weak.map(function(w) { return "<li>" + w.topic + " — " + w.accuracy + "% (" + w.attempted + " attempts)</li>"; }).join("") + "</ul>"
      + "<div class=\"row\"><a class=\"btn\" href=\"/cbt/drill" + (localStorage.getItem(LS_TOK) ? "" : ("?user_id=" + uid)) + "\">Drill weak areas</a></div>"
      : "<div class=\"empty muted\">No topic data yet. Finish a few sessions to see focus areas.</div>";

    var recent = d.recent_sessions || [];
    document.getElementById("recent").innerHTML = recent.length
      ? "<ul>" + recent.map(function(s) {
          return "<li><span class=\"pill\">" + s.exam_type + "</span><span class=\"pill\">" + s.mode + "</span> "
            + s.score_percent + "% — <a href=\"/cbt/results?session_id=" + s.session_id + "\">View</a></li>";
        }).join("") + "</ul>"
      : "<div class=\"empty muted\">You have not finished a session yet. Try a mock exam or study mode from Quick start.</div>";
  }

  resolveUser().then(function() {
    setLinks();
    load();
  });
})();
  </script>
</body>
</html>"""
    return html.replace("__API__", API_PREFIX)


def _cbt_leaderboard_template() -> str:
    html = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Leaderboard — SabiScholar CBT</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #f1f5f9; color: #0f172a; font-size: 16px; }
    header { background: #0f172a; color: #fff; padding: 14px 16px; }
    h1 { margin: 0; font-size: 1.1rem; }
    .tabs { display: flex; gap: 8px; padding: 12px 16px; background: #fff; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
    .tabs button {
      min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid #cbd5e1;
      background: #fff; font-size: 16px; cursor: pointer;
    }
    .tabs button.on { background: #2563eb; color: #fff; border-color: #2563eb; }
    main { padding: 14px; max-width: 520px; margin: 0 auto; }
    .card { background: #fff; border-radius: 14px; padding: 14px; margin-bottom: 12px; border: 1px solid #e2e8f0; }
    .row { display: flex; justify-content: space-between; align-items: center; min-height: 48px; border-bottom: 1px solid #f1f5f9; }
    .row:last-child { border-bottom: none; }
    .rank { font-weight: 700; width: 2rem; color: #64748b; }
    .you { background: #eff6ff; margin: 0 -14px; padding: 10px 14px; border-radius: 10px; }
    .muted { color: #64748b; font-size: 0.85rem; }
    input { min-height: 44px; padding: 10px; border-radius: 10px; border: 1px solid #cbd5e1; width: 100px; font-size: 16px; }
  </style>
</head>
<body>
  <header><h1>Weekly leaderboard (mock exams)</h1></header>
  <div class="tabs">
    <button type="button" class="tab on" data-exam="JAMB">JAMB</button>
    <button type="button" class="tab" data-exam="WAEC">WAEC</button>
    <button type="button" class="tab" data-exam="NECO">NECO</button>
    <span class="muted" style="margin-left:auto">User id: <input type="number" id="uid" value="1" min="1"/></span>
  </div>
  <main>
    <p class="muted" id="weekLabel"></p>
    <div class="card" id="board"></div>
    <p class="muted" style="text-align:center"><a href="/cbt" style="color:#64748b">Home</a> · <a href="/cbt/dashboard" style="color:#64748b">Dashboard</a></p>
  </main>
  <script>
(function() {
  const API = "__API__";
  var exam = "JAMB";
  var uidEl = document.getElementById("uid");
  if (localStorage.getItem("cbt_dashboard_user_id")) uidEl.value = localStorage.getItem("cbt_dashboard_user_id");

  function render(data) {
    document.getElementById("weekLabel").textContent = "Week starting " + data.week_start_wat + " (WAT) · Top mock scores";
    var rows = (data.top || []).map(function(t) {
      return "<div class=\"row\"><span class=\"rank\">#" + t.rank + "</span><span>" + (t.full_name || "Student") + "</span><span>" + Math.round(t.score * 10) / 10 + "%</span></div>";
    }).join("");
    var you = "";
    if (data.current_user_rank) {
      you = "<div class=\"you\"><strong>Your rank:</strong> #" + data.current_user_rank.rank + " · " + Math.round(data.current_user_rank.score * 10) / 10 + "%</div>";
    }
    document.getElementById("board").innerHTML = you + (rows || "<p class=\"muted\">No mock scores this week yet.</p>");
  }

  async function load() {
    var uid = uidEl.value || "1";
    var t = localStorage.getItem("cbt_access_token");
    var qs = "exam_type=" + exam + (t ? "" : ("&user_id=" + uid));
    var h = t ? { Authorization: "Bearer " + t } : {};
    var r = await fetch(API + "/leaderboard?" + qs, { headers: h });
    render(await r.json());
  }

  document.querySelectorAll(".tab").forEach(function(b) {
    b.onclick = function() {
      document.querySelectorAll(".tab").forEach(function(x) { x.classList.remove("on"); });
      b.classList.add("on");
      exam = b.getAttribute("data-exam");
      load();
    };
  });
  uidEl.onchange = load;
  load();
})();
  </script>
</body>
</html>"""
    return html.replace("__API__", API_PREFIX)


def _cbt_login_template() -> str:
    html = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Sign in — SabiScholar CBT</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #f1f5f9; font-size: 16px; }
    header { background: #0f172a; color: #fff; padding: 16px; }
    h1 { margin: 0; font-size: 1.15rem; }
    main { padding: 16px; max-width: 400px; margin: 0 auto; }
    .card { background: #fff; border-radius: 14px; padding: 16px; border: 1px solid #e2e8f0; }
    label { display: block; margin: 12px 0 4px; color: #475569; font-size: 0.9rem; }
    input { width: 100%; min-height: 44px; padding: 10px 12px; border-radius: 10px; border: 1px solid #cbd5e1; font-size: 16px; box-sizing: border-box; }
    button { width: 100%; min-height: 48px; margin-top: 16px; border-radius: 10px; border: none; background: #2563eb; color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; }
    .err { background: #fef2f2; color: #991b1b; padding: 10px; border-radius: 10px; margin-bottom: 12px; font-size: 0.95rem; }
    .muted { color: #64748b; font-size: 0.9rem; margin-top: 16px; text-align: center; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <header><h1>Sign in</h1></header>
  <main>
    <div class="card">
      <div id="msg"></div>
      <label for="email">Email</label>
      <input type="email" id="email" autocomplete="username" required/>
      <label for="password">Password</label>
      <input type="password" id="password" autocomplete="current-password" required/>
      <button type="button" id="go">Continue</button>
    </div>
    <p class="muted"><a href="/cbt/register">Create an account</a> · <a href="/cbt">Home</a></p>
  </main>
  <script>
(function() {
  const API = "__API__";
  document.getElementById("go").onclick = async function() {
    var msg = document.getElementById("msg");
    msg.innerHTML = "";
    try {
      var r = await fetch(API + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: document.getElementById("email").value.trim(),
          password: document.getElementById("password").value
        })
      });
      var j = await r.json();
      if (!r.ok) throw new Error(j.detail || j.error || "Login failed");
      localStorage.setItem("cbt_access_token", j.token);
      location.href = "/cbt/dashboard";
    } catch (e) {
      msg.innerHTML = "<div class=\"err\">" + (e.message || String(e)) + "</div>";
    }
  };
})();
  </script>
</body>
</html>"""
    return html.replace("__API__", API_PREFIX)


def _cbt_register_template() -> str:
    html = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Register — SabiScholar CBT</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #f1f5f9; font-size: 16px; }
    header { background: #0f172a; color: #fff; padding: 16px; }
    h1 { margin: 0; font-size: 1.15rem; }
    main { padding: 16px; max-width: 400px; margin: 0 auto; }
    .card { background: #fff; border-radius: 14px; padding: 16px; border: 1px solid #e2e8f0; }
    label { display: block; margin: 12px 0 4px; color: #475569; font-size: 0.9rem; }
    input { width: 100%; min-height: 44px; padding: 10px 12px; border-radius: 10px; border: 1px solid #cbd5e1; font-size: 16px; box-sizing: border-box; }
    button { width: 100%; min-height: 48px; margin-top: 16px; border-radius: 10px; border: none; background: #2563eb; color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; }
    .err { background: #fef2f2; color: #991b1b; padding: 10px; border-radius: 10px; margin-bottom: 12px; font-size: 0.95rem; }
    .muted { color: #64748b; font-size: 0.9rem; margin-top: 16px; text-align: center; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <header><h1>Create account</h1></header>
  <main>
    <div class="card">
      <div id="msg"></div>
      <label for="fullName">Full name</label>
      <input type="text" id="fullName" required/>
      <label for="email">Email</label>
      <input type="email" id="email" autocomplete="username" required/>
      <label for="password">Password</label>
      <input type="password" id="password" autocomplete="new-password" required/>
      <button type="button" id="go">Register</button>
    </div>
    <p class="muted"><a href="/cbt/login">Already have an account?</a> · <a href="/cbt">Home</a></p>
  </main>
  <script>
(function() {
  const API = "__API__";
  document.getElementById("go").onclick = async function() {
    var msg = document.getElementById("msg");
    msg.innerHTML = "";
    var email = document.getElementById("email").value.trim();
    var password = document.getElementById("password").value;
    try {
      var reg = await fetch(API + "/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email,
          password: password,
          full_name: document.getElementById("fullName").value.trim()
        })
      });
      var rj = await reg.json();
      if (!reg.ok) throw new Error(rj.detail || rj.error || "Registration failed");
      var login = await fetch(API + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, password: password })
      });
      var lj = await login.json();
      if (!login.ok) throw new Error(lj.detail || lj.error || "Account created; please sign in.");
      localStorage.setItem("cbt_access_token", lj.token);
      location.href = "/cbt/dashboard";
    } catch (e) {
      msg.innerHTML = "<div class=\"err\">" + (e.message || String(e)) + "</div>";
    }
  };
})();
  </script>
</body>
</html>"""
    return html.replace("__API__", API_PREFIX)
