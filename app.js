"use strict";

const HISTORY_KEY = "srquiz_history_v1";
const NOTES_KEY = "srquiz_notes_v1";
const DAILY_KEY = "srquiz_daily_v1";
const APP_STORAGE_KEYS = [HISTORY_KEY, NOTES_KEY, DAILY_KEY];
const CHOICE_KEYS = ["A", "B", "C", "D", "E"];
const SUBJECT_TAGS = ["労基", "安衛", "労災", "雇用", "徴収", "労一", "健保", "厚年", "国年", "社一"];

const SUBJECT_SHORT_RULES = [
  ["労働基準法及び労働安全衛生法", "労働基準法・安衛法"],
  ["労働者災害補償保険法", "労災保険法（徴収法）"],
  ["雇用保険法", "雇用保険法（徴収法）"],
  ["労務管理その他の労働及び社会保険に関する一般常識", "労一・社一（一般常識）"],
  ["健康保険法", "健康保険法"],
  ["厚生年金保険法", "厚生年金保険法"],
  ["国民年金法", "国民年金法"],
];

const SUBJECT_TAG_RULES = [
  ["労働基準法及び労働安全衛生法", ["労基", "安衛"]],
  ["労働者災害補償保険法", ["労災", "徴収"]],
  ["雇用保険法", ["雇用", "徴収"]],
  ["労務管理その他の労働及び社会保険に関する一般常識", ["労一", "社一"]],
  ["健康保険法", ["健保"]],
  ["厚生年金保険法", ["厚年"]],
  ["国民年金法", ["国年"]],
];

function shortSubjectName(full) {
  const hit = SUBJECT_SHORT_RULES.find((r) => full.startsWith(r[0]));
  return hit ? hit[1] : full;
}

function tagsForSubject(full) {
  const hit = SUBJECT_TAG_RULES.find((r) => full.startsWith(r[0]));
  return hit ? hit[1].slice() : [];
}

const els = {};
let charts = { radar: null, yearBar: null, daily: null };

const state = {
  questions: [],
  subjects: [],
  years: [],
  selectedYear: "ALL",
  analysisYear: "ALL",
  noteFilterTag: "ALL",
  session: null, // { list, index, label, results: [{id, correct}] }
  editingNote: null,
};

// ---------- utils ----------

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, query) {
  const escaped = escapeHtml(text);
  const q = String(query || "").trim();
  if (!q) return escaped;
  const re = new RegExp(escapeRegExp(escapeHtml(q)), "gi");
  return escaped.replace(re, (m) => `<mark>${m}</mark>`);
}

function snippetAround(text, query, radius = 40) {
  const src = String(text || "");
  const idx = src.toLowerCase().indexOf(String(query || "").toLowerCase());
  if (idx === -1) return src.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(src.length, idx + query.length + radius);
  let snippet = src.slice(start, end);
  if (start > 0) snippet = "…" + snippet;
  if (end < src.length) snippet = snippet + "…";
  return snippet;
}

function truncate(str, n) {
  const s = String(str || "");
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function questionsForYear(year) {
  if (year === "ALL") return state.questions;
  return state.questions.filter((q) => q.year === year);
}

function filteredQuestions() {
  return questionsForYear(state.selectedYear);
}

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
  recordDailyAnswer();
}

function getWrongQuestions() {
  const history = loadHistory();
  return filteredQuestions().filter((q) => {
    const e = history[String(q.id)];
    return e && e.lastResult === "incorrect";
  });
}

