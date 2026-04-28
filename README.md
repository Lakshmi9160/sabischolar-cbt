# SabiScholar CBT (Standalone v1)

Standalone CBT platform for JAMB, WAEC, and NECO built with:
- Backend: Node.js + Express + TypeScript
- Frontend: React + Vite + TypeScript
- Database: SQLite

**Quick start (both servers):** from the repo root, after installs and `backend/.env` exist, run `npm install` then `npm run dev` — backend (**4000**) and frontend (**5173**) start together. Use **Ctrl+C** once to stop both.

## 1) Backend setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend runs on `http://localhost:4000` and serves CBT API routes under:
- `/api/cbt/v1/health`
- `/api/cbt/v1/auth/*`
- `/api/cbt/v1/questions`
- `/api/cbt/v1/topics`
- `/api/cbt/v1/subjects`
- `/api/cbt/v1/sessions/*`
- `/api/cbt/v1/leaderboard/weekly`
- `/api/cbt/v1/dashboard`
- `/api/cbt/v1/admin/questions`

## 2) Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and proxies `/api` to backend.

## 3) Step-by-step flow to test

1. Open frontend (`http://localhost:5173`).
2. Go to **Auth** → fill name, email, password → **Create account** (or **Log in**).
3. On **Dashboard**, start **Study mode** or **JAMB mock** → **Exam** → **Submit** when ready.
4. Open **Results** after submit; use **Leaderboard** for weekly mock rankings.

## 4) E2E (Playwright)

With **backend** (port **4000**) and **frontend** (port **5173**) already running, from the repo root:

```bash
npm run e2e:install
npm run e2e
```

Use `npm run e2e:ui` for the Playwright UI. Optional env vars: `E2E_BASE_URL` (default `http://localhost:5173`), `E2E_API_HEALTH` (default `http://localhost:4000/api/cbt/v1/health`).

On **GitHub Actions**:
- **`.github/workflows/ci.yml`** — TypeScript checks plus **`npm run qa:api`** against a temporary backend (no browser).
- **`.github/workflows/e2e.yml`** — Full Playwright run (study + JAMB mock); on failure uploads the HTML report.

## 5) Production build (single Node process)

From repo root after `npm install` in `backend/`, `frontend/`, and root:

```bash
npm run build
```

Set in `backend/.env` (or the environment):

- `FRONTEND_DIST=../frontend/dist` if you start from `backend/` with the default layout, **or** an absolute path to the Vite output folder.
- `JWT_SECRET` — strong random string (required outside local dev).
- `APP_BASE_URL` — public URL users open (used in email links).

Then from `backend/`:

```bash
npm start
```

Open `http://localhost:4000` (or your `PORT`): the API stays under `/api/cbt/v1/*` and the React app is served for all other routes.

### Docker

```bash
docker build -t sabischolar-cbt .
docker run --rm -p 4000:4000 -e JWT_SECRET=your_long_random_secret_at_least_32_chars -e TRUST_PROXY=1 sabischolar-cbt
```

Mount a volume on `/app/data` if you want the SQLite file to persist. Set `SMTP_*` / `MAIL_FROM` at run time if you use email.

The image sets `NODE_ENV=production`, so the process **refuses to start** unless `JWT_SECRET` is at least **32 characters** and not a dev placeholder (`dev_secret_only`, `change_me_in_production`).

### Public URL checklist (share with users)

1. **HTTPS** — Terminate TLS at your host (Render/Fly/Railway, load balancer, or Caddy/nginx) and point DNS at it.
2. **`JWT_SECRET`** — Long random string (32+ chars); required in production.
3. **`APP_BASE_URL`** — The exact public origin users open (used in verification and password-reset links), e.g. `https://cbt.example.com`.
4. **`FRONTEND_DIST`** — For the Docker image this is pre-set (`/app/static`). For a custom Node layout, set it to your Vite `dist` path (see §5 above).
5. **SQLite persistence** — Mount a volume on `/app/data` in Docker (or set `DB_PATH` to a persistent path on the host).
6. **`TRUST_PROXY=1`** — When the app sits behind a reverse proxy so client IP and rate limits use `X-Forwarded-For` correctly.
7. **`CORS_ALLOWED_ORIGINS`** — If the browser talks to a different API origin than the SPA, list allowed origins (comma-separated). Same-origin single-container deploys usually omit this.
8. **Email (optional)** — Set `SMTP_*` and `MAIL_FROM` so verification/reset flows send mail instead of returning dev tokens.

## Notes

- This v1 includes integration-ready API prefix: `/api/cbt/v1/`.
- `lesson_link` is included in the question model for future video linking.
- Google OAuth and Phone OTP are presented as "coming soon" placeholders in UI.
- **Email:** set `SMTP_HOST` and `MAIL_FROM` in `backend/.env` (see `.env.example`) to send verification and password-reset messages. If SMTP is not configured, the API returns dev tokens for those flows (see `QA_CHECKLIST.md`).
