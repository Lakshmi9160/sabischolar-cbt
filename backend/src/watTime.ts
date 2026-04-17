/** West Africa Time (WAT) — Africa/Lagos, UTC+1, no DST. */

const TZ = "Africa/Lagos";

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function getLagosYmd(d: Date): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
  const [y, m, day] = s.split("-").map(Number);
  return { y, m, d: day };
}

export function ymdKey(parts: { y: number; m: number; d: number }): string {
  return `${parts.y}-${pad2(parts.m)}-${pad2(parts.d)}`;
}

function getLagosWeekdaySun0(d: Date): number {
  const w = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[w] ?? 0;
}

function addCalendarDays(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Current leaderboard week: Sunday 00:00 WAT → Saturday 23:59:59.999 WAT. */
export function getWatWeekBounds(now: Date = new Date()) {
  const { y, m, d } = getLagosYmd(now);
  const dow = getLagosWeekdaySun0(now);
  const sun = addCalendarDays(y, m, d, -dow);
  const sat = addCalendarDays(sun.y, sun.m, sun.d, 6);
  const weekStart = new Date(`${sun.y}-${pad2(sun.m)}-${pad2(sun.d)}T00:00:00+01:00`);
  const weekEnd = new Date(`${sat.y}-${pad2(sat.m)}-${pad2(sat.d)}T23:59:59.999+01:00`);
  const nextWeekSun = addCalendarDays(sun.y, sun.m, sun.d, 7);
  const leaderboardResetsAt = new Date(`${nextWeekSun.y}-${pad2(nextWeekSun.m)}-${pad2(nextWeekSun.d)}T00:00:00+01:00`);
  return {
    weekStart,
    weekEnd,
    weekLabel: `${sun.y}-${pad2(sun.m)}-${pad2(sun.d)} → ${sat.y}-${pad2(sat.m)}-${pad2(sat.d)} (WAT)`,
    leaderboardResetsAt
  };
}

/** SQLite CURRENT_TIMESTAMP-style UTC string for comparisons. */
export function toSqliteUtc(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Streak: consecutive calendar days (WAT) with ≥1 submitted session,
 * counting backward from the most recent session day (breaks on gaps).
 */
export function computeStreakDays(submittedAtUtcStrings: string[]): number {
  const dates = new Set<string>();
  for (const raw of submittedAtUtcStrings) {
    const iso = raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    dates.add(ymdKey(getLagosYmd(d)));
  }
  if (dates.size === 0) return 0;

  const sorted = [...dates].sort().reverse();
  const [y0, m0, d0] = sorted[0].split("-").map(Number);
  let y = y0;
  let m = m0;
  let d = d0;
  let streak = 0;
  for (;;) {
    const k = ymdKey({ y, m, d });
    if (!dates.has(k)) break;
    streak += 1;
    const prev = addCalendarDays(y, m, d, -1);
    y = prev.y;
    m = prev.m;
    d = prev.d;
  }
  return streak;
}

/** Default nominal exam calendar day (month 1–12, day) per exam type. */
export function defaultExamMonthDay(targetExam: string | null): { month: number; day: number } {
  const e = (targetExam || "JAMB").toUpperCase();
  if (e === "WAEC") return { month: 5, day: 15 };
  if (e === "NECO") return { month: 6, day: 15 };
  return { month: 3, day: 15 };
}

export function examCountdown(
  targetExam: string | null,
  targetYear: number | null
): { examDateIso: string; daysRemaining: number; label: string } | null {
  if (!targetYear || targetYear < 2000 || targetYear > 2100) return null;
  const { month, day } = defaultExamMonthDay(targetExam);
  const exam = new Date(`${targetYear}-${pad2(month)}-${pad2(day)}T12:00:00+01:00`);
  const lagosToday = getLagosYmd(new Date());
  const t0 = Date.UTC(lagosToday.y, lagosToday.m - 1, lagosToday.d);
  const t1 = Date.UTC(targetYear, month - 1, day);
  const msPerDay = 86400000;
  const daysRemaining = Math.round((t1 - t0) / msPerDay);
  const label =
    daysRemaining > 0
      ? `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} until ${targetExam || "JAMB"} (${targetYear})`
      : daysRemaining === 0
        ? `Exam window (${targetExam || "JAMB"} ${targetYear})`
        : `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? "" : "s"} since nominal exam date (${targetExam || "JAMB"} ${targetYear})`;
  return { examDateIso: exam.toISOString(), daysRemaining, label };
}
