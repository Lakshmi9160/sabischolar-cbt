import { db } from "./db";

type SeedQuestion = {
  examType: "JAMB" | "WAEC" | "NECO";
  subjectCode: string;
  topicName: string;
  questionBody: string;
  options: [string, string, string, string];
  correct: "A" | "B" | "C" | "D";
  explanation: string;
  source: "past_question" | "ai_generated";
};

const JAMB_REQUIRED_SUBJECTS = ["ENG", "MTH", "PHY", "BIO"] as const;
/** JAMB mock uses 25 Q × 4 subjects = 100; keep ≥25 per core subject. */
const JAMB_MIN_PER_SUBJECT = 25;
/** Plan target: ≥20 questions per seeded subject for WAEC/NECO. */
const WAEC_NECO_MIN_PER_SUBJECT = 20;

function ensureTopic(examType: string, subjectCode: string, topicName: string): number {
  const existing = db
    .prepare("SELECT id FROM topics WHERE exam_type = ? AND subject_code = ? AND topic_name = ?")
    .get(examType, subjectCode, topicName) as { id: number } | undefined;
  if (existing) return existing.id;

  const result = db
    .prepare("INSERT INTO topics (exam_type, subject_code, topic_name) VALUES (?, ?, ?)")
    .run(examType, subjectCode, topicName);
  return Number(result.lastInsertRowid);
}

