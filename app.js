"use strict";

const HISTORY_KEY = "srquiz_history_v1";
const CHOICE_KEYS = ["A", "B", "C", "D", "E"];

const SUBJECT_SHORT_RULES = [
  ["労働基準法及び労働安全衛生法", "労働基準法・安衛法"],
  ["労働者災害補償保険法", "労災保険法（徴収法）"],
  ["雇用保険法", "雇用保険法（徴収法）"],
  ["労務管理その他の労働及び社会保険に関する一般常識", "労一・社一（一般常識）"],
  ["健康保険法", "健康保険法"],
  ["厚生年金保険法", "厚生年金保険法"],
  ["国民年金法", "国民年金法"],
];

function shortSubjectName(full) {
  const hit = SUBJECT_SHORT_RULES.find((r) => full.startsWith(r[0]));
  return hit ? hit[1] : full;
}

const els = {};

const state = {
  questions: [],
  subjects: [],
  years: [],
  selectedYear: "ALL",
  session: null, // { list, index, label, results: [{id, correct}] }
};

// ---------- history (localStorage) ----------

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {};
  } catch {
    return {};
  }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function recordAnswer(questionId, isCorrect) {
  const history = loadHistory();
  const key = String(questionId);
  const entry = history[key] || { correct: 0, incorrect: 0, lastResult: null };
  if (isCorrect) entry.correct += 1;
  else entry.incorrect += 1;
  entry.lastResult = isCorrect ? "correct" : "incorrect";
  history[key] = entry;
  saveHistory(history);
}

function getWrongQuestions() {
  const history = loadHistory();
  return filteredQuestions().filter((q) => {
    const e = history[String(q.id)];
    return e && e.lastResult === "incorrect";
  });
}

function subjectStats(subject) {
  const history = loadHistory();
  const qs = filteredQuestions().filter((q) => q.subject === subject);
  let attempted = 0;
  let correct = 0;
  for (const q of qs) {
    const e = history[String(q.id)];
    if (!e) continue;
    attempted += 1;
    if (e.lastResult === "correct") correct += 1;
  }
  return { total: qs.length, attempted, correct };
}

function overallStats() {
  const history = loadHistory();
  const qs = filteredQuestions();
  let attempted = 0;
  let correct = 0;
  let totalAnswers = 0;
  let totalCorrectAnswers = 0;
  for (const q of qs) {
    const e = history[String(q.id)];
    if (!e) continue;
    attempted += 1;
    if (e.lastResult === "correct") correct += 1;
    totalAnswers += e.correct + e.incorrect;
    totalCorrectAnswers += e.correct;
  }
  return { attempted, correct, total: qs.length, totalAnswers, totalCorrectAnswers };
}

// ---------- utils ----------

function filteredQuestions() {
  if (state.selectedYear === "ALL") return state.questions;
  return state.questions.filter((q) => q.year === state.selectedYear);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo(0, 0);

  els.btnBack.hidden = id === "screen-home";
  const titles = {
    "screen-home": "社労士 過去問クイズ",
    "screen-quiz": state.session ? state.session.label : "クイズ",
    "screen-session-result": "結果",
    "screen-stats": "成績",
  };
  els.headerTitle.textContent = titles[id] || "社労士 過去問クイズ";
}

// ---------- rendering: year chips ----------

function renderYearChips(container, onChange) {
  container.innerHTML = "";
  const options = [{ key: "ALL", label: "全年度" }, ...state.years.map((y) => ({ key: y, label: y }))];
  for (const opt of options) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "year-chip" + (state.selectedYear === opt.key ? " active" : "");
    chip.textContent = opt.label;
    chip.addEventListener("click", () => {
      if (state.selectedYear === opt.key) return;
      state.selectedYear = opt.key;
      onChange();
    });
    container.appendChild(chip);
  }
}

// ---------- rendering: home ----------

