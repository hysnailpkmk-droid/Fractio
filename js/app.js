// FRACTIO student app
const state = {
  user: null, profile: null,
  progress: { learning: false, laboratory: false, challenge: false, challenge_points: 0, quiz_score: null },
  introDone: false, closingDone: false
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- helpers ---------- */
const fracHTML = (n, d) => `<span class="frac"><i>${n}</i><i>${d}</i></span>`;
const fmt = t => String(t).replace(/(\d+)\/(\d+)/g, (_, n, d) => fracHTML(n, d));
const LETTERS = ["A", "B", "C", "D", "E"];

function pizzaSVG(parts, selected = new Set()) {
  const toXY = deg => [100 + 90 * Math.cos(deg * Math.PI / 180), 100 + 90 * Math.sin(deg * Math.PI / 180)];
  let s = `<svg viewBox="0 0 200 200" role="img" aria-label="Pizza divided into ${parts} equal parts"><circle cx="100" cy="100" r="97" fill="#d97706"/>`;
  if (parts === 1) {
    s += `<circle class="slice" data-i="0" cx="100" cy="100" r="90" fill="${selected.has(0) ? "#ec4899" : "#fcd34d"}"/>`;
    s += `<circle cx="70" cy="75" r="8" fill="#b91c1c" pointer-events="none"/><circle cx="125" cy="120" r="8" fill="#b91c1c" pointer-events="none"/>`;
  } else {
    const step = 360 / parts;
    for (let i = 0; i < parts; i++) {
      const a0 = -90 + i * step, a1 = a0 + step;
      const [x0, y0] = toXY(a0), [x1, y1] = toXY(a1);
      const large = step > 180 ? 1 : 0;
      s += `<path class="slice" data-i="${i}" d="M100 100 L${x0.toFixed(2)} ${y0.toFixed(2)} A90 90 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${selected.has(i) ? "#ec4899" : "#fcd34d"}"/>`;
    }
    for (let i = 0; i < parts; i++) {
      const [x0, y0] = toXY(-90 + i * step);
      s += `<line x1="100" y1="100" x2="${x0.toFixed(2)}" y2="${y0.toFixed(2)}" stroke="#fff" stroke-width="3" pointer-events="none"/>`;
      const mid = (-90 + i * step + step / 2) * Math.PI / 180;
      const rr = parts === 2 ? 48 : 58;
      s += `<circle cx="${(100 + rr * Math.cos(mid)).toFixed(1)}" cy="${(100 + rr * Math.sin(mid)).toFixed(1)}" r="${parts >= 8 ? 5 : 8}" fill="#b91c1c" pointer-events="none"/>`;
    }
  }
  return s + "</svg>";
}

function barHTML(n, d) {
  let spans = "";
  for (let i = 0; i < d; i++) spans += `<span class="${i < n ? "on" : ""}"></span>`;
  return `<div class="barrow">${fracHTML(n, d)}<div class="bar">${spans}</div></div>`;
}

/* ---------- data logging ---------- */
function logResponse(section, key, text, answer, correct) {
  if (!state.user) return;
  sb.from("responses").insert({
    user_id: state.user.id, section, question_key: key,
    question_text: String(text).replace(/<[^>]+>/g, ""), answer: String(answer), is_correct: correct
  }).then(({ error }) => { if (error) console.warn("response not saved", error.message); });
}

async function saveProgress(patch) {
  Object.assign(state.progress, patch);
  updateChips();
  if (!state.user) return;
  const p = state.progress;
  const { error } = await sb.from("progress").upsert({
    user_id: state.user.id, learning: !!p.learning, laboratory: !!p.laboratory, challenge: !!p.challenge,
    challenge_points: p.challenge_points || 0, quiz_score: p.quiz_score ?? null, updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  if (error) console.warn("progress not saved", error.message);
}

/* ---------- multiple choice component ---------- */
function renderMCQ(el, q) {
  const letters = q.letters !== false;
  el.innerHTML = `<p class="q">${fmt(q.text)}</p>
    <div class="opts">${q.options.map((o, i) =>
      `<button type="button" class="opt" data-i="${i}">${letters ? `<span class="letter">${LETTERS[i]}</span>` : ""}<span>${fmt(o)}</span></button>`).join("")}</div>
    <div class="fb"></div>`;
  const btns = $$(".opt", el), fb = $(".fb", el);
  let finished = false;
  btns.forEach(b => b.addEventListener("click", () => {
    if (finished) return;
    const i = +b.dataset.i, correct = i === q.answer;
    logResponse(q.section, q.key, q.text, q.options[i], correct);
    if (q.neutral) {
      finished = true;
      btns.forEach(x => x.disabled = true);
      b.classList.add("picked");
      fb.className = "fb neutral"; fb.innerHTML = q.neutralMsg;
      q.onDone && q.onDone(correct, i);
      return;
    }
    if (correct) {
      finished = true;
      btns.forEach(x => x.disabled = true);
      b.classList.add("correct");
      fb.className = "fb ok"; fb.innerHTML = fmt(q.okMsg);
      q.onDone && q.onDone(true, i);
    } else if (q.retry === false) {
      finished = true;
      btns.forEach(x => x.disabled = true);
      b.classList.add("wrong");
      btns[q.answer].classList.add("correct");
      fb.className = "fb bad"; fb.innerHTML = fmt(q.badMsg);
      q.onDone && q.onDone(false, i);
    } else {
      b.classList.add("wrong"); b.disabled = true;
      fb.className = "fb bad"; fb.innerHTML = fmt(q.badMsg);
    }
  }));
}

/* ---------- navigation ---------- */
const PAGES = ["home", "intro", "learning", "lab", "challenge", "quiz", "closing"];
function go(page) {
  if (!state.user && page !== "home") page = "home";
  PAGES.forEach(p => $("#page-" + p).classList.toggle("active", p === page));
  $$(".chip").forEach(c => c.classList.toggle("active", c.dataset.go === page));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.addEventListener("click", e => {
  const t = e.target.closest("[data-go]");
  if (t) { e.preventDefault(); go(t.dataset.go); }
});

function updateChips() {
  const p = state.progress;
  const done = {
    intro: state.introDone || p.learning, learning: p.learning, laboratory: p.laboratory,
    challenge: p.challenge, quiz: p.quiz_score !== null && p.quiz_score !== undefined, closing: state.closingDone
  };
  $$(".chip").forEach(c => c.classList.toggle("done", !!done[c.dataset.step]));
}

/* ---------- authentication ---------- */
function showAuthMsg(text, kind = "err") {
  const m = $("#authMsg");
  m.textContent = text; m.className = "msg " + kind;
}
$$(".tab").forEach(t => t.addEventListener("click", () => {
  $$(".tab").forEach(x => x.classList.toggle("active", x === t));
  $("#loginForm").classList.toggle("hidden", t.dataset.auth !== "login");
  $("#registerForm").classList.toggle("hidden", t.dataset.auth !== "register");
  $("#authMsg").className = "msg hidden";
}));

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: toEmail($("#liUser").value), password: $("#liPass").value });
  if (error) return showAuthMsg("Wrong username or password.");
  await initUser(await getSessionUser());
});

