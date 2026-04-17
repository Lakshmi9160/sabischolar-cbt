/**
 * All browser calls use this path relative to the app origin.
 * Dev: Vite serves the app on port 5173 and proxies `/api` → `http://localhost:4000`.
 */
export const API_BASE = "/api/cbt/v1" as const;