function renderHome() {
  renderYearChips(els.yearChipsHome, renderHome);

  els.subjectGrid.innerHTML = "";
  for (const subject of state.subjects) {
    const stats = subjectStats(subject);
    const card = document.createElement("button");
    card.className = "subject-card";
    card.type = "button";

    const rateHtml =
      stats.attempted > 0
        ? `<div class="rate">${Math.round((stats.correct / stats.attempted) * 100)}%</div>`
        : `<div class="rate no-data">未学習</div>`;

    card.innerHTML = `
      <div>
        <div class="name">${shortSubjectName(subject)}</div>
        <div class="meta">全${stats.total}問・学習済 ${stats.attempted}問</div>
      </div>
      ${rateHtml}
    `;
    card.addEventListener("click", () => {
      const qs = filteredQuestions().filter((q) => q.subject === subject);
      const yearLabel = state.selectedYear === "ALL" ? "" : `（${state.selectedYear}）`;
      startSession(qs, `${shortSubjectName(subject)}${yearLabel}`);
    });
    els.subjectGrid.appendChild(card);
  }

  const yearLabel = state.selectedYear === "ALL" ? "全年度" : state.selectedYear;
  els.btnRandomAll.textContent = `🔀 ランダム出題（${yearLabel}・${filteredQuestions().length}問）`;

  const wrongCount = getWrongQuestions().length;
  els.reviewCount.textContent = wrongCount;
  els.btnReview.disabled = wrongCount === 0;
  els.btnReview.style.opacity = wrongCount === 0 ? 0.5 : 1;
}

// ---------- rendering: quiz ----------

function startSession(questions, label) {
  if (questions.length === 0) return;
  state.session = {
    list: shuffle(questions),
    index: 0,
    label,
    results: [],
  };
  showScreen("screen-quiz");
  renderQuestion();
}

function currentQuestion() {
  return state.session.list[state.session.index];
}

function renderQuestion() {
  const session = state.session;
  const q = currentQuestion();
  q._answered = false;

  const total = session.list.length;
  const pos = session.index + 1;
  els.progressBar.style.width = `${(session.index / total) * 100}%`;
  els.progressText.textContent = `${pos} / ${total}`;

  els.quizSubjectTag.textContent = `${q.year}  ${shortSubjectName(q.subject)}  第${q.question_number}問`;
  els.questionText.textContent = q.question_text;

  els.subItems.innerHTML = "";
  if (q.sub_items && q.sub_items.length > 0) {
    els.subItems.hidden = false;
    for (const item of q.sub_items) {
      const li = document.createElement("li");
      li.textContent = `${item.label}　${item.text}`;
      els.subItems.appendChild(li);
    }
  } else {
    els.subItems.hidden = true;
  }

  els.choicesList.innerHTML = "";
  for (const key of CHOICE_KEYS) {
    if (!(key in q.choices)) continue;
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.type = "button";
    btn.dataset.key = key;
    btn.innerHTML = `<span class="choice-letter">${key}</span><span class="choice-body">${q.choices[key]}</span>`;
    btn.addEventListener("click", () => selectChoice(key));
    els.choicesList.appendChild(btn);
  }

  els.feedback.hidden = true;
  els.postAnswerActions.hidden = true;
  els.explanationCard.innerHTML = "";
  closeSheet();
}

let sheetHideTimeoutId = null;

function openSheet() {
  if (sheetHideTimeoutId) {
    clearTimeout(sheetHideTimeoutId);
    sheetHideTimeoutId = null;
  }
  els.sheetBackdrop.hidden = false;
  els.explanationSheet.hidden = false;
  els.explanationSheet.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    els.sheetBackdrop.classList.add("open");
    els.explanationSheet.classList.add("open");
  });
}

function closeSheet() {
  els.sheetBackdrop.classList.remove("open");
  els.explanationSheet.classList.remove("open");
  els.explanationSheet.setAttribute("aria-hidden", "true");
  if (sheetHideTimeoutId) clearTimeout(sheetHideTimeoutId);
  sheetHideTimeoutId = setTimeout(() => {
    els.sheetBackdrop.hidden = true;
    els.explanationSheet.hidden = true;
    sheetHideTimeoutId = null;
  }, 280);
}

function renderExplanationCard(q) {
  if (!q.explanation) {
    els.explanationCard.innerHTML = `<p class="explanation-pending">📘 解説準備中</p>`;
    return;
  }

  const draftNote =
    q.explanation_status === "draft"
      ? `<span class="explanation-draft-note">⚠️ AI生成・未レビュー</span>`
      : "";

  const choiceRows = CHOICE_KEYS.filter((k) => k in q.choices)
    .map((k) => {
      const isCorrect = k === q.answer;
      const text = (q.choices_explanation && q.choices_explanation[k]) || "";
      return `
        <div class="choice-explanation-item ${isCorrect ? "correct" : "other"}">
          <span class="ce-letter">${k}</span>
          <span>${text}</span>
        </div>
      `;
    })
    .join("");

  const referenceHtml =
    q.reference && q.reference.length > 0
      ? `
        <div class="explanation-section">
          <p class="explanation-heading">根拠法令</p>
          <div class="reference-list">
            ${q.reference.map((r) => `<span class="reference-tag">${r}</span>`).join("")}
          </div>
        </div>
      `
      : "";

  const keyPointHtml = q.key_point
    ? `
      <div class="explanation-section">
        <p class="explanation-heading">💡 覚えるポイント</p>
        <div class="key-point-box">${q.key_point}</div>
      </div>
    `
    : "";

  els.explanationCard.innerHTML = `
    ${draftNote}
    <div class="explanation-section">
      <p class="explanation-heading">解説</p>
      <p class="explanation-text">${q.explanation}</p>
    </div>
    <div class="explanation-section">
      <p class="explanation-heading">各肢の解説</p>
      <div class="choice-explanation-list">${choiceRows}</div>
    </div>
    ${referenceHtml}
    ${keyPointHtml}
  `;
}