$("#registerForm").addEventListener("submit", async e => {
  e.preventDefault();
  const username = $("#rgUser").value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,}$/.test(username)) return showAuthMsg("Username must be at least 3 characters: letters, numbers, dot, dash or underscore.");
  const { data, error } = await sb.auth.signUp({
    email: toEmail(username), password: $("#rgPass").value,
    options: { data: { username, full_name: $("#rgName").value.trim(), class_name: $("#rgClass").value.trim() } }
  });
  if (error) return showAuthMsg(/registered|exists/i.test(error.message) ? "That username is already taken." : error.message);
  if (!data.session) return showAuthMsg("Account created, but Supabase still requires email confirmation. Ask your teacher to turn it off (Authentication > Providers > Email).");
  await initUser(data.session.user);
});

$("#logout").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });

async function initUser(user) {
  if (!user) return;
  try {
    state.user = user;
    state.profile = await getProfile(user.id);
    const { data } = await sb.from("progress").select("*").eq("user_id", user.id).maybeSingle();
    if (data) Object.assign(state.progress, data);
  } catch (err) {
    console.error(err);
    showAuthMsg("Could not load your account. Check the Supabase settings in js/config.js.");
    state.user = null; return;
  }
  $("#whoami").textContent = state.profile.full_name + (state.profile.class_name ? " · " + state.profile.class_name : "");
  $("#userbox").classList.remove("hidden");
  $("#steps").classList.remove("hidden");
  $("#authCard").classList.add("hidden");
  $("#homeName").textContent = state.profile.full_name;
  $("#homeCta").classList.remove("hidden");
  updateChips();
}

