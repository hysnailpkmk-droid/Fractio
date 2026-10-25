// FRACTIO teacher dashboard
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let D = { students: [], progress: {}, quizLatest: {}, quizAll: [], reflections: [], responses: [], byId: {} };

function showLoginMsg(t) { const m = $("#loginMsg"); m.textContent = t; m.className = "msg err"; }
const fmtDate = s => s ? new Date(s).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "";

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $("#tEmail").value.trim(), password: $("#tPass").value });
  if (error) return showLoginMsg("Wrong email or password.");
  await enter(await getSessionUser());
});
$("#logout").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });
$("#refresh").addEventListener("click", () => load());
$("#exportXlsx").addEventListener("click", exportExcel);
$("#search").addEventListener("input", renderProgress);

$$(".tab").forEach(t => t.addEventListener("click", () => {
  $$(".tab").forEach(x => x.classList.toggle("active", x === t));
  ["overview", "quiz", "refl"].forEach(n => $("#tab-" + n).classList.toggle("hidden", n !== t.dataset.tab));
}));

async function enter(user) {
  if (!user) return;
  let profile;
  try { profile = await getProfile(user.id); } catch (e) { return showLoginMsg("Could not load your account."); }
  if (profile.role !== "teacher") {
    await sb.auth.signOut();
    return showLoginMsg("This account does not have teacher access.");
  }
  $("#whoami").textContent = profile.full_name;
  $("#userbox").classList.remove("hidden");
  $("#loginView").classList.add("hidden");
  $("#dashView").classList.remove("hidden");
  await load();
}

async function load() {
  try {
    const [profiles, progress, quiz, refl, resp] = await Promise.all([
      fetchAll("profiles", "created_at"), fetchAll("progress", "user_id"),
      fetchAll("quiz_results"), fetchAll("reflections"), fetchAll("responses")
    ]);
    D.students = profiles.filter(p => p.role === "student").sort((a, b) => a.full_name.localeCompare(b.full_name));
    D.byId = Object.fromEntries(profiles.map(p => [p.id, p]));
    D.progress = Object.fromEntries(progress.map(p => [p.user_id, p]));
    D.quizAll = quiz;
    D.quizLatest = {};
    quiz.forEach(q => { if (!D.quizLatest[q.user_id] || q.created_at > D.quizLatest[q.user_id].created_at) D.quizLatest[q.user_id] = q; });
    D.reflections = refl.sort((a, b) => b.created_at.localeCompare(a.created_at));
    D.responses = resp;
  } catch (err) {
    console.error(err);
    alert("Could not load data: " + err.message);
    return;
  }
  renderStats(); renderProgress(); renderQuiz(); renderReflections();
}

const stepsDone = p => p ? [p.learning, p.laboratory, p.challenge, p.quiz_score !== null && p.quiz_score !== undefined].filter(Boolean).length : 0;
const isActive = s => stepsDone(D.progress[s.id]) > 0 || (D.progress[s.id] && D.progress[s.id].challenge_points > 0);

function renderStats() {
  const n = D.students.length;
  const active = D.students.filter(isActive).length;
  const scores = D.students.map(s => D.quizLatest[s.id]).filter(Boolean).map(q => q.score);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "–";
  const completion = n ? Math.round(D.students.reduce((a, s) => a + stepsDone(D.progress[s.id]), 0) / (n * 4) * 100) : 0;
  $("#stats").innerHTML = `
    <div class="stat"><b>${n}</b><span>Registered students</span></div>
    <div class="stat"><b>${active}</b><span>Active students</span></div>
    <div class="stat"><b>${avg}</b><span>Average quiz score</span></div>
    <div class="stat"><b>${completion}%</b><span>Average learning progress</span></div>
    <div class="stat"><b>${D.reflections.length}</b><span>Reflections submitted</span></div>`;
}

const mark = v => v ? '<span class="yes">✓</span>' : '<span class="no">–</span>';

function renderProgress() {
  const q = $("#search").value.trim().toLowerCase();
  const rows = D.students.filter(s => !q || s.full_name.toLowerCase().includes(q) || (s.class_name || "").toLowerCase().includes(q));
  $("#progressBody").innerHTML = rows.length ? rows.map(s => {
    const p = D.progress[s.id] || {}, done = stepsDone(p), pct = done * 25;
    const quiz = p.quiz_score !== null && p.quiz_score !== undefined ? `<b>${p.quiz_score}</b>` : '<span class="no">–</span>';
    return `<tr><td>${esc(s.full_name)}</td><td>${esc(s.class_name)}</td>
      <td class="c">${mark(p.learning)}</td><td class="c">${mark(p.laboratory)}</td><td class="c">${mark(p.challenge)}</td><td class="c">${quiz}</td>
      <td><span class="minibar"><i style="width:${pct}%"></i></span>${pct}%</td></tr>`;
  }).join("") : `<tr><td colspan="7" class="muted">No students yet.</td></tr>`;
}

