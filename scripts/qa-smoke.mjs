/**
 * API smoke test for QA_CHECKLIST.md (run with backend on PORT default 4000).
 * Usage: node scripts/qa-smoke.mjs
 *
 * Optional admin CRUD (G3): set QA_ADMIN_EMAIL and QA_ADMIN_PASSWORD for an existing admin user.
 */
const base = process.env.QA_API_BASE || "http://localhost:4000/api/cbt/v1";

async function j(url, init = {}) {
  const res = await fetch(url, init);
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { res, data };
}

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

async function submitSession(baseUrl, authHeaders, sessionId, label) {
  const { res, data } = await j(`${baseUrl}/sessions/${sessionId}/submit`, {
    method: "POST",
    headers: authHeaders
  });
  if (!res.ok) fail(`${label} submit ${res.status} ${JSON.stringify(data)}`);
  if (typeof data.percentage !== "number") fail(`${label} submit missing percentage`);
  return data;
}

/** Decode JWT payload (middle segment) without verifying signature — smoke-only. */
function jwtPayloadUnverified(token) {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("bad jwt");
  const part = parts[1];
  const pad = (4 - (part.length % 4)) % 4;
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

async function main() {
  const { res: hRes, data: h } = await j(`${base}/health`);
  if (!hRes.ok) fail(`health ${hRes.status}`);
  if (h.status !== "ok") fail("health body");
  if (h.database !== "connected") fail(`health database expected connected got ${h.database}`);

  const email = `qa_${Date.now()}@example.com`;
  const { res: regRes, data: reg } = await j(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "qaPass123!",
      fullName: "QA Smoke User",
      targetExam: "JAMB",
      targetExamYear: 2026,
      selectedSubjects: ["ENG", "MTH", "PHY", "BIO"]
    })
  });
  if (!regRes.ok) fail(`register ${regRes.status} ${JSON.stringify(reg)}`);
  const token = reg.token;
  if (!token) fail("no token");

  const { res: logRes, data: logd } = await j(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "qaPass123!" })
  });
  if (!logRes.ok) fail(`login ${logRes.status}`);
  if (!logd.token) fail("login no token");

  const auth = { Authorization: `Bearer ${logd.token}`, "Content-Type": "application/json" };

  const { res: meRes, data: me } = await j(`${base}/auth/me`, { headers: auth });
  if (!meRes.ok) fail(`me ${meRes.status}`);
  if (me.email !== email.toLowerCase()) fail("me email");
  if (typeof me.id !== "number") fail("me.id missing");
  try {
    const pl = jwtPayloadUnverified(logd.token);
    if (String(pl.sub) !== String(me.id)) fail(`jwt sub expected ${me.id} got ${pl.sub}`);
    if (pl.userId !== me.id) fail(`jwt userId expected ${me.id} got ${pl.userId}`);
    if (String(pl.email || "").toLowerCase() !== email.toLowerCase()) fail("jwt email mismatch");
  } catch (e) {
    fail(`jwt payload: ${e?.message || e}`);
  }

  const { res: profRes, data: prof } = await j(`${base}/auth/profile`, { headers: auth });
  if (!profRes.ok) fail(`profile ${profRes.status}`);
  if (typeof prof.is_admin !== "number" && typeof prof.is_admin !== "boolean") fail("profile is_admin");

  const { res: patchProfRes, data: patchProf } = await j(`${base}/auth/profile`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ targetExam: "WAEC", targetExamYear: 2027 })
  });
  if (!patchProfRes.ok) fail(`profile patch ${patchProfRes.status} ${JSON.stringify(patchProf)}`);
  if (!patchProf.ok) fail("profile patch missing ok");

  const { res: profRes2, data: prof2 } = await j(`${base}/auth/profile`, { headers: auth });
  if (!profRes2.ok) fail(`profile after patch ${profRes2.status}`);
  if (String(prof2.target_exam || "").toUpperCase() !== "WAEC") {
    fail(`profile target_exam expected WAEC got ${prof2.target_exam}`);
  }
  if (Number(prof2.target_exam_year) !== 2027) {
    fail(`profile target_exam_year expected 2027 got ${prof2.target_exam_year}`);
  }

  const { res: qRes, data: qd } = await j(`${base}/questions?examType=JAMB&subjectCode=ENG&limit=3`, { headers: auth });
  if (!qRes.ok) fail(`questions ${qRes.status}`);
  if (!Array.isArray(qd.questions) || qd.questions.length < 1) fail("questions empty");

  const sampleYear = qd.questions[0].year;
  if (sampleYear != null && Number.isFinite(Number(sampleYear))) {
    const y = Number(sampleYear);
    const { res: qyRes, data: qyd } = await j(
      `${base}/questions?examType=JAMB&subjectCode=ENG&year=${y}&limit=8`,
      { headers: auth }
    );
    if (!qyRes.ok) fail(`questions year filter ${qyRes.status}`);
    for (const row of qyd.questions || []) {
      if (Number(row.year) !== y) fail(`questions year mismatch: expected ${y} got ${row.year}`);
    }
    const tid = qd.questions[0].topic_id;
    if (tid != null && Number.isFinite(Number(tid))) {
      const t = Number(tid);
      const { res: qtRes, data: qtd } = await j(
        `${base}/questions?examType=JAMB&subjectCode=ENG&topicId=${t}&year=${y}&limit=8`,
        { headers: auth }
      );
      if (!qtRes.ok) fail(`questions topic+year ${qtRes.status}`);
      if ((qtd.questions || []).length < 1) fail("questions topic+year returned empty");
      for (const row of qtd.questions || []) {
        if (Number(row.topic_id) !== t || Number(row.year) !== y) {
          fail(`questions topic+year row mismatch topic_id=${row.topic_id} year=${row.year}`);
        }
      }
    }
  }

  const { res: tRes, data: td } = await j(`${base}/topics?examType=JAMB&subjectCode=ENG`, { headers: auth });
  if (!tRes.ok) fail(`topics ${tRes.status}`);
  if (!Array.isArray(td.topics) || td.topics.length < 1) fail("topics empty");

  const { res: subjectsJRes, data: sj } = await j(`${base}/subjects?examType=JAMB`, { headers: auth });
  if (!subjectsJRes.ok) fail(`subjects ${subjectsJRes.status}`);
  if (!Array.isArray(sj.subjects) || sj.subjects.length !== 4) {
    fail(`subjects JAMB expected 4 rows got ${(sj.subjects || []).length}`);
  }
  const jambCodes = (sj.subjects || [])
    .map((s) => String(s.subject_code || "").toUpperCase())
    .sort()
    .join(",");
  if (jambCodes !== "BIO,ENG,MTH,PHY") fail(`subjects JAMB codes expected BIO,ENG,MTH,PHY got ${jambCodes}`);

  const { res: subjectsWRes, data: sw } = await j(`${base}/subjects?examType=WAEC`, { headers: auth });
  if (!subjectsWRes.ok) fail(`subjects WAEC ${subjectsWRes.status}`);
  if (!Array.isArray(sw.subjects) || sw.subjects.length !== 3) fail("subjects WAEC expected 3 rows");

  const { res: mRes, data: mock } = await j(`${base}/sessions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      examType: "JAMB",
      mode: "mock",
      subjectCodes: ["ENG", "MTH", "PHY", "BIO"],
      explanationMode: "deferred",
      lightTimerEnabled: false
    })
  });
  if (!mRes.ok) fail(`mock session ${mRes.status} ${JSON.stringify(mock)}`);
  if (mock.questionCount !== 100) fail(`mock expected 100 questions got ${mock.questionCount}`);
  const mockId = mock.sessionId;

  const { res: patchRes, data: patch } = await j(`${base}/sessions/${mockId}/progress`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({
      currentQuestionIndex: 2,
      remainingSeconds: 7000,
      flaggedQuestionIds: [1]
    })
  });
  if (!patchRes.ok) fail(`progress ${patchRes.status}`);
  if (patch.autoSubmitted) fail("progress should not auto-submit with remainingSeconds>0");

  const { res: subRes, data: sub } = await j(`${base}/sessions/${mockId}/submit`, {
    method: "POST",
    headers: auth
  });
  if (!subRes.ok) fail(`submit first mock ${subRes.status}`);
  if (typeof sub.percentage !== "number") fail("submit no percentage");

  const { res: waecEngTopRes, data: waecEngTop } = await j(`${base}/topics?examType=WAEC&subjectCode=ENG`, {
    headers: auth
  });
  if (!waecEngTopRes.ok) fail(`WAEC ENG topics ${waecEngTopRes.status}`);
  if (!Array.isArray(waecEngTop.topics) || waecEngTop.topics.length < 1) fail("WAEC ENG topics empty (seed ENG for WAEC)");

  const { res: waecMockRes, data: waecMock } = await j(`${base}/sessions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      examType: "WAEC",
      mode: "mock",
      subjectCodes: ["ENG"],
      explanationMode: "deferred",
      lightTimerEnabled: false
    })
  });
  if (!waecMockRes.ok) fail(`WAEC mock ENG ${waecMockRes.status} ${JSON.stringify(waecMock)}`);
  const waecQ = Number(waecMock.questionCount);
  if (!Number.isFinite(waecQ) || waecQ < 20) {
    fail(`WAEC ENG mock expected ≥20 questions (seed minimum), got ${waecMock.questionCount}`);
  }
  await submitSession(base, auth, waecMock.sessionId, "WAEC ENG mock");

  const { res: necoEngTopRes, data: necoEngTop } = await j(`${base}/topics?examType=NECO&subjectCode=ENG`, {
    headers: auth
  });
  if (!necoEngTopRes.ok) fail(`NECO ENG topics ${necoEngTopRes.status}`);
  if (!Array.isArray(necoEngTop.topics) || necoEngTop.topics.length < 1) fail("NECO ENG topics empty (seed ENG for NECO)");

  const { res: necoMockRes, data: necoMock } = await j(`${base}/sessions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      examType: "NECO",
      mode: "mock",
      subjectCodes: ["ENG"],
      explanationMode: "deferred",
      lightTimerEnabled: false
    })
  });
  if (!necoMockRes.ok) fail(`NECO mock ENG ${necoMockRes.status} ${JSON.stringify(necoMock)}`);
  const necoQ = Number(necoMock.questionCount);
  if (!Number.isFinite(necoQ) || necoQ < 20) {
    fail(`NECO ENG mock expected ≥20 questions (seed minimum), got ${necoMock.questionCount}`);
  }
  await submitSession(base, auth, necoMock.sessionId, "NECO ENG mock");

  const { res: stRes, data: study } = await j(`${base}/sessions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      examType: "WAEC",
      mode: "study",
      subjectCodes: ["BIO"],
      questionIds: [],
      explanationMode: "instant",
      lightTimerEnabled: false
    })
  });
  if (!stRes.ok) fail(`study ${stRes.status}`);
  if (study.durationSeconds !== 0 && study.durationSeconds != null)
    /* eslint-disable-next-line no-empty */ void 0;
  const studyId = study.sessionId;

  const { res: p0Res, data: p0 } = await j(`${base}/sessions/${studyId}/progress`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({
      currentQuestionIndex: 1,
      remainingSeconds: 0,
      flaggedQuestionIds: []
    })
  });
  if (!p0Res.ok) fail(`study progress ${p0Res.status}`);
  if (p0.autoSubmitted) fail("study progress with 0 remaining must not auto-submit");

  const topicId = td.topics[0].id;
  const { res: drRes, data: drill } = await j(`${base}/sessions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      examType: "JAMB",
      mode: "drill",
      subjectCodes: ["ENG"],
      topicIds: [topicId],
      questionCount: 10,
      explanationMode: "deferred",
      lightTimerEnabled: false
    })
  });
  if (!drRes.ok) fail(`drill ${drRes.status} ${JSON.stringify(drill)}`);
  const drillId = drill.sessionId;

  const { res: activeAfterDrillRes, data: activeAfterDrill } = await j(`${base}/sessions/active`, { headers: auth });
  if (!activeAfterDrillRes.ok) fail(`active after drill ${activeAfterDrillRes.status}`);
  if (!activeAfterDrill.session || Number(activeAfterDrill.session.id) !== Number(drillId)) {
    fail("active after drill should return current drill session");
  }
  if (activeAfterDrill.session.explanationMode !== "deferred") {
    fail(`drill explanationMode expected deferred got ${activeAfterDrill.session.explanationMode}`);
  }
  if (Boolean(activeAfterDrill.session.lightTimerEnabled)) {
    fail("drill lightTimerEnabled expected false");
  }

  const { res: dqRes, data: dqd } = await j(`${base}/sessions/${drillId}/questions`, { headers: auth });
  if (!dqRes.ok) fail(`drill questions ${dqRes.status}`);
  const dq0 = dqd.questions?.[0];
  if (dq0?.id) {
    const { res: ansRes, data: ansData } = await j(`${base}/sessions/${drillId}/answers`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ questionId: dq0.id, selectedOption: "A", timeSpentSeconds: 5 })
    });
    if (!ansRes.ok) fail(`answer ${ansRes.status}`);
    if (typeof ansData.isCorrect !== "boolean") fail("answer isCorrect missing");
    if (!ansData.correctOption || !ansData.explanation) fail("answer explanation payload missing");
  }

  const { res: m2Res, data: mock2 } = await j(`${base}/sessions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      examType: "JAMB",
      mode: "mock",
      subjectCodes: ["ENG", "MTH", "PHY", "BIO"],
      explanationMode: "deferred",
      lightTimerEnabled: false
    })
  });
  if (!m2Res.ok) fail(`second mock ${m2Res.status}`);
  const { res: autoRes, data: auto } = await j(`${base}/sessions/${mock2.sessionId}/progress`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({
      currentQuestionIndex: 0,
      remainingSeconds: 0,
      flaggedQuestionIds: []
    })
  });
  if (!autoRes.ok) fail(`timed autosubmit progress ${autoRes.status}`);
  if (!auto.autoSubmitted || !auto.result) fail("timed mock should auto-submit when remainingSeconds<=0");

  const { res: rRes, data: rdata } = await j(`${base}/sessions/${mockId}/result`, { headers: auth });
  if (!rRes.ok) fail(`result ${rRes.status}`);
  if (!Array.isArray(rdata.topicBreakdown)) fail("result topicBreakdown");

  const { res: dRes, data: dash } = await j(`${base}/dashboard`, { headers: auth });
  if (!dRes.ok) fail(`dashboard ${dRes.status}`);
  if (!dash.recentSessions) fail("dashboard recentSessions");
  if (!Array.isArray(dash.weakTopics)) fail("dashboard weakTopics");
  if (!dash.predictedMockPercentByExam || typeof dash.predictedMockPercentByExam !== "object") {
    fail("dashboard predictedMockPercentByExam missing");
  }
  const pm = dash.predictedMockPercentByExam;
  for (const k of ["JAMB", "WAEC", "NECO"]) {
    if (!(k in pm)) fail(`dashboard predictedMockPercentByExam missing key ${k}`);
    const v = pm[k];
    if (typeof v !== "number") fail(`dashboard predictedMockPercentByExam.${k} expected number got ${v}`);
  }
  const weakScope = String(dash?.profile?.targetExam || "").trim().toUpperCase();
  for (const w of dash.weakTopics) {
    if (typeof w.total !== "number" || typeof w.correct !== "number") fail("weakTopics row");
    if (!("topic_name" in w)) fail("weakTopics missing topic_name");
    const et = w.exam_type != null ? String(w.exam_type).trim().toUpperCase() : "";
    if (et !== "" && weakScope && et !== weakScope) {
      fail(`weakTopics should match targetExam ${weakScope} sessions only; got exam_type ${w.exam_type}`);
    }
  }

  const { res: lbRes, data: lb } = await j(`${base}/leaderboard/weekly?examType=JAMB`, { headers: auth });
  if (!lbRes.ok) fail(`leaderboard ${lbRes.status}`);
  if (!Array.isArray(lb.top20)) fail("leaderboard top20");
  if (!lb.me) fail("leaderboard JAMB: expected me after submitted JAMB mocks");
  if (Number(lb.me.session_count) < 1) fail("leaderboard JAMB me.session_count");

  for (const ex of ["WAEC", "NECO"]) {
    const { res: lbExRes, data: lbEx } = await j(`${base}/leaderboard/weekly?examType=${ex}`, { headers: auth });
    if (!lbExRes.ok) fail(`leaderboard ${ex} ${lbExRes.status}`);
    if (!Array.isArray(lbEx.top20)) fail(`leaderboard top20 ${ex}`);
    if (!lbEx.me) fail(`leaderboard ${ex}: expected me after submitted ${ex} mock`);
    if (Number(lbEx.me.session_count) < 1) fail(`leaderboard ${ex} me.session_count`);
  }

  const { res: lbBadRes, data: lbBad } = await j(`${base}/leaderboard/weekly?examType=NOT_A_REAL_EXAM`, {
    headers: auth
  });
  if (!lbBadRes.ok) fail(`leaderboard invalid examType ${lbBadRes.status}`);
  if (!Array.isArray(lbBad.top20)) fail("leaderboard invalid top20");

  const { res: actRes, data: act } = await j(`${base}/sessions/active`, { headers: auth });
  if (!actRes.ok) fail(`active ${actRes.status}`);

  const { res: ad403 } = await j(`${base}/admin/questions?limit=1&offset=0`, { headers: auth });
  if (ad403.status !== 403) fail(`non-admin admin/questions expected 403 got ${ad403.status}`);

  const { res: verRes, data: ver } = await j(`${base}/auth/request-verification`, {
    method: "POST",
    headers: auth
  });
  if (!verRes.ok) fail(`request-verification ${verRes.status}`);
  if (!ver.token && ver.sent !== true) {
    fail("request-verification: expected dev token or sent:true (configure SMTP?)");
  }

  const resetEmail = { email };
  const { res: prRes, data: pr } = await j(`${base}/auth/request-password-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(resetEmail)
  });
  if (!prRes.ok) fail(`password-reset-request ${prRes.status}`);
  if (!pr.token && pr.sent !== true) {
    fail("password-reset-request: expected dev token or sent:true (configure SMTP?)");
  }

  const adminEmail = process.env.QA_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.QA_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const { res: alRes, data: ald } = await j(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword })
    });
    if (!alRes.ok) fail(`admin login ${alRes.status} ${JSON.stringify(ald)}`);
    if (!ald.token) fail("admin login missing token");
    const adminAuth = { Authorization: `Bearer ${ald.token}`, "Content-Type": "application/json" };

    const { res: aqRes, data: aqd } = await j(`${base}/admin/questions?limit=1&offset=0`, { headers: adminAuth });
    if (!aqRes.ok) fail(`admin GET questions ${aqRes.status}`);
    const row = (aqd.questions || [])[0];
    if (!row?.id) fail("admin list has no rows — need at least one question in DB");

    const { res: afRes, data: afd } = await j(
      `${base}/admin/questions?examType=JAMB&subjectCode=ENG&limit=15&offset=0`,
      { headers: adminAuth }
    );
    if (!afRes.ok) fail(`admin GET filtered ${afRes.status}`);
    const filtered = afd.questions || [];
    if (filtered.length === 0) fail("admin JAMB+ENG filter returned no rows");
    for (const q of filtered) {
      if (q.exam_type !== "JAMB" || q.subject_code !== "ENG") {
        fail(`admin filter mismatch: expected JAMB/ENG got ${q.exam_type}/${q.subject_code}`);
      }
    }

    const { res: tpRes, data: tpd } = await j(`${base}/topics?examType=JAMB&subjectCode=ENG`, { headers: adminAuth });
    if (!tpRes.ok) fail(`topics for admin filter ${tpRes.status}`);
    const firstTopic = (tpd.topics || [])[0];
    if (firstTopic?.id != null) {
      const { res: atRes, data: atd } = await j(
        `${base}/admin/questions?examType=JAMB&subjectCode=ENG&topicId=${firstTopic.id}&limit=20&offset=0`,
        { headers: adminAuth }
      );
      if (!atRes.ok) fail(`admin GET topic filter ${atRes.status}`);
      for (const q of atd.questions || []) {
        if (q.topic_id !== firstTopic.id) {
          fail(`admin topicId filter: expected topic_id ${firstTopic.id} got ${q.topic_id}`);
        }
      }
    }

    const { res: puRes, data: pud } = await j(`${base}/admin/questions/${row.id}`, {
      method: "PUT",
      headers: adminAuth,
      body: JSON.stringify(row)
    });
    if (!puRes.ok) fail(`admin PUT question ${puRes.status}`);
    if (!pud.ok) fail("admin PUT expected { ok: true }");

    const createPayload = {
      exam_type: "JAMB",
      subject_code: "ENG",
      topic_id: row.topic_id ?? null,
      year: row.year ?? 2024,
      question_body: `QA create question ${Date.now()}?`,
      option_a: "Option A",
      option_b: "Option B",
      option_c: "Option C",
      option_d: "Option D",
      correct_option: "A",
      explanation: "Because this is a smoke-test seeded admin question.",
      lesson_link: null,
      difficulty: "medium",
      source: "ai_generated",
      image_url: null
    };
    const { res: cpRes, data: cpd } = await j(`${base}/admin/questions`, {
      method: "POST",
      headers: adminAuth,
      body: JSON.stringify(createPayload)
    });
    if (!cpRes.ok) fail(`admin POST question ${cpRes.status} ${JSON.stringify(cpd)}`);
    if (typeof cpd.id !== "number") fail("admin POST expected numeric id");

    const { res: paRes, data: pad } = await j(`${base}/admin/questions/${cpd.id}`, {
      method: "PATCH",
      headers: adminAuth,
      body: JSON.stringify({ explanation: "Patched explanation from smoke test." })
    });
    if (!paRes.ok) fail(`admin PATCH question ${paRes.status}`);
    if (!pad.ok) fail("admin PATCH expected { ok: true }");
    console.log("OK: admin list + idempotent PUT (QA_ADMIN_EMAIL/PASSWORD)");
  } else {
    console.log("(Optional) Set QA_ADMIN_EMAIL + QA_ADMIN_PASSWORD to verify admin question PUT.");
  }

  console.log("OK: qa-smoke passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
