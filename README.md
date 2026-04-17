# SabiScholar CBT (Standalone v1)

Standalone CBT platform for JAMB, WAEC, and NECO built with:
- Backend: Node.js + Express + TypeScript
- Frontend: React + Vite + TypeScript
- Database: SQLite

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

1. Open frontend.
2. Go to **Auth** and click **Register Demo User**.
3. Go to **Dashboard** and click **Start JAMB Mock Exam**.
4. Go to **Exam** and click **Submit Session**.
5. Go to **Leaderboard** to view weekly ranking.
6. Use backend admin endpoint to add/edit questions.

## Notes

- This v1 includes integration-ready API prefix: `/api/cbt/v1/`.
- `lesson_link` is included in the question model for future video linking.
- Google OAuth and Phone OTP are presented as "coming soon" placeholders in UI.
