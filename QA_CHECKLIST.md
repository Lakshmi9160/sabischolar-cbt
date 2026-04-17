# SabiScholar CBT v1 QA Checklist

Use this checklist for manual verification before release. Items marked **[x]** were verified in the latest pass (see **Automated & verified** / **Manual still required** at the bottom).

## A. Environment and build

- [x] Backend starts on `http://localhost:4000` (verified while running `node scripts/qa-smoke.mjs` against a live listener).
- [x] Frontend fixed port `http://localhost:5173` with `strictPort: true` (`frontend/vite.config.ts`); production `npm run build` passes.
- [x] API prefix works under `/api/cbt/v1/*` (`backend/src/index.ts` + smoke script).
- [x] `GET /health` includes SQLite connectivity (`database: "connected"`) or **503** when DB is unreachable (`scripts/qa-smoke.mjs` asserts `connected`).
- [x] Backend typecheck passes: `cd backend && npx tsc --noEmit`.
- [x] Frontend typecheck passes: `cd frontend && npx tsc --noEmit`.

## B. Auth and profile

- [x] Register new student via `POST /api/cbt/v1/auth/register` (`qa-smoke.mjs`).
- [x] Login works and returns JWT (`POST /auth/login` in `qa-smoke.mjs`).
- [x] `GET /api/cbt/v1/auth/profile` returns user profile and `is_admin` (smoke script).
- [x] Verification and password reset request endpoints return dev tokens as expected (smoke script).
- [x] Frontend auth utility screens are wired: verify email token (`/auth/verify`), forgot password (`/auth/forgot`), reset password (`/auth/reset`), and signed-in request verification (`/auth/request-verification`) — code-path verified in `App.tsx` + page components.

## C. Question bank and taxonomy

- [x] `GET /api/cbt/v1/questions` returns filtered questions for exam/subject/topic (smoke script).
- [x] `GET /api/cbt/v1/topics` returns topic counts for subject drill setup (smoke script).
- [x] Seed data minimums are satisfied (JAMB core ≥25 each; WAEC/NECO seeded subjects ≥20 each) — enforced in `backend/src/seed.ts` (`JAMB_MIN_PER_SUBJECT`, `WAEC_NECO_MIN_PER_SUBJECT`); JAMB mock creation of 100 questions succeeds in smoke test.

## D. Session engine

- [x] JAMB mock creation enforces ENG + 3 subjects and creates 100 questions (smoke script).
- [x] Study session creation works without timer and auto-selects questions (smoke script).
- [x] Drill session creation works with topic + count (10/20/30/50) (smoke: count 10).
- [x] `PATCH /sessions/:id/progress` persists index/remaining/flags (smoke script).
- [x] `POST /sessions/:id/answers` upserts answers and correctness (smoke: drill session).
- [x] Auto-submit triggers when timer reaches zero for **timed** mocks only (`remainingSeconds <= 0` + `duration_seconds > 0`; smoke script second mock).

## E. Results and analytics

- [x] `POST /sessions/:id/submit` computes score, percentage, pass/fail (smoke script).
- [x] `GET /sessions/:id/result` returns subject/topic breakdown and review list (smoke script).
- [x] Results page shows modern visual indicators (summary card + progress bars) — hero summary, overall `ProgressBar`, subject/topic bars (`ResultsPage.tsx`, `ProgressBar` `tone="onDark"` on hero).
- [x] Results route reloads latest submitted result after refresh — `App.tsx` loads `lastSubmittedSessionId` from dashboard then `GET /sessions/:id/result` when `result` is null; uses `handleUnauthorized` for 401 parity.

## F. Leaderboard and dashboard

- [x] Weekly leaderboard filters current WAT week (Sun-Sat), mock sessions only — **API contract** verified (`GET /leaderboard/weekly` succeeds; WAT logic in `watTime.ts`).
- [x] Leaderboard returns top 20 + current user rank even if outside top 20 — **API** returns `top20` and `me` (smoke script).
- [x] Dashboard returns profile, countdown, recent sessions, weak topics, streak (`GET /dashboard` in smoke script).
- [ ] Dashboard UI shows countdown card, streak visualization, and cards — **browser / visual check** (components exist in `DashboardPanel.tsx`; confirm layout in browser). *Step-by-step: **Track 1** below (F4).*

## G. Admin and guards

- [ ] Admin bootstrap creates/promotes admin when configured — see **`backend/.env.example`** (`BOOTSTRAP_ADMIN_*`, `ALLOW_BOOTSTRAP_ADMIN` in production); verify manually when enabled. *Steps: **Track 1** below (G1).*
- [x] Non-admin cannot access admin endpoints or admin page — **403** on `GET /admin/questions` for normal user (smoke script).
- [x] Admin can load and update questions — **automated** when `QA_ADMIN_EMAIL` and `QA_ADMIN_PASSWORD` are set for an admin account: `npm run qa:api` performs list + idempotent `PUT` round-trip (`scripts/qa-smoke.mjs`). Without env, confirm manually in Admin UI.

## H. Frontend UX/accessibility