function selectChoice(selectedKey) {
  const session = state.session;
  const q = currentQuestion();
  if (q._answered) return;
  q._answered = true;

  const isCorrect = selectedKey === q.answer;
  recordAnswer(q.id, isCorrect);
  session.results.push({ id: q.id, correct: isCorrect });

  document.querySelectorAll(".choice-btn").forEach((btn) => {
    btn.classList.add("disabled");
    const key = btn.dataset.key;
    if (key === q.answer) btn.classList.add("correct");
    else if (key === selectedKey) btn.classList.add("incorrect");
  });

  els.feedbackText.textContent = isCorrect
    ? "○ 正解！"
    : `✕ 不正解…　正答は ${q.answer}`;
  els.feedback.hidden = false;

  renderExplanationCard(q);

  const nextLabel = session.index + 1 >= session.list.length ? "結果を見る →" : "次の問題へ →";
  els.btnNext.textContent = nextLabel;
  els.btnNextFromSheet.textContent = nextLabel;

  els.postAnswerActions.hidden = false;
  els.btnNext.focus();
}

function nextQuestion() {
  const session = state.session;
  session.index += 1;
  if (session.index >= session.list.length) {
    finishSession();
  } else {
    renderQuestion();
  }
}

function finishSession() {
  const session = state.session;
  const correctCount = session.results.filter((r) => r.correct).length;
  const total = session.results.length;

  els.progressBar.style.width = "100%";

  els.sessionScore.textContent = `${correctCount} / ${total}`;
  els.sessionScoreRate.textContent =
    total > 0 ? `正答率 ${Math.round((correctCount / total) * 100)}%` : "";

  els.sessionBreakdown.innerHTML = "";
  session.results.forEach((r, i) => {
    const q = session.list[i];
    const row = document.createElement("div");
    row.className = `session-item ${r.correct ? "ok" : "ng"}`;
    row.innerHTML = `
      <span class="mark">${r.correct ? "○" : "✕"}</span>
      <span class="qtext">${q.year} ${shortSubjectName(q.subject)} 第${q.question_number}問　${q.question_text}</span>
    `;
    els.sessionBreakdown.appendChild(row);
  });

  const hasWrong = session.results.some((r) => !r.correct);
  els.btnRetryWrong.hidden = !hasWrong;

  showScreen("screen-session-result");
}

function retryWrongFromSession() {
  const session = state.session;
  const wrongIds = new Set(session.results.filter((r) => !r.correct).map((r) => r.id));
  const wrongQs = session.list.filter((q) => wrongIds.has(q.id));
  startSession(wrongQs, "間違えた問題の復習");
}

// ---------- rendering: stats ----------

function renderStats() {
  renderYearChips(els.yearChipsStats, renderStats);

  const overall = overallStats();
  els.statsOverall.innerHTML = `
    <div>
      <div class="stat-num">${overall.attempted}/${overall.total}</div>
      <div class="stat-label">学習済み問題数</div>
    </div>
    <div>
      <div class="stat-num">${
        overall.attempted > 0 ? Math.round((overall.correct / overall.attempted) * 100) : 0
      }%</div>
      <div class="stat-label">現在の正答率</div>
    </div>
    <div>
      <div class="stat-num">${overall.totalAnswers}</div>
      <div class="stat-label">総解答回数</div>
    </div>
  `;

  els.statsBySubject.innerHTML = "";
  for (const subject of state.subjects) {
    const s = subjectStats(subject);
    const pct = s.attempted > 0 ? Math.round((s.correct / s.attempted) * 100) : 0;
    const row = document.createElement("div");
    row.className = "stats-row";
    row.innerHTML = `
      <div class="row-top">
        <span>${shortSubjectName(subject)}</span>
        <span class="pct">${s.attempted > 0 ? pct + "%" : "-"}</span>
      </div>
      <div class="row-bar"><div class="row-bar-fill" style="width:${pct}%"></div></div>
      <div class="row-meta">学習済 ${s.attempted} / ${s.total} 問</div>
    `;
    els.statsBySubject.appendChild(row);
  }
}