/* ---------- Introduction ---------- */
$("#introPizza").innerHTML = pizzaSVG(4, new Set([0]));
renderMCQ($("#introQ"), {
  section: "Introduction", key: "trigger",
  text: "If a pizza is divided into 4 equal parts and you take 1 part, what is the value of that part?",
  options: ["1/2", "1/3", "1/4", "4/1"], answer: 2, neutral: true,
  neutralMsg: "You will find the answer through the FRACTIO activities.",
  onDone: () => { state.introDone = true; updateChips(); }
});

/* ---------- Fraction Learning ---------- */
(function material1() {
  let step = 0;
  const wrap = $("#m1Pizza"), cap = $("#m1Caption"), btn = $("#m1Next");
  function draw() {
    if (step === 0) { wrap.innerHTML = pizzaSVG(1); cap.textContent = "A whole pizza."; btn.textContent = "Cut the pizza ✂️"; }
    if (step === 1) { wrap.innerHTML = pizzaSVG(4); cap.textContent = "The pizza is cut into 4 equal parts."; btn.textContent = "Take 1 part 🍕"; }
    if (step === 2) { wrap.innerHTML = pizzaSVG(4, new Set([0])); cap.innerHTML = `1 part out of 4 parts = ${fracHTML(1, 4)}`; btn.textContent = "Start over"; }
  }
  btn.addEventListener("click", () => { step = (step + 1) % 3; draw(); });
  draw();
})();
$("#m2Bars").innerHTML = barHTML(1, 2) + barHTML(2, 4) + barHTML(4, 8);
renderMCQ($("#quickQ"), {
  section: "Fraction Learning", key: "quick_practice",
  text: "Which fraction is equivalent to 1/2?", options: ["1/3", "2/4", "3/5", "4/5"], answer: 1,
  okMsg: "Great! You understand equivalent fractions.", badMsg: "Not quite. Look at the fraction bars again and try another answer.",
  onDone: () => saveProgress({ learning: true })
});

/* ---------- Fraction Laboratory ---------- */
const lab = { parts: 1, sel: new Set(), t1: false, t2: false, a1: false, a2: false };
function labDone() { if (lab.a1 && lab.a2) saveProgress({ laboratory: true }); }

function drawLab() {
  const w = $("#labPizza");
  w.innerHTML = pizzaSVG(lab.parts, lab.sel);
  $$(".slice", w).forEach(s => s.addEventListener("click", () => {
    const i = +s.dataset.i;
    lab.sel.has(i) ? lab.sel.delete(i) : lab.sel.add(i);
    drawLab();
  }));
  $("#labFrac").innerHTML = `<i>${lab.sel.size}</i><i>${lab.parts}</i>`;
  $$("#partPicker .chip").forEach(c => c.classList.toggle("active", +c.dataset.n === lab.parts));
  if (lab.parts === 2 && lab.sel.size === 1) lab.t1 = true;
  if (lab.parts === 4 && lab.sel.size === 2) lab.t2 = true;
  $('#labTasks [data-t="1"]').classList.toggle("done", lab.t1);
  $('#labTasks [data-t="2"]').classList.toggle("done", lab.t2);
  if (lab.t1 && lab.t2) $("#labQWrap").classList.remove("hidden");
}
$("#partPicker").innerHTML = [1, 2, 4, 8].map(n => `<button type="button" class="chip" data-n="${n}">${n} ${n === 1 ? "part" : "parts"}</button>`).join("");
$$("#partPicker .chip").forEach(c => c.addEventListener("click", () => {
  lab.parts = +c.dataset.n; lab.sel = new Set(); drawLab();
}));
renderMCQ($("#labQ"), {
  section: "Fraction Laboratory", key: "lab1_same_area", letters: false,
  text: "Is the colored area of the pizza the same for 1/2 and 2/4?", options: ["Yes", "No"], answer: 0,
  okMsg: "Correct! Even though you cut more pieces, the colored area stays the same.",
  badMsg: "Not quite. Try again: compare the colored area in both cases.",
  onDone: () => { lab.a1 = true; labDone(); }
});
$("#cmpA").innerHTML = pizzaSVG(4, new Set([0, 1])) + `<div>Pizza A = ${fracHTML(2, 4)}</div>`;
$("#cmpB").innerHTML = pizzaSVG(2, new Set([0])) + `<div>Pizza B = ${fracHTML(1, 2)}</div>`;
renderMCQ($("#cmpQ"), {
  section: "Fraction Laboratory", key: "lab2_compare", letters: false,
  text: "Do the two fractions have the same value?", options: ["Yes", "No"], answer: 0,
  okMsg: "Correct! 2/4 has the same value as 1/2.", badMsg: "Not quite. Compare the colored parts again.",
  onDone: () => { lab.a2 = true; labDone(); }
});
drawLab();