- [x] Protected routes redirect unauthenticated users to `/auth` — **code paths** (`RequireAuth`, `RequireAdmin` in `frontend/src/components/RouteGuards.tsx`); confirm in browser.
- [x] Auth route redirects logged-in user to `/dashboard` — **code path** (`App.tsx`); confirm in browser.
- [x] Main controls are touch-friendly (>=44px tap targets) — `frontend/src/styles/global.css`: `.ss-btn`, `.ss-nav-link` / `.ss-nav button`, `.ss-field` inputs and selects use `min-height: 44px` (textareas use `min-height: auto` for multi-line).
- [x] Core pages use one theme system — shared `theme.ts` (`ss` tokens) + `global.css` variables (`--ss-*`); confirm polish in browser if needed.

## I. Final sanity

- [ ] Full journey works: signup -> mock -> submit -> results -> dashboard -> leaderboard — **browser** (API subset covered by `qa-smoke.mjs`). *Steps: **Track 1** below (I1).*
- [x] Study and drill flows both save answers and show expected behavior — **API** covered (study progress without false auto-submit; drill answer POST).
- [x] `.gitignore` excludes `node_modules`, build output, sqlite db files, and `.env` (reviewed).

## Track 1 — Browser pass (F4, I1, G1)

**Prep:** `cd backend && npm run dev` (port **4000**). `cd frontend && npm run dev` (port **5173**). Open `http://localhost:5173`.

### G1 — Admin bootstrap

1. Copy `backend/.env.example` to `backend/.env` if you do not have one.
2. In `backend/.env`, set **`BOOTSTRAP_ADMIN_EMAIL`**, **`BOOTSTRAP_ADMIN_PASSWORD`**, **`BOOTSTRAP_ADMIN_FULL_NAME`** (uncomment the block in `.env.example`). For local dev, `NODE_ENV=development` is enough (production also needs **`ALLOW_BOOTSTRAP_ADMIN=1`**).
3. Restart the backend. Expect a log line: `[bootstrap] Created admin user:` *or* `Admin flag ensured for existing user:`.
4. In the browser: **Auth** → log in with that email/password → **Admin** in the header → `/admin` loads and **Load first page** returns rows (no 403). **Logout**.

### I1 — Student journey + F4 — Dashboard visuals

Use a **student** account (not the bootstrap admin), ideally a **new** email so the dashboard starts clean.

1. **Auth → Register** with a new email, password, and full name → you should land on **`/dashboard`**.
2. **F4 — Dashboard:** Confirm **Exam timeline** card, **Study streak** (number + dot row), **Quick start** (JAMB mock / Study / Topic drill), and **Recent sessions** (empty state or list). Resize to ~390px width once: layout stays readable and buttons tappable.
3. **JAMB mock:** **JAMB mock** → **`/exam`**. Answer a few questions, use **Next** and **Flag**, then **Submit** (available on the player; submits the whole session).
4. **Results:** You should be on **`/results`** with score/summary. Hard-refresh the page: summary should reload (same submitted session).
5. **Dashboard:** **Dashboard** in the nav → **Recent sessions** includes the mock with status **submitted**; streak/countdown still render sensibly.
6. **Leaderboard:** **Leaderboard** in the header → week label and **Resets** time appear; either **Your rank** with your average or the “no mocks this week” copy if the API returns no `me` row.

When G1, F4, and I1 behave as above, mark **F4**, **G1**, and **I1** checkboxes in this file **[x]**.

---

## Automated & verified (latest pass)

With **backend listening on port 4000**, from repo root:

```bash
npm run qa:api
```

Same as `node scripts/qa-smoke.mjs`. Typecheck both packages from root:

```bash
npm run qa:types
```

Types then API smoke (backend on **4000** required for the second step):

```bash
npm run qa
```

Optional API base override:

```bash
set QA_API_BASE=http://localhost:4000/api/cbt/v1
node scripts/qa-smoke.mjs
```

The script registers a throwaway user, exercises auth, questions, topics, mock/study/drill sessions, progress, answers (including instant-explanation payload), timed auto-submit, submit, result, dashboard, leaderboard, dev verification + password-reset tokens, `GET /sessions/active`, and non-admin **403** on admin list. It also verifies drill session options persisted in `/sessions/active` (`explanationMode` + `lightTimerEnabled`). With **`QA_ADMIN_EMAIL`** and **`QA_ADMIN_PASSWORD`** set, it also logs in as admin, asserts **`GET /admin/questions?examType=JAMB&subjectCode=ENG`** returns only JAMB/ENG rows, then runs **GET** + idempotent **PUT**, **POST**, and **PATCH** on `/admin/questions`.

Latest automated signoff run in this repo:

- [x] `npm run qa:types`
- [x] `npm run qa:api`

## Manual still required

Do these in the **browser** before calling the release “fully QA’d” (use **Track 1** above for ordered steps):

- Dashboard layout and cards (**F4**).
- Full click journey including navigation (**I1**).
- Admin bootstrap with env (**G1**), if you rely on auto-promotion in a new environment.
- Admin UI spot-check without env vars (**G3** optional complement to automated admin API pass).
