/** Exam + subject codes that match backend `seed.ts` minimums (enough questions for study/drill/mocks). */
export type CatalogExam = "JAMB" | "WAEC" | "NECO";

export const SUBJECTS_BY_EXAM: Record<CatalogExam, readonly string[]> = {
  JAMB: ["ENG", "MTH", "PHY", "BIO"],
  WAEC: ["ENG", "BIO", "CHE"],
  NECO: ["ENG", "ECO", "GOV"]
} as const;

export function subjectsForExam(exam: CatalogExam): readonly string[] {
  return SUBJECTS_BY_EXAM[exam];
}

export function defaultSubjectForExam(exam: CatalogExam): string {
  return SUBJECTS_BY_EXAM[exam][0] ?? "ENG";
}

/** If `subject` is not seeded for this exam, return the catalog default (first subject). */
export function normalizeCatalogSubject(exam: CatalogExam, subject: string): string {
  const u = subject.trim().toUpperCase();
  const list = SUBJECTS_BY_EXAM[exam] as readonly string[];
  return list.includes(u) ? u : defaultSubjectForExam(exam);
}

export function isCatalogSubject(exam: CatalogExam, subject: string): boolean {
  const u = subject.trim().toUpperCase();
  return (SUBJECTS_BY_EXAM[exam] as readonly string[]).includes(u);
}

export const JAMB_MOCK_SUBJECT_CODES: readonly string[] = SUBJECTS_BY_EXAM.JAMB;