function resetHistory() {
  if (!confirm("学習履歴をすべてリセットします。よろしいですか？")) return;
  localStorage.removeItem(HISTORY_KEY);
  renderStats();
  renderHome();
}

// ---------- init ----------

function cacheEls() {
  const ids = [
    "btnBack",
    "headerTitle",
    "btnHeaderStats",
    "yearChipsHome",
    "yearChipsStats",
    "subjectGrid",
    "btnRandomAll",
    "btnReview",
    "reviewCount",
    "progressBar",
    "progressText",
    "quizSubjectTag",
    "questionText",
    "subItems",
    "choicesList",
    "feedback",
    "feedbackText",
    "postAnswerActions",
    "btnShowExplanation",
    "btnNext",
    "sheetBackdrop",
    "explanationSheet",
    "btnCloseSheet",
    "explanationCard",
    "btnNextFromSheet",
    "sessionScore",
    "sessionScoreRate",
    "sessionBreakdown",
    "btnRetryWrong",
    "btnBackHome",
    "statsOverall",
    "statsBySubject",
    "btnResetHistory",
    "updateToast",
    "btnUpdateNow",
    "btnDismissUpdate",
  ];
  for (const id of ids) els[id] = document.getElementById(id);
}

function bindEvents() {
  els.btnBack.addEventListener("click", () => showScreen("screen-home"));
  els.btnHeaderStats.addEventListener("click", () => {
    renderStats();
    showScreen("screen-stats");
  });
  els.btnRandomAll.addEventListener("click", () => {
    const yearLabel = state.selectedYear === "ALL" ? "全年度" : state.selectedYear;
    startSession(filteredQuestions(), `ランダム出題（${yearLabel}）`);
  });
  els.btnReview.addEventListener("click", () => startSession(getWrongQuestions(), "復習モード"));
  els.btnNext.addEventListener("click", nextQuestion);
  els.btnNextFromSheet.addEventListener("click", nextQuestion);
  els.btnShowExplanation.addEventListener("click", openSheet);
  els.btnCloseSheet.addEventListener("click", closeSheet);
  els.sheetBackdrop.addEventListener("click", closeSheet);
  els.btnBackHome.addEventListener("click", () => {
    state.session = null;
    renderHome();
    showScreen("screen-home");
  });
  els.btnRetryWrong.addEventListener("click", retryWrongFromSession);
  els.btnResetHistory.addEventListener("click", resetHistory);
  els.btnUpdateNow.addEventListener("click", () => window.location.reload());
  els.btnDismissUpdate.addEventListener("click", hideUpdateToast);
}

// ---------- Service Worker update detection ----------

function showUpdateToast() {
  els.updateToast.hidden = false;
  requestAnimationFrame(() => els.updateToast.classList.add("show"));
}

function hideUpdateToast() {
  els.updateToast.classList.remove("show");
  setTimeout(() => {
    els.updateToast.hidden = true;
  }, 250);
}

function watchForServiceWorkerUpdate(registration) {
  // 既に新しいバージョンが待機中の場合(このタブを開いたまま裏で更新が来ていた場合)
  if (registration.waiting && navigator.serviceWorker.controller) {
    showUpdateToast();
  }

  registration.addEventListener("updatefound", () => {
    const newWorker = registration.installing;
    if (!newWorker) return;
    newWorker.addEventListener("statechange", () => {
      // controller が既にある(=初回インストールではない)状態で新しいSWが
      // installed になった場合のみ「更新あり」として通知する。
      if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
        showUpdateToast();
      }
    });
  });
}

async function init() {
  cacheEls();
  bindEvents();

  try {
    const res = await fetch("./questions.json");
    state.questions = await res.json();
  } catch (err) {
    els.subjectGrid.innerHTML = `<p class="empty-note">問題データを読み込めませんでした。オンライン状態で一度アクセスしてください。</p>`;
    return;
  }

  const seen = new Set();
  state.subjects = [];
  const seenYears = new Set();
  state.years = [];
  for (const q of state.questions) {
    if (!seen.has(q.subject)) {
      seen.add(q.subject);
      state.subjects.push(q.subject);
    }
    if (!seenYears.has(q.year)) {
      seenYears.add(q.year);
      state.years.push(q.year);
    }
  }

  renderHome();
  showScreen("screen-home");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => watchForServiceWorkerUpdate(registration))
      .catch(() => {});
  }
}

init();