/* ---------- Fraction Challenge ---------- */
const ch = { earned: {}, puzzle: 0, recipe: false, treasure: false };
function addPoints(key) {
  if (ch.earned[key]) return;
  ch.earned[key] = 10;
  const total = Object.values(ch.earned).reduce((a, b) => a + b, 0);
  $("#pts").textContent = total;
  saveProgress({ challenge_points: Math.max(state.progress.challenge_points || 0, total) });
}
function checkChallenge() {
  if (ch.puzzle >= 3 && ch.recipe && ch.treasure) saveProgress({ challenge: true });
}

(function puzzle() {
  const good = new Set(["2/4", "3/6", "4/8"]);
  const cards = ["2/4", "1/3", "3/6", "2/5", "4/8", "3/4"].sort(() => Math.random() - 0.5);
  const pool = $("#cardPool"), dz = $("#dz"), fb = $("#puzzleFb");
  let selected = null;
  pool.innerHTML = cards.map(c => `<div class="fcard" draggable="true" data-f="${c}">${fracHTML(...c.split("/"))}</div>`).join("");

  function handle(card) {
    if (!card || card.classList.contains("placed")) return;
    const f = card.dataset.f, ok = good.has(f);
    logResponse("Fraction Challenge", "puzzle_" + f, "Match fractions equivalent to 1/2", f, ok);
    card.classList.remove("sel"); selected = null;
    if (ok) {
      card.classList.add("placed"); card.draggable = false;
      const hint = $(".hint", dz); if (hint) hint.remove();
      dz.appendChild(card);
      ch.puzzle++; addPoints("puzzle_" + f);
      fb.className = "fb ok";
      fb.innerHTML = ch.puzzle >= 3 ? "All matches found! +10 points" : "Correct! +10 points";
      checkChallenge();
    } else {
      card.classList.add("shake"); setTimeout(() => card.classList.remove("shake"), 450);
      fb.className = "fb bad"; fb.innerHTML = `${fracHTML(...f.split("/"))} is not equivalent to ${fracHTML(1, 2)}. Try another card!`;
    }
  }
  pool.addEventListener("dragstart", e => { const c = e.target.closest(".fcard"); if (c) e.dataTransfer.setData("text/plain", c.dataset.f); });
  pool.addEventListener("click", e => {
    const c = e.target.closest(".fcard"); if (!c || c.classList.contains("placed")) return;
    $$(".fcard.sel", pool).forEach(x => x.classList.remove("sel"));
    selected = c; c.classList.add("sel");
  });
  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", e => {
    e.preventDefault(); dz.classList.remove("over");
    const f = e.dataTransfer.getData("text/plain");
    handle($$(".fcard", pool).find(c => c.dataset.f === f));
  });
  dz.addEventListener("click", () => { if (selected) handle(selected); });
})();

renderMCQ($("#recipeQ"), {
  section: "Fraction Challenge", key: "recipe_quest",
  text: "One cake needs 1/2 cup of sugar. Rina wants to make 2 cakes. How much sugar does she need?",
  options: ["1 cup", "1/2 cup", "2/3 cup", "3 cups"], answer: 0,
  okMsg: "Correct! 1/2 + 1/2 = 1 cup. +10 points", badMsg: "Not quite. Two cakes need two times the sugar of one cake.",
  onDone: () => { ch.recipe = true; addPoints("recipe"); checkChallenge(); }
});
renderMCQ($("#treasureQ"), {
  section: "Fraction Challenge", key: "treasure_hunt",
  text: "3/6 is equal to…", options: ["1/2", "2/3", "3/4", "4/5"], answer: 0,
  okMsg: "Code found! The next level is unlocked. +10 points", badMsg: "Wrong code. Try again!",
  onDone: () => { ch.treasure = true; $("#treasureCode").classList.remove("hidden"); addPoints("treasure"); checkChallenge(); }
});