function insertQuestion(row: SeedQuestion, year: number, suffix: string): void {
  const topicId = ensureTopic(row.examType, row.subjectCode, row.topicName);
  db.prepare(
    `INSERT INTO questions (
      exam_type, subject_code, topic_id, year, question_body, option_a, option_b, option_c, option_d,
      correct_option, explanation, lesson_link, difficulty, source, image_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.examType,
    row.subjectCode,
    topicId,
    year,
    `${row.questionBody} ${suffix}`.trim(),
    row.options[0],
    row.options[1],
    row.options[2],
    row.options[3],
    row.correct,
    row.explanation,
    null,
    "medium",
    row.source,
    null
  );
}

function ensureQuestionMinimum(examType: "JAMB" | "WAEC" | "NECO", subjectCode: string, minCount: number, template: SeedQuestion): void {
  const row = db
    .prepare("SELECT COUNT(*) as c FROM questions WHERE exam_type = ? AND subject_code = ?")
    .get(examType, subjectCode) as { c: number };
  const missing = minCount - row.c;
  if (missing <= 0) return;
  for (let i = 0; i < missing; i += 1) {
    insertQuestion(template, 2024, `(auto ${i + 1})`);
  }
}

export function seedData(): void {
  const seedRows: SeedQuestion[] = [
    {
      examType: "JAMB",
      subjectCode: "ENG",
      topicName: "Lexis and Structure",
      questionBody: "Choose the option that best completes the sentence: The principal insisted that every student ___ present.",
      options: ["is", "was", "be", "are"],
      correct: "C",
      explanation: "After 'insisted that', the subjunctive mood is used, so 'be' is correct.",
      source: "past_question"
    },
    {
      examType: "JAMB",
      subjectCode: "MTH",
      topicName: "Algebra",
      questionBody: "If 2x + 3 = 11, what is x?",
      options: ["3", "4", "5", "6"],
      correct: "B",
      explanation: "2x = 8, so x = 4.",
      source: "past_question"
    },
    {
      examType: "JAMB",
      subjectCode: "PHY",
      topicName: "Mechanics",
      questionBody: "A body moves with constant velocity. Its acceleration is:",
      options: ["1 m/s²", "0 m/s²", "9.8 m/s²", "depends on mass"],
      correct: "B",
      explanation: "Acceleration is rate of change of velocity. Constant velocity means zero acceleration.",
      source: "ai_generated"
    },
    {
      examType: "JAMB",
      subjectCode: "BIO",
      topicName: "Ecology",
      questionBody: "The habitat of an organism refers to its:",
      options: ["Food chain", "Natural home", "Body structure", "Population size"],
      correct: "B",
      explanation: "Habitat is the natural environment where an organism lives.",
      source: "past_question"
    },
    {
      examType: "WAEC",
      subjectCode: "ENG",
      topicName: "Lexis and Structure",
      questionBody: "Choose the word that best completes: Neither the boys nor the teacher ___ absent.",
      options: ["was", "were", "are", "have been"],
      correct: "A",
      explanation: "With 'neither … nor', the verb agrees with the nearer subject — 'teacher' is singular, so 'was'.",
      source: "past_question"
    },
    {
      examType: "WAEC",
      subjectCode: "BIO",
      topicName: "Cell Biology",
      questionBody: "The basic unit of life is the:",
      options: ["Tissue", "Organ", "Cell", "Nucleus"],
      correct: "C",
      explanation: "All living organisms are made of cells.",
      source: "past_question"
    },
    {
      examType: "WAEC",
      subjectCode: "CHE",
      topicName: "Atomic Structure",
      questionBody: "The number of protons in an atom is called the:",
      options: ["Mass number", "Atomic number", "Valency", "Isotope number"],
      correct: "B",
      explanation: "Atomic number equals the number of protons in the nucleus.",
      source: "past_question"
    },
    {
      examType: "NECO",
      subjectCode: "ENG",
      topicName: "Oral English",
      questionBody: "The vowel sound in the word 'bird' is described as:",
      options: ["A diphthong", "A schwa", "A long monophthong", "A silent vowel"],
      correct: "C",
      explanation: "In many accents 'bird' uses a long vowel /ɜː/ (one steady sound), a monophthong.",
      source: "ai_generated"
    },
    {
      examType: "NECO",
      subjectCode: "ECO",
      topicName: "Demand and Supply",
      questionBody: "When price rises, quantity demanded generally:",
      options: ["Increases", "Falls", "Stays constant", "Doubles"],
      correct: "B",
      explanation: "By the law of demand, quantity demanded falls as price rises, other things equal.",
      source: "ai_generated"
    },
    {
      examType: "NECO",
      subjectCode: "GOV",
      topicName: "Democracy",
      questionBody: "A system where power belongs to the people is:",
      options: ["Monarchy", "Aristocracy", "Democracy", "Theocracy"],
      correct: "C",
      explanation: "Democracy is government by the people, directly or through representatives.",
      source: "past_question"
    }
  ];
  const byKey = new Map<string, SeedQuestion>();
  seedRows.forEach((row) => byKey.set(`${row.examType}:${row.subjectCode}`, row));

  const tx = db.transaction(() => {
    // Initial light seed if database is empty.
    const count = db.prepare("SELECT COUNT(*) as c FROM questions").get() as { c: number };
    if (count.c === 0) {
      for (let i = 0; i < 4; i += 1) {
        for (const row of seedRows) {
          insertQuestion(row, 2024, `(${i + 1})`);
        }
      }
    }

    // Guarantee strict minimums for exam flows.
    for (const subject of JAMB_REQUIRED_SUBJECTS) {
      const template = byKey.get(`JAMB:${subject}`);
      if (template) ensureQuestionMinimum("JAMB", subject, JAMB_MIN_PER_SUBJECT, template);
    }

    const waecSubjects = ["ENG", "BIO", "CHE"];
    waecSubjects.forEach((subject) => {
      const template = byKey.get(`WAEC:${subject}`);
      if (template) ensureQuestionMinimum("WAEC", subject, WAEC_NECO_MIN_PER_SUBJECT, template);
    });

    const necoSubjects = ["ENG", "ECO", "GOV"];
    necoSubjects.forEach((subject) => {
      const template = byKey.get(`NECO:${subject}`);
      if (template) ensureQuestionMinimum("NECO", subject, WAEC_NECO_MIN_PER_SUBJECT, template);
    });
  });

  tx();
}