function renderQuiz() {
  const latest = Object.values(D.quizLatest);
  const stats = {};
  latest.forEach(r => (r.answers || []).forEach(a => {
    stats[a.n] = stats[a.n] || { q: a.q, ok: 0, total: 0 };
    stats[a.n].total++; if (a.correct) stats[a.n].ok++;
  }));
  const keys = Object.keys(stats).sort((a, b) => a - b);
  $("#qStats").innerHTML = keys.length ? keys.map(k => {
    const s = stats[k], pct = Math.round(s.ok / s.total * 100);
    return `<div class="qstat"><b>Q${k}</b><div><div style="font-size:.9rem">${esc(s.q)}</div><span class="minibar" style="width:100%"><i style="width:${pct}%"></i></span></div><b>${pct}%</b></div>`;
  }).join("") : '<p class="muted">No quiz results yet.</p>';
  const rows = D.students.filter(s => D.quizLatest[s.id]);
  $("#quizBody").innerHTML = rows.length ? rows.map(s => {
    const r = D.quizLatest[s.id];
    return `<tr><td>${esc(s.full_name)}</td><td>${esc(s.class_name)}</td><td class="c"><b>${r.score}</b></td><td class="c">${r.correct_count}/${r.total}</td><td>${fmtDate(r.created_at)}</td></tr>`;
  }).join("") : `<tr><td colspan="5" class="muted">No quiz results yet.</td></tr>`;
}

function renderReflections() {
  $("#reflList").innerHTML = D.reflections.length ? D.reflections.map(r => {
    const s = D.byId[r.user_id] || {};
    return `<div class="card refl"><h3>${esc(s.full_name || "Unknown")} <span class="muted" style="font-weight:400;font-size:.9rem">${esc(s.class_name)} · ${fmtDate(r.created_at)}</span></h3>
      <p><b>New thing learned:</b> ${esc(r.new_learning)}</p>
      <p><b>Most helpful activity:</b> ${esc(r.most_helpful)}</p>
      <p style="margin:0"><b>Still difficult:</b> ${esc(r.still_difficult)}</p></div>`;
  }).join("") : '<p class="muted">No reflections yet.</p>';
}

function sheet(rows, widths) {
  const ws = XLSX.utils.json_to_sheet(rows);
  if (rows.length) ws["!cols"] = Object.keys(rows[0]).map((k, i) => ({ wch: widths ? widths[i] : Math.max(12, Math.min(40, k.length + 4)) }));
  return ws;
}

function exportExcel() {
  const wb = XLSX.utils.book_new();
  const scores = D.students.map(s => D.quizLatest[s.id]).filter(Boolean).map(q => q.score);

  XLSX.utils.book_append_sheet(wb, sheet([
    { Metric: "Registered students", Value: D.students.length },
    { Metric: "Active students", Value: D.students.filter(isActive).length },
    { Metric: "Average quiz score", Value: scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "" },
    { Metric: "Reflections submitted", Value: D.reflections.length },
    { Metric: "Exported on", Value: new Date().toLocaleString("en-GB") }
  ], [26, 24]), "Summary");

  XLSX.utils.book_append_sheet(wb, sheet(D.students.map(s => {
    const p = D.progress[s.id] || {};
    return {
      "Student Name": s.full_name, Username: s.username, Class: s.class_name || "",
      Learning: p.learning ? "✓" : "-", Laboratory: p.laboratory ? "✓" : "-", Challenge: p.challenge ? "✓" : "-",
      "Challenge Points": p.challenge_points || 0, "Quiz Score": p.quiz_score ?? "-",
      "Progress (%)": stepsDone(p) * 25, "Last Updated": p.updated_at ? fmtDate(p.updated_at) : ""
    };
  })), "Student Progress");

  XLSX.utils.book_append_sheet(wb, sheet(D.students.filter(s => D.quizLatest[s.id]).map(s => {
    const r = D.quizLatest[s.id];
    const row = { "Student Name": s.full_name, Class: s.class_name || "", Score: r.score, Correct: `${r.correct_count}/${r.total}`, Date: fmtDate(r.created_at) };
    (r.answers || []).forEach(a => { row["Q" + a.n] = a.correct ? "✓" : "✗"; });
    return row;
  })), "Quiz Results");

  XLSX.utils.book_append_sheet(wb, sheet(D.reflections.map(r => {
    const s = D.byId[r.user_id] || {};
    return { "Student Name": s.full_name || "", Class: s.class_name || "", "New Thing Learned": r.new_learning, "Most Helpful Activity": r.most_helpful, "Still Difficult": r.still_difficult, Date: fmtDate(r.created_at) };
  }), [22, 10, 40, 40, 40, 20]), "Reflections");

  XLSX.utils.book_append_sheet(wb, sheet(D.responses.map(r => {
    const s = D.byId[r.user_id] || {};
    return { "Student Name": s.full_name || "", Class: s.class_name || "", Section: r.section, Question: r.question_text, Answer: r.answer, Correct: r.is_correct ? "Yes" : "No", Time: fmtDate(r.created_at) };
  }), [22, 10, 22, 50, 24, 10, 20]), "All Answers");

  XLSX.writeFile(wb, "FRACTIO_Teacher_Report_" + new Date().toISOString().slice(0, 10) + ".xlsx");
}

(async () => {
  const user = await getSessionUser();
  if (user) await enter(user);
})();