function subjectStatsFor(subject, year) {
  const history = loadHistory();
  const qs = questionsForYear(year).filter((q) => q.subject === subject);
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

function subjectStats(subject) {
  return subjectStatsFor(subject, state.selectedYear);
}

function yearStats(year) {
  const history = loadHistory();
  const qs = questionsForYear(year);
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

function computeWeakSubjects(year, threshold = 60) {
  const stats = state.subjects.map((s) => ({ subject: s, ...subjectStatsFor(s, year) }));
  const attempted = stats.filter((s) => s.attempted > 0);
  if (attempted.length === 0) return [];
  const withRate = attempted.map((s) => ({ ...s, rate: (s.correct / s.attempted) * 100 }));
  const weak = withRate.filter((s) => s.rate < threshold);
  if (weak.length > 0) return weak.map((s) => s.subject);
  return withRate
    .slice()
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 2)
    .map((s) => s.subject);
}

// ---------- daily study log (localStorage) ----------

function loadDaily() {
  try {
    return JSON.parse(localStorage.getItem(DAILY_KEY)) || {};
  } catch {
    return {};
  }
}

function saveDaily(daily) {
  // 直近60日分だけ保持し、無期限に肥大化しないようにする。
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffKey = dateKey(cutoff);
  const pruned = {};
  for (const k in daily) {
    if (k >= cutoffKey) pruned[k] = daily[k];
  }
  localStorage.setItem(DAILY_KEY, JSON.stringify(pruned));
}

function recordDailyAnswer() {
  const daily = loadDaily();
  const key = dateKey(new Date());
  daily[key] = (daily[key] || 0) + 1;
  saveDaily(daily);
}

function last7DaysCounts() {
  const daily = loadDaily();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    days.push({ key, label: `${d.getMonth() + 1}/${d.getDate()}`, count: daily[key] || 0 });
  }
  return days;
}

// ---------- notes (localStorage) ----------

function loadNotes() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTES_KEY)) || [];
    if (!Array.isArray(raw)) return [];
    return raw.map((n) => ({
      id: n.id,
      title: n.title || "",
      body: n.body || "",
      subjectTags: Array.isArray(n.subjectTags) ? n.subjectTags : [],
      freeTags: Array.isArray(n.freeTags) ? n.freeTags : [],
      linkedQuestionId: n.linkedQuestionId || null,
      createdAt: n.createdAt || Date.now(),
      updatedAt: n.updatedAt || Date.now(),
    }));
  } catch {
    return [];
  }
}

function saveNotes(notes) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