/* ---------- Quiz Master ---------- */
const QUIZ = [
  { q: "Which fraction is equivalent to 3/4?", o: ["6/8", "4/6", "5/8", "8/10"], a: 0 },
  { q: "A cake is cut into 8 equal pieces. Budi eats 4 pieces. Which fraction shows the part of the cake he ate?", o: ["1/4", "3/4", "1/2", "8/4"], a: 2 },
  { q: "Which fraction is equivalent to 2/3?", o: ["4/6", "3/4", "2/6", "3/5"], a: 0 },
  { q: "Which fraction is greater: 3/4 or 2/3?", o: ["2/3", "3/4", "They are equal", "It cannot be determined"], a: 1 },
  { q: "2/5 + 1/5 = …", o: ["3/10", "2/5", "3/5", "1/5"], a: 2 },
  { q: "4/7 − 1/7 = …", o: ["5/7", "3/7", "3/14", "4/14"], a: 1 },
  { q: "Order these fractions from smallest to largest: 1/2, 1/4, 3/4", o: ["1/2, 1/4, 3/4", "1/4, 1/2, 3/4", "3/4, 1/2, 1/4", "1/4, 3/4, 1/2"], a: 1 },
  { q: "2/3 = ?/12. What is the missing number?", o: ["6", "9", "8", "4"], a: 2 },
  { q: "Rina has 12 candies and gives 1/3 of them to her friend. How many candies does she give away?", o: ["3", "6", "9", "4"], a: 3 },
  { q: "1/2 + 1/4 = …", o: ["2/6", "2/4", "1/6", "3/4"], a: 3 }
];
let qi = 0, qAnswers = [];
function showQuiz(which) {
  ["Start", "Run", "Done"].forEach(n => $("#quiz" + n).classList.toggle("hidden", n !== which));
}
function renderQuizQ() {
  const item = QUIZ[qi];
  $("#quizCount").textContent = `Question ${qi + 1} of ${QUIZ.length}`;
  $("#quizBar").style.width = (qi / QUIZ.length * 100) + "%";
  $("#quizNext").classList.add("hidden");
  renderMCQ($("#quizQ"), {
    section: "Quiz Master", key: "quiz_" + (qi + 1), text: item.q, options: item.o, answer: item.a, retry: false,
    okMsg: "Correct! Well done.", badMsg: `Not quite. The correct answer is ${LETTERS[item.a]}. ${item.o[item.a]}`,
    onDone: (correct, i) => {
      qAnswers.push({ n: qi + 1, q: item.q, chosen: item.o[i], correct });
      const nx = $("#quizNext");
      nx.textContent = qi === QUIZ.length - 1 ? "See my score" : "Next →";
      nx.classList.remove("hidden");
    }
  });
}
$("#quizBegin").addEventListener("click", () => { qi = 0; qAnswers = []; showQuiz("Run"); renderQuizQ(); });
$("#quizNext").addEventListener("click", async () => {
  if (qi < QUIZ.length - 1) { qi++; renderQuizQ(); return; }
  const correctCount = qAnswers.filter(a => a.correct).length, score = correctCount * 10;
  $("#quizBar").style.width = "100%";
  const { error } = await sb.from("quiz_results").insert({
    user_id: state.user.id, score, correct_count: correctCount, total: QUIZ.length, answers: qAnswers
  });
  if (error) console.warn("quiz result not saved", error.message);
  await saveProgress({ quiz_score: score });
  $("#finalScore").textContent = score;
  $("#finalMsg").textContent = score >= 90 ? "Great! Your understanding of fractions is very good."
    : score >= 70 ? "Good job! A little more practice and you will be a fraction master."
    : "Keep going! Review Fraction Learning and try again.";
  showQuiz("Done");
});
$("#quizRetry").addEventListener("click", () => showQuiz("Start"));

/* ---------- Closing ---------- */
$("#reflForm").addEventListener("submit", async e => {
  e.preventDefault();
  const m = $("#reflMsg");
  const { error } = await sb.from("reflections").insert({
    user_id: state.user.id, new_learning: $("#r1").value.trim(), most_helpful: $("#r2").value.trim(), still_difficult: $("#r3").value.trim()
  });
  if (error) { m.className = "msg err"; m.textContent = "Could not save your reflection. Please try again."; return; }
  m.className = "msg ok"; m.textContent = "Thank you! Your reflection has been saved for your teacher.";
  $("#reflForm button").disabled = true;
  state.closingDone = true; updateChips();
});

/* ---------- start ---------- */
(async () => {
  const user = await getSessionUser();
  if (user) await initUser(user);
})();
