import { Router } from "express";
import { mountAdminQuestions } from "./routes/adminQuestions";
import { mountCatalog } from "./routes/catalog";
import { mountHealthAuth } from "./routes/healthAuth";
import { mountLeaderboardDashboard } from "./routes/leaderboardDashboard";
import { mountSessions } from "./routes/sessions";

const router = Router();

mountHealthAuth(router);
mountCatalog(router);
mountSessions(router);
mountLeaderboardDashboard(router);
mountAdminQuestions(router);

export default router;