function genNoteId() {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function upsertNote(note) {
  const notes = loadNotes();
  const idx = notes.findIndex((n) => n.id === note.id);
  note.updatedAt = Date.now();
  if (idx === -1) {
    note.createdAt = note.updatedAt;
    notes.unshift(note);
  } else {
    notes[idx] = note;
  }
  saveNotes(notes);
}

function deleteNoteById(id) {
  saveNotes(loadNotes().filter((n) => n.id !== id));
}

function buildQuoteFromQuestion(q) {
  const subItemsText = (q.sub_items || []).map((s) => `${s.label}　${s.text}`).join("\n");
  const choicesText = CHOICE_KEYS.filter((k) => k in q.choices)
    .map((k) => `${k}. ${q.choices[k]}`)
    .join("\n");
  const parts = [
    `【問題】${q.year} ${shortSubjectName(q.subject)} 第${q.question_number}問`,
    q.question_text,
  ];
  if (subItemsText) parts.push(subItemsText);
  parts.push("", "【選択肢】", choicesText, "", `【正答】${q.answer}`);
  if (q.explanation) parts.push("", "【解説】", q.explanation);
  if (q.key_point) parts.push("", "【覚えるポイント】", q.key_point);
  return parts.join("\n");
}

// ---------- search ----------

function searchQuestions(query) {
  const q = query.toLowerCase();
  return state.questions.filter((item) => {
    const hay = [
      item.question_text,
      ...(item.sub_items || []).map((s) => s.text),
      ...CHOICE_KEYS.filter((k) => k in item.choices).map((k) => item.choices[k]),
      item.explanation || "",
      ...(item.choices_explanation ? Object.values(item.choices_explanation) : []),
      item.key_point || "",
      ...(item.reference || []),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

function searchNotes(query) {
  const q = query.toLowerCase();
  return loadNotes().filter((n) => {
    const hay = [n.title, n.body, ...n.subjectTags, ...n.freeTags].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function renderSearchResults(rawQuery) {
  const query = String(rawQuery || "").trim();
  els.btnSearchClear.hidden = query.length === 0;

  if (!query) {
    els.searchResults.hidden = true;
    els.searchNormalContent.hidden = false;
    return;
  }

  els.searchResults.hidden = false;
  els.searchNormalContent.hidden = true;

  const qResults = searchQuestions(query).slice(0, 30);
  const nResults = searchNotes(query);
  els.searchResultsCount.textContent = `問題 ${qResults.length}件・ノート ${nResults.length}件`;

  els.searchQuestionList.innerHTML = qResults.length
    ? qResults
        .map(
          (item) => `
        <button type="button" class="search-result-item" data-qid="${escapeHtml(item.id)}">
          <span class="search-result-meta">${item.year} ${shortSubjectName(item.subject)} 第${item.question_number}問</span>
          <span class="search-result-snippet">${highlightText(snippetAround(item.question_text, query), query)}</span>
        </button>
      `
        )
        .join("")
    : `<p class="empty-note">該当する問題はありません。</p>`;

  els.searchQuestionList.querySelectorAll(".search-result-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = state.questions.find((it) => String(it.id) === btn.dataset.qid);
      if (q) startSession([q], `検索結果: ${shortSubjectName(q.subject)} 第${q.question_number}問`);
    });
  });

  els.searchNoteList.innerHTML = nResults.length
    ? nResults
        .map(
          (n) => `
        <button type="button" class="search-result-item" data-note-id="${escapeHtml(n.id)}">
          <span class="search-result-meta">📝 ${escapeHtml(n.title || "無題のノート")}</span>
          <span class="search-result-snippet">${highlightText(snippetAround(n.body, query), query)}</span>
        </button>
      `
        )
        .join("")
    : `<p class="empty-note">該当するノートはありません。</p>`;

  els.searchNoteList.querySelectorAll(".search-result-item").forEach((btn) => {
    btn.addEventListener("click", () => openNoteEditor(btn.dataset.noteId));
  });
}

// ---------- screen navigation ----------

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
    "screen-notes": "ノート",
    "screen-note-edit": state.editingNote && state.editingNote.id ? "ノートを編集" : "ノートを作成",
    "screen-analysis": "分析",
    "screen-settings": "設定",
  };
  els.headerTitle.textContent = titles[id] || "社労士 過去問クイズ";
}

// ---------- rendering: year chips (汎用) ----------

function renderYearChips(container, selectedKey, onSelect) {
  container.innerHTML = "";
  const options = [{ key: "ALL", label: "全年度" }, ...state.years.map((y) => ({ key: y, label: y }))];
  for (const opt of options) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "year-chip" + (selectedKey === opt.key ? " active" : "");
    chip.textContent = opt.label;
    chip.addEventListener("click", () => {
      if (selectedKey === opt.key) return;
      onSelect(opt.key);
    });
    container.appendChild(chip);
  }
}

// ---------- rendering: home ----------

function renderHome() {
  renderYearChips(els.yearChipsHome, state.selectedYear, (key) => {
    state.selectedYear = key;
    renderHome();
  });

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
  renderYearChips(els.yearChipsStats, state.selectedYear, (key) => {
    state.selectedYear = key;
    renderStats();
  });

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
  localStorage.removeItem(DAILY_KEY);
  renderStats();
  renderHome();
}

// ---------- rendering: notes ----------

function noteMatchesFilter(n) {
  if (state.noteFilterTag === "ALL") return true;
  return n.subjectTags.includes(state.noteFilterTag);
}

function renderNoteFilterChips() {
  els.noteFilterChips.innerHTML = "";
  const options = ["ALL", ...SUBJECT_TAGS];
  for (const tag of options) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "year-chip" + (state.noteFilterTag === tag ? " active" : "");
    chip.textContent = tag === "ALL" ? "すべて" : tag;
    chip.addEventListener("click", () => {
      if (state.noteFilterTag === tag) return;
      state.noteFilterTag = tag;
      renderNotesList();
    });
    els.noteFilterChips.appendChild(chip);
  }
}

function renderNotesList() {
  renderNoteFilterChips();
  const notes = loadNotes()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter(noteMatchesFilter);

  els.notesList.innerHTML = "";
  if (notes.length === 0) {
    els.notesList.innerHTML = `<p class="empty-note">ノートはまだありません。問題の解説画面から追加するか、「+ 新規作成」で作成できます。</p>`;
    return;
  }
  for (const note of notes) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "note-card";
    const tagsHtml = [...note.subjectTags, ...note.freeTags]
      .map((t) => `<span class="tag-chip small">${escapeHtml(t)}</span>`)
      .join("");
    card.innerHTML = `
      <div class="note-card-title">${escapeHtml(note.title || "無題のノート")}</div>
      <div class="note-card-snippet">${escapeHtml(truncate(note.body, 60))}</div>
      ${tagsHtml ? `<div class="note-card-tags">${tagsHtml}</div>` : ""}
      <div class="note-card-date">${formatDate(note.updatedAt)}</div>
    `;
    card.addEventListener("click", () => openNoteEditor(note.id));
    els.notesList.appendChild(card);
  }
}

