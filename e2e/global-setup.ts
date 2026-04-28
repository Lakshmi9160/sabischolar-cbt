import type { FullConfig } from "@playwright/test";

async function waitForOk(
  label: string,
  url: string,
  opts: { deadlineMs: number; okWhen: (res: Response, body: unknown) => boolean }
): Promise<void> {
  const deadline = Date.now() + opts.deadlineMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      if (opts.okWhen(res, body)) return;
      lastErr = `${label} ${res.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error(
    `[e2e global-setup] Timed out waiting for ${label} (${url}). Last: ${lastErr}. Start backend (port 4000) and frontend (port 5173), or set E2E_API_HEALTH / E2E_BASE_URL.`
  );
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const apiHealth = process.env.E2E_API_HEALTH || "http://localhost:4000/api/cbt/v1/health";
  const appBase = process.env.E2E_BASE_URL || "http://localhost:5173";

  await waitForOk("API", apiHealth, {
    deadlineMs: 90_000,
    okWhen: (res, body) =>
      res.ok &&
      typeof body === "object" &&
      body != null &&
      (body as { database?: string }).database === "connected"
  });

  await waitForOk("frontend", appBase, {
    deadlineMs: 60_000,
    okWhen: (res) => res.ok
  });
}