// ---------- rendering: note editor ----------

function renderNoteSubjectTagChips() {
  els.noteSubjectTags.innerHTML = "";
  for (const tag of SUBJECT_TAGS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag-chip" + (state.editingNote.subjectTags.includes(tag) ? " active" : "");
    chip.textContent = tag;
    chip.addEventListener("click", () => {
      const tags = state.editingNote.subjectTags;
      const i = tags.indexOf(tag);
      if (i === -1) tags.push(tag);
      else tags.splice(i, 1);
      renderNoteSubjectTagChips();
    });
    els.noteSubjectTags.appendChild(chip);
  }
}

function renderNoteFreeTags() {
  els.noteFreeTagList.innerHTML = "";
  state.editingNote.freeTags.forEach((tag, i) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip removable";
    chip.innerHTML = `${escapeHtml(tag)} <button type="button" aria-label="タグを削除">✕</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      state.editingNote.freeTags.splice(i, 1);
      renderNoteFreeTags();
    });
    els.noteFreeTagList.appendChild(chip);
  });
}

function renderNoteEditor() {
  const note = state.editingNote;
  els.noteEditHeading.textContent = note.id ? "ノートを編集" : "ノートを作成";
  els.noteEditTitle.value = note.title || "";
  els.noteEditBody.value = note.body || "";
  els.noteFreeTagInput.value = "";
  renderNoteSubjectTagChips();
  renderNoteFreeTags();
  els.btnDeleteNote.hidden = !note.id;

  const linked = note.linkedQuestionId
    ? state.questions.find((q) => q.id === note.linkedQuestionId)
    : null;
  if (linked) {
    els.noteLinkedQuestion.hidden = false;
    els.btnGoToLinkedQuestion.textContent = `🔗 ${linked.year} ${shortSubjectName(linked.subject)} 第${linked.question_number}問を解き直す`;
  } else {
    els.noteLinkedQuestion.hidden = true;
  }
}

function openNoteEditor(noteId) {
  if (!noteId) {
    state.editingNote = { id: null, title: "", body: "", subjectTags: [], freeTags: [], linkedQuestionId: null };
  } else {
    const note = loadNotes().find((n) => n.id === noteId);
    if (!note) return;
    state.editingNote = {
      ...note,
      subjectTags: note.subjectTags.slice(),
      freeTags: note.freeTags.slice(),
    };
  }
  renderNoteEditor();
  showScreen("screen-note-edit");
}

function openNoteEditorFromQuestion(q) {
  state.editingNote = {
    id: null,
    title: `${q.year} ${shortSubjectName(q.subject)} 第${q.question_number}問のメモ`,
    body: buildQuoteFromQuestion(q) + "\n\n【自分のコメント】\n",
    subjectTags: tagsForSubject(q.subject),
    freeTags: [],
    linkedQuestionId: q.id,
  };
  renderNoteEditor();
  showScreen("screen-note-edit");
}

function saveCurrentNote() {
  const note = state.editingNote;
  note.title = els.noteEditTitle.value.trim() || "無題のノート";
  note.body = els.noteEditBody.value;
  if (!note.id) note.id = genNoteId();
  upsertNote(note);
  state.editingNote = null;
  showScreen("screen-notes");
  renderNotesList();
}

function deleteCurrentNote() {
  if (!state.editingNote || !state.editingNote.id) return;
  if (!confirm("このノートを削除します。よろしいですか？")) return;
  deleteNoteById(state.editingNote.id);
  state.editingNote = null;
  showScreen("screen-notes");
  renderNotesList();
}

// ---------- rendering: analysis ----------

function renderWeakRanking(year) {
  const history = loadHistory();
  const ranked = questionsForYear(year)
    .map((q) => ({ q, incorrect: (history[String(q.id)] && history[String(q.id)].incorrect) || 0 }))
    .filter((r) => r.incorrect > 0)
    .sort((a, b) => b.incorrect - a.incorrect)
    .slice(0, 15);

  els.weakRankingList.innerHTML = "";
  if (ranked.length === 0) {
    els.weakRankingList.innerHTML = `<p class="empty-note">まだ間違えた問題がありません。</p>`;
    return;
  }
  ranked.forEach((r, i) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "weak-rank-item";
    row.innerHTML = `
      <span class="weak-rank-num">${i + 1}</span>
      <span class="weak-rank-body">
        <span class="weak-rank-meta">${r.q.year} ${shortSubjectName(r.q.subject)} 第${r.q.question_number}問</span>
        <span class="weak-rank-text">${escapeHtml(truncate(r.q.question_text, 46))}</span>
      </span>
      <span class="weak-rank-count">✕${r.incorrect}</span>
    `;
    row.addEventListener("click", () =>
      startSession([r.q], `苦手問題: ${shortSubjectName(r.q.subject)} 第${r.q.question_number}問`)
    );
    els.weakRankingList.appendChild(row);
  });
}

function renderAnalysis() {
  renderYearChips(els.yearChipsAnalysis, state.analysisYear, (key) => {
    state.analysisYear = key;
    renderAnalysis();
  });

  const year = state.analysisYear;

  const subjLabels = state.subjects.map(shortSubjectName);
  const subjData = state.subjects.map((s) => {
    const st = subjectStatsFor(s, year);
    return st.attempted > 0 ? Math.round((st.correct / st.attempted) * 100) : 0;
  });

  if (typeof Chart !== "undefined") {
    if (charts.radar) charts.radar.destroy();
    charts.radar = new Chart(els.chartRadar, {
      type: "radar",
      data: {
        labels: subjLabels,
        datasets: [
          {
            label: "正答率(%)",
            data: subjData,
            backgroundColor: "rgba(13,148,136,0.25)",
            borderColor: "#0d9488",
            pointBackgroundColor: "#0d9488",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { r: { min: 0, max: 100, ticks: { stepSize: 20, showLabelBackdrop: false } } },
        plugins: { legend: { display: false } },
      },
    });

    const yearLabels = state.years;
    const yearData = state.years.map((y) => {
      const st = yearStats(y);
      return st.attempted > 0 ? Math.round((st.correct / st.attempted) * 100) : 0;
    });
    if (charts.yearBar) charts.yearBar.destroy();
    charts.yearBar = new Chart(els.chartYearBar, {
      type: "bar",
      data: {
        labels: yearLabels,
        datasets: [{ label: "正答率(%)", data: yearData, backgroundColor: "#14b8a6", borderRadius: 6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { min: 0, max: 100, ticks: { stepSize: 20 } } },
        plugins: { legend: { display: false } },
      },
    });

    const days = last7DaysCounts();
    if (charts.daily) charts.daily.destroy();
    charts.daily = new Chart(els.chartDaily, {
      type: "bar",
      data: {
        labels: days.map((d) => d.label),
        datasets: [{ label: "解答数", data: days.map((d) => d.count), backgroundColor: "#5eead4", borderRadius: 6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        plugins: { legend: { display: false } },
      },
    });
  }

  renderWeakRanking(year);

  const weak = computeWeakSubjects(year);
  els.btnWeakSubjects.disabled = weak.length === 0;
  els.btnWeakSubjects.style.opacity = weak.length === 0 ? 0.5 : 1;
  els.btnWeakSubjects.dataset.weakSubjects = JSON.stringify(weak);
}

function startWeakSubjectsSession() {
  const weak = computeWeakSubjects(state.analysisYear);
  if (weak.length === 0) return;
  const qs = questionsForYear(state.analysisYear).filter((q) => weak.includes(q.subject));
  startSession(qs, `苦手科目集中: ${weak.map(shortSubjectName).join("・")}`);
}

// ---------- export / import ----------

function exportData() {
  const payload = { app: "srquiz", version: 1, exportedAt: new Date().toISOString(), data: {} };
  for (const key of APP_STORAGE_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      try {
        payload.data[key] = JSON.parse(raw);
      } catch {
        // 壊れた値はスキップ
      }
    }
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `srquiz-backup-${dateKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importDataFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch {
      alert("ファイルの読み込みに失敗しました。正しいバックアップファイルか確認してください。");
      return;
    }
    if (!parsed || typeof parsed.data !== "object" || parsed.data === null) {
      alert("バックアップファイルの形式が正しくありません。");
      return;
    }
    if (!confirm("現在の学習履歴・ノートを上書きしてインポートします。よろしいですか？")) return;
    for (const key of APP_STORAGE_KEYS) {
      if (key in parsed.data) {
        localStorage.setItem(key, JSON.stringify(parsed.data[key]));
      }
    }
    alert("インポートが完了しました。アプリを再読み込みします。");
    window.location.reload();
  };
  reader.onerror = () => {
    alert("ファイルの読み込みに失敗しました。");
  };
  reader.readAsText(file);
}

// ---------- init ----------

function cacheEls() {
  const ids = [
    "btnBack",
    "headerTitle",
    "btnHeaderStats",
    "btnHeaderSettings",
    "searchInput",
    "btnSearchClear",
    "searchResults",
    "searchResultsCount",
    "searchQuestionList",
    "searchNoteList",
    "searchNormalContent",
    "btnGoNotes",
    "btnGoAnalysis",
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
    "btnAddToNote",
    "btnNextFromSheet",
    "sessionScore",
    "sessionScoreRate",
    "sessionBreakdown",
    "btnRetryWrong",
    "btnBackHome",
    "statsOverall",
    "statsBySubject",
    "btnResetHistory",
    "btnNewNote",
    "noteFilterChips",
    "notesList",
    "noteEditHeading",
    "noteLinkedQuestion",
    "btnGoToLinkedQuestion",
    "noteEditTitle",
    "noteSubjectTags",
    "noteFreeTagList",
    "noteFreeTagInput",
    "noteEditBody",
    "btnSaveNote",
    "btnDeleteNote",
    "yearChipsAnalysis",
    "chartRadar",
    "chartYearBar",
    "chartDaily",
    "btnWeakSubjects",
    "weakRankingList",
    "btnExportData",
    "importFileInput",
    "updateToast",
    "btnUpdateNow",
    "btnDismissUpdate",
  ];
  for (const id of ids) els[id] = document.getElementById(id);
}

function bindEvents() {
  els.btnBack.addEventListener("click", () => {
    const current = document.querySelector(".screen.active");
    if (current && current.id === "screen-note-edit") {
      state.editingNote = null;
      showScreen("screen-notes");
      return;
    }
    showScreen("screen-home");
  });
  els.btnHeaderStats.addEventListener("click", () => {
    renderStats();
    showScreen("screen-stats");
  });
  els.btnHeaderSettings.addEventListener("click", () => showScreen("screen-settings"));

  // 検索
  let searchDebounceId = null;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceId);
    const value = els.searchInput.value;
    searchDebounceId = setTimeout(() => renderSearchResults(value), 150);
  });
  els.btnSearchClear.addEventListener("click", () => {
    els.searchInput.value = "";
    renderSearchResults("");
    els.searchInput.focus();
  });

  // ホーム
  els.btnGoNotes.addEventListener("click", () => {
    renderNotesList();
    showScreen("screen-notes");
  });
  els.btnGoAnalysis.addEventListener("click", () => {
    renderAnalysis();
    showScreen("screen-analysis");
  });
  els.btnRandomAll.addEventListener("click", () => {
    const yearLabel = state.selectedYear === "ALL" ? "全年度" : state.selectedYear;
    startSession(filteredQuestions(), `ランダム出題（${yearLabel}）`);
  });
  els.btnReview.addEventListener("click", () => startSession(getWrongQuestions(), "復習モード"));

  // クイズ
  els.btnNext.addEventListener("click", nextQuestion);
  els.btnNextFromSheet.addEventListener("click", nextQuestion);
  els.btnShowExplanation.addEventListener("click", openSheet);
  els.btnCloseSheet.addEventListener("click", closeSheet);
  els.sheetBackdrop.addEventListener("click", closeSheet);
  els.btnAddToNote.addEventListener("click", () => {
    const q = currentQuestion();
    if (!q) return;
    // 説明シート(オーバーレイ)を閉じてから遷移しないと、シートが
    // ノート編集画面の上に残ったままになり操作をブロックしてしまう。
    closeSheet();
    openNoteEditorFromQuestion(q);
  });
  els.btnBackHome.addEventListener("click", () => {
    state.session = null;
    renderHome();
    showScreen("screen-home");
  });
  els.btnRetryWrong.addEventListener("click", retryWrongFromSession);

  // 成績
  els.btnResetHistory.addEventListener("click", resetHistory);

  // ノート
  els.btnNewNote.addEventListener("click", () => openNoteEditor(null));
  els.btnSaveNote.addEventListener("click", saveCurrentNote);
  els.btnDeleteNote.addEventListener("click", deleteCurrentNote);
  els.btnGoToLinkedQuestion.addEventListener("click", () => {
    const linked = state.editingNote && state.editingNote.linkedQuestionId
      ? state.questions.find((q) => q.id === state.editingNote.linkedQuestionId)
      : null;
    if (linked) {
      state.editingNote = null;
      startSession([linked], `${shortSubjectName(linked.subject)} 第${linked.question_number}問`);
    }
  });
  els.noteFreeTagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = els.noteFreeTagInput.value.trim().replace(/,$/, "");
      if (val && !state.editingNote.freeTags.includes(val)) {
        state.editingNote.freeTags.push(val);
        renderNoteFreeTags();
      }
      els.noteFreeTagInput.value = "";
    }
  });

  // 分析
  els.btnWeakSubjects.addEventListener("click", startWeakSubjectsSession);

  // 設定
  els.btnExportData.addEventListener("click", exportData);
  els.importFileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importDataFromFile(file);
    e.target.value = "";
  });

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

  // questions.json の取得成否に関わらず、SW登録/更新検知は必ず行う。
  // (取得を先に待つ構造だと、通信が不安定な瞬間に開いた場合にSW登録自体が
  // スキップされ、アプリの更新が永久に検知されなくなる不具合があった。)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => watchForServiceWorkerUpdate(registration))
      .catch(() => {});
  }

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
}

init();
