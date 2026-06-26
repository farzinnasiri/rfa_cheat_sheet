/* global window, document, localStorage, MathJax */
(function () {
  "use strict";

  // ═══════════════════════════════════════════════════
  //  DATA HELPERS
  // ═══════════════════════════════════════════════════

  var DATA = window.RFA_DATA;
  var ALL_QUESTIONS = DATA.questions;

  // ═══════════════════════════════════════════════════
  //  LEGACY MARKDOWN → HTML  (ported from site.js)
  //  Some answer bodies contain **bold**, *italic*, and
  //  markdown lists that were post-processed by site.js.
  //  We replicate that logic here so the new app renders
  //  them correctly wherever answer HTML is injected.
  // ═══════════════════════════════════════════════════

  var MD_BLOCK_PAT = /(^|\n)\s*(?:\d+\.|-)\s+|(?:^|\s)\d+\.\s+\*\*|\*\*/;

  function escHtml(v) {
    return v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function renderInlineMd(value) {
    var segs = [];
    // Protect math spans from escaping / star-replacement
    var prot = value.replace(/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, function (m) {
      var tok = "\x00MATH" + segs.length + "\x00";
      segs.push(m);
      return tok;
    });
    return escHtml(prot)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/g,   "<em>$1</em>")
      .replace(/\x00MATH(\d+)\x00/g, function (_, i) { return escHtml(segs[Number(i)]); });
  }

  function splitMdLines(value) {
    return value
      .replace(/\s+(\d+\.\s+\*\*)/g, "\n$1")
      .replace(/\s+(-\s+\*\*)/g, "\n$1")
      .split(/\n+/)
      .map(function (l) { return l.trim(); })
      .filter(Boolean);
  }

  function renderMdBlock(value) {
    var frag = document.createDocumentFragment();
    var ol = null, ul = null, curLi = null;

    splitMdLines(value).forEach(function (line) {
      var om = line.match(/^(\d+)\.\s+(.+)$/);
      var um = line.match(/^-\s+(.+)$/);

      if (om) {
        ul = null;
        if (!ol) { ol = document.createElement("ol"); ol.start = Number(om[1]); frag.appendChild(ol); }
        curLi = document.createElement("li");
        curLi.innerHTML = renderInlineMd(om[2]);
        ol.appendChild(curLi);
        return;
      }
      if (um) {
        var parent = curLi || frag;
        if (!ul || ul.parentNode !== parent) { ul = document.createElement("ul"); parent.appendChild(ul); }
        var li = document.createElement("li");
        li.innerHTML = renderInlineMd(um[1]);
        ul.appendChild(li);
        return;
      }
      ol = null; ul = null; curLi = null;
      var p = document.createElement("p");
      p.innerHTML = renderInlineMd(line);
      frag.appendChild(p);
    });

    return frag;
  }

  function normalizeParagraph(p) {
    if (p.children.length > 0 || !MD_BLOCK_PAT.test(p.textContent)) return;
    var frag = renderMdBlock(p.textContent);
    if (frag.childNodes.length) p.replaceWith(frag);
  }

  function normalizeLooseText(answerBody) {
    var walker = document.createTreeWalker(answerBody, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.textContent.trim() || !MD_BLOCK_PAT.test(node.textContent)) return NodeFilter.FILTER_REJECT;
        if (node.parentElement && node.parentElement.closest("mjx-container,script,style,.formula")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) { node.replaceWith(renderMdBlock(node.textContent)); });
  }

  // Call this on any DOM element that contains .answer-body nodes
  // (or IS an answer-body itself) right after injecting innerHTML.
  function normalizeAnswerBodies(root) {
    var bodies = root.classList && root.classList.contains("answer-body")
      ? [root]
      : Array.from(root.querySelectorAll(".answer-body"));
    bodies.forEach(function (body) {
      normalizeLooseText(body);
      body.querySelectorAll("p").forEach(normalizeParagraph);
    });
  }


  function getQuestions(subject, priority, proof) {
    return ALL_QUESTIONS.filter(function (q) {
      if (q.subject !== subject) return false;
      if (priority !== "all" && q.priority !== priority) return false;
      if (proof === "true" && !q.isProof) return false;
      return true;
    });
  }

  function chaptersForSubject(subject) {
    return subject === "measure"
      ? DATA.meta.measureChapters
      : DATA.meta.functionalChapters;
  }

  function getQuestionsInChapter(chapter, subject, priority, proof) {
    return getQuestions(subject, priority, proof).filter(function (q) {
      return q.chapter === chapter;
    });
  }

  // ═══════════════════════════════════════════════════
  //  LOCAL STORAGE — CONFIDENCE
  // ═══════════════════════════════════════════════════

  const CONF_KEY = "rfa-confidence-v1";

  function loadConfidence() {
    try {
      return JSON.parse(localStorage.getItem(CONF_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function saveConfidence(conf) {
    try {
      localStorage.setItem(CONF_KEY, JSON.stringify(conf));
    } catch (_) {}
  }

  function setScore(id, score) {
    var conf = loadConfidence();
    conf[id] = { score: score, ts: Date.now() };
    saveConfidence(conf);
  }

  function getScore(id) {
    var conf = loadConfidence();
    return (conf[id] && conf[id].score) || 0;
  }

  // ═══════════════════════════════════════════════════
  //  THEME
  // ═══════════════════════════════════════════════════

  var root = document.documentElement;

  function applyTheme(theme, persist) {
    root.classList.add("theme-switching");
    root.dataset.theme = theme;
    if (persist) {
      try { localStorage.setItem("rfa-theme", theme); } catch (_) {}
    }
    document.querySelectorAll("[data-theme-choice]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.dataset.themeChoice === theme));
    });
    requestAnimationFrame(function () {
      root.classList.remove("theme-switching");
    });
  }

  function initTheme() {
    var stored = localStorage.getItem("rfa-theme");
    var sys    = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    applyTheme((stored === "dark" || stored === "light") ? stored : sys, false);
    document.querySelectorAll("[data-theme-choice]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyTheme(btn.dataset.themeChoice, true);
      });
    });
  }

  // ═══════════════════════════════════════════════════
  //  MATHJAX
  // ═══════════════════════════════════════════════════

  var mathTypesetted = new Set();

  function typeset(el) {
    if (!el) return;
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([el]).catch(function () {});
    }
  }

  // ═══════════════════════════════════════════════════
  //  STATE
  // ═══════════════════════════════════════════════════

  var state = {
    view:    "home",
    subject: "measure",
    filter:  { subject: "measure", priority: "all", proof: "all" },

    // Practice
    queue:       [],
    queueIndex:  0,
    revealLevel: 0,        // 0=hidden, 1=strategy, 2=keysteps, 3=full
    timerInterval: null,
    timerSeconds:  0,
    sessionScores: [],     // [{id, scoreBefore, scoreAfter}]
    recallStarted: false,

    // Chapter picker
    pickerSubject: "measure",
    pickerMode:    "chapter",

    // Mock exam
    mockSet: "theory",
    mockQuestions: [],
    mockRevealed:  false,
    mockExerciseIndex: 0,
  };

  // ═══════════════════════════════════════════════════
  //  VIEWS
  // ═══════════════════════════════════════════════════

  var views = ["home", "chapter-picker", "practice", "browse", "mock", "summary"];

  function showView(name) {
    state.view = name;
    views.forEach(function (v) {
      var el = document.getElementById("view-" + v);
      if (el) el.hidden = (v !== name);
    });

    var btnBack       = document.getElementById("btn-back");
    var topbarFilters = document.getElementById("topbar-filters");
    var sessionBar    = document.getElementById("session-bar");
    var topbarTitle   = document.getElementById("topbar-title");
    var topbarCenter  = document.getElementById("topbar-center");

    topbarCenter.innerHTML = "";

    switch (name) {
      case "home":
        btnBack.hidden       = true;
        topbarFilters.hidden = true;
        sessionBar.hidden    = true;
        topbarTitle.textContent = "Exam Trainer";
        break;

      case "chapter-picker":
        btnBack.hidden       = false;
        topbarFilters.hidden = true;
        sessionBar.hidden    = true;
        topbarTitle.textContent = "Chapter Review";
        break;

      case "practice":
        btnBack.hidden       = false;
        topbarFilters.hidden = true;
        sessionBar.hidden    = false;
        break;

      case "browse":
        btnBack.hidden       = false;
        topbarFilters.hidden = false;
        sessionBar.hidden    = true;
        topbarTitle.textContent = "Browse Questions";
        break;

      case "mock":
        btnBack.hidden       = false;
        topbarFilters.hidden = true;
        sessionBar.hidden    = true;
        topbarTitle.textContent = "Mock Exam";
        break;

      case "summary":
        btnBack.hidden       = false;
        topbarFilters.hidden = true;
        sessionBar.hidden    = true;
        topbarTitle.textContent = "Session Summary";
        break;
    }
  }

  // ═══════════════════════════════════════════════════
  //  HOME VIEW
  // ═══════════════════════════════════════════════════

  function getStats(subject) {
    var conf  = loadConfidence();
    var qs    = ALL_QUESTIONS.filter(function (q) { return q.subject === subject; });
    var total = qs.length;
    var blank = 0, partial = 0, mastered = 0, unseen = 0;

    qs.forEach(function (q) {
      var s = (conf[q.id] && conf[q.id].score) || 0;
      if (s === 0) unseen++;
      else if (s === 1) blank++;
      else if (s === 2) partial++;
      else mastered++;
    });

    return { total: total, blank: blank, partial: partial, mastered: mastered, unseen: unseen };
  }

  function renderHome() {
    var statsEl    = document.getElementById("home-stats");
    var weakDescEl = document.getElementById("mode-weak-desc");

    var ms = getStats("measure");
    var fs = getStats("functional");

    function statBlockHtml(label, s) {
      var gotitPct   = Math.round((s.mastered / s.total) * 100);
      var partialPct = Math.round((s.partial  / s.total) * 100);
      var blankPct   = Math.round((s.blank    / s.total) * 100);

      return '<div class="stat-block">'
        + '<div class="stat-top">'
        + '<span class="stat-label">' + label + '</span>'
        + '<span class="stat-fraction">' + s.mastered + ' / ' + s.total + ' mastered</span>'
        + '</div>'
        + '<div class="stat-bar">'
        + '<div class="stat-bar-fill gotit"   style="width:' + gotitPct   + '%"></div>'
        + '<div class="stat-bar-fill partial" style="width:' + partialPct + '%"></div>'
        + '<div class="stat-bar-fill blank"   style="width:' + blankPct   + '%"></div>'
        + '</div>'
        + '<div class="stat-legend">'
        + '<span><span class="stat-legend-dot" style="background:var(--c-gotit)"></span>' + s.mastered + ' mastered</span>'
        + '<span><span class="stat-legend-dot" style="background:var(--c-partial)"></span>' + s.partial + ' partial</span>'
        + '<span><span class="stat-legend-dot" style="background:var(--c-blank)"></span>' + s.blank + ' struggling</span>'
        + '<span><span class="stat-legend-dot" style="background:var(--line)"></span>' + s.unseen + ' unseen</span>'
        + '</div></div>';
    }

    statsEl.innerHTML = statBlockHtml("Real Analysis", ms) + statBlockHtml("Functional Analysis", fs);

    // Update weak spots count
    var weakCount = ALL_QUESTIONS.filter(function (q) {
      var sc = getScore(q.id);
      return sc === 0 || sc === 1;
    }).length;
    weakDescEl.textContent = weakCount > 0
      ? weakCount + " question" + (weakCount === 1 ? "" : "s") + " need attention"
      : "All questions practiced!";
  }

  // ═══════════════════════════════════════════════════
  //  CHAPTER PICKER
  // ═══════════════════════════════════════════════════

  function renderChapterPicker(mode) {
    state.pickerMode    = mode;
    state.pickerSubject = state.subject;

    var list = document.getElementById("chapter-list");

    function buildList(subject) {
      state.pickerSubject = subject;
      document.getElementById("picker-tab-measure")   .setAttribute("aria-pressed", String(subject === "measure"));
      document.getElementById("picker-tab-functional").setAttribute("aria-pressed", String(subject === "functional"));

      var chapters = chaptersForSubject(subject);
      var conf     = loadConfidence();

      list.innerHTML = "";
      chapters.forEach(function (chapter) {
        var qs      = ALL_QUESTIONS.filter(function (q) { return q.subject === subject && q.chapter === chapter; });
        var mastered = qs.filter(function (q) { return ((conf[q.id] && conf[q.id].score) || 0) === 3; }).length;
        var pct      = qs.length > 0 ? Math.round((mastered / qs.length) * 100) : 0;

        // Strip chapter number prefix for display
        var displayName = chapter.replace(/^\d+\.\s*/, "");

        var btn = document.createElement("button");
        btn.className = "chapter-btn";
        btn.innerHTML =
          '<span class="chapter-btn-name">' + displayName + '</span>'
          + '<span class="chapter-btn-count">' + qs.length + ' questions</span>'
          + '<div class="chapter-btn-bar"><div class="chapter-btn-bar-fill" style="width:' + pct + '%"></div></div>';

        btn.addEventListener("click", function () {
          startPracticeSession("chapter", subject, "all", "all", chapter);
        });

        list.appendChild(btn);
      });
    }

    buildList(state.pickerSubject);

    document.getElementById("picker-tab-measure")   .addEventListener("click", function () { buildList("measure"); });
    document.getElementById("picker-tab-functional").addEventListener("click", function () { buildList("functional"); });

    showView("chapter-picker");
  }

  // ═══════════════════════════════════════════════════
  //  QUEUE BUILDING
  // ═══════════════════════════════════════════════════

  function buildQueue(mode, subject, priority, proof, chapter) {
    var pool;

    switch (mode) {
      case "weak":
        // All subjects, filter by priority/proof, scored 0 or 1 first, then 2
        pool = ALL_QUESTIONS.filter(function (q) {
          if (priority !== "all" && q.priority !== priority) return false;
          if (proof === "true" && !q.isProof) return false;
          return true;
        });
        pool.sort(function (a, b) {
          var sa = getScore(a.id), sb = getScore(b.id);
          // 1 (blank) first, then 0 (unseen), then 2 (partial), skip 3
          var order = function (s) { return s === 1 ? 0 : s === 0 ? 1 : s === 2 ? 2 : 99; };
          return order(sa) - order(sb);
        });
        pool = pool.filter(function (q) { return getScore(q.id) < 3; });
        pool = pool.slice(0, 20); // cap session at 20
        break;

      case "chapter":
        pool = getQuestionsInChapter(chapter, subject, priority, proof);
        break;

      case "random":
        pool = getQuestions(subject, priority, proof);
        // Pick one weighted toward low-confidence
        var weighted = [];
        pool.forEach(function (q) {
          var s = getScore(q.id);
          var weight = s === 0 ? 3 : s === 1 ? 4 : s === 2 ? 2 : 1;
          for (var i = 0; i < weight; i++) weighted.push(q);
        });
        var picked = weighted[Math.floor(Math.random() * weighted.length)];
        pool = picked ? [picked] : pool.slice(0, 1);
        break;

      default:
        pool = getQuestions(subject, priority, proof);
    }

    return pool;
  }

  // ═══════════════════════════════════════════════════
  //  PRACTICE SESSION
  // ═══════════════════════════════════════════════════

  function startPracticeSession(mode, subject, priority, proof, chapter) {
    var queue = buildQueue(mode, subject, priority, proof, chapter);
    if (!queue.length) {
      alert("No questions match the current filters. Try changing subject or filters.");
      return;
    }

    state.queue       = queue;
    state.queueIndex  = 0;
    state.sessionScores = [];

    showView("practice");
    loadQuestion(0);
  }

  function loadQuestion(index) {
    var q = state.queue[index];
    if (!q) return;

    stopTimer();

    state.queueIndex  = index;
    state.revealLevel = 0;
    state.recallStarted = false;

    // Update session progress bar
    var pct = state.queue.length > 1
      ? Math.round((index / (state.queue.length - 1)) * 100)
      : 0;
    document.getElementById("session-bar-fill").style.width = pct + "%";

    // Topbar title
    document.getElementById("topbar-title").textContent =
      (q.subject === "measure" ? "Real Analysis" : "Functional Analysis");

    // Nav counter
    document.getElementById("nav-counter").textContent =
      (index + 1) + " / " + state.queue.length;

    // Prev/next buttons
    document.getElementById("btn-prev-q").disabled = index === 0;
    document.getElementById("btn-next-q").disabled = index === state.queue.length - 1;
    document.getElementById("btn-next-q").textContent = "";
    document.getElementById("btn-next-q").innerHTML =
      (index === state.queue.length - 1 ? "Finish" : "Next")
      + ' <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

    // Paper meta
    var chapterDisplay = q.chapter.replace(/^\d+\.\s*/, "");
    document.getElementById("paper-meta").innerHTML =
      "<strong>Q" + (index + 1) + "</strong> · " + chapterDisplay;

    // Tags
    var tagsEl  = document.getElementById("paper-tags");
    var bankRef = q.bankRef || "";
    tagsEl.innerHTML =
      '<span class="tag tag-stars">' + q.priority + '</span>'
      + (q.isProof
        ? '<span class="tag tag-proof">Proof</span>'
        : '<span class="tag tag-noProof">No proof</span>')
      + (bankRef ? '<span class="tag" title="' + (q.bankRefFull || bankRef) + '" style="cursor:help">' + bankRef + '</span>' : "");

    // Question text
    document.getElementById("paper-question").innerHTML = q.questionHtml;

    // Confidence border
    var paper = document.getElementById("exam-paper");
    var sc    = getScore(q.id);
    paper.dataset.confidence = sc;

    // Blank lines — show 6 lines
    document.getElementById("paper-blank").hidden = false;

    // Reset panels
    document.getElementById("recall-cta")   .hidden = false;
    document.getElementById("answer-panel") .hidden = true;
    document.getElementById("layer-strategy").hidden = true;
    document.getElementById("layer-keysteps").hidden = true;
    document.getElementById("layer-full")    .hidden = true;
    document.getElementById("assessment")    .hidden = true;
    document.getElementById("strategy-content").innerHTML = "";
    document.getElementById("keysteps-content").innerHTML = "";
    document.getElementById("full-content")    .innerHTML = "";

    // Reset assessment buttons
    document.querySelectorAll(".btn-assess").forEach(function (b) {
      b.classList.remove("selected");
    });

    // Show/hide reveal buttons based on available content
    var hasStrategy = Boolean(q.strategyHtml && q.strategyHtml.trim());
    var hasKeySteps = Boolean(q.keyStepsHtml && q.keyStepsHtml.trim());
    document.getElementById("btn-reveal-strategy").hidden = !hasStrategy;
    document.getElementById("btn-reveal-keysteps").hidden = !hasKeySteps;
    document.getElementById("btn-reveal-full").hidden     = false;

    // Typeset the question
    typeset(document.getElementById("exam-paper"));
  }

  // ── Timer ──

  function startTimer() {
    state.timerSeconds = 0;
    document.getElementById("timer-display").textContent = "0:00";
    state.timerInterval = setInterval(function () {
      state.timerSeconds++;
      var m = Math.floor(state.timerSeconds / 60);
      var s = state.timerSeconds % 60;
      document.getElementById("timer-display").textContent =
        m + ":" + (s < 10 ? "0" : "") + s;
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  // ── Recall ──

  function startRecall() {
    state.recallStarted = true;
    document.getElementById("recall-cta")  .hidden = true;
    document.getElementById("answer-panel").hidden = false;
    startTimer();
  }

  // ── Reveal layers ──

  function revealLayer(level) {
    var q = state.queue[state.queueIndex];
    if (!q) return;

    stopTimer();
    state.revealLevel = Math.max(state.revealLevel, level);

    if (level >= 1 && q.strategyHtml && q.strategyHtml.trim()) {
      document.getElementById("strategy-content").innerHTML = q.strategyHtml;
      document.getElementById("layer-strategy").hidden = false;
      typeset(document.getElementById("layer-strategy"));
    }
    if (level >= 2 && q.keyStepsHtml && q.keyStepsHtml.trim()) {
      document.getElementById("keysteps-content").innerHTML = q.keyStepsHtml;
      document.getElementById("layer-keysteps").hidden = false;
      typeset(document.getElementById("layer-keysteps"));
    }
    if (level >= 3) {
      var fullEl = document.getElementById("full-content");
      fullEl.innerHTML = q.answerHtml;
      normalizeAnswerBodies(fullEl);
      document.getElementById("layer-full").hidden = false;
      document.getElementById("paper-blank").hidden = true;
      typeset(document.getElementById("layer-full"));
    }

    // Show assessment after ANY reveal
    document.getElementById("assessment").hidden = false;

    // Pre-select previously stored score
    var existingScore = getScore(q.id);
    if (existingScore > 0) {
      document.querySelectorAll(".btn-assess").forEach(function (b) {
        b.classList.toggle("selected", Number(b.dataset.score) === existingScore);
      });
    }

    // Scroll to reveal area smoothly
    document.getElementById("answer-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ── Save score ──

  function saveScore(score) {
    var q = state.queue[state.queueIndex];
    if (!q) return;

    var scoreBefore = getScore(q.id);
    setScore(q.id, score);

    // Update border
    document.getElementById("exam-paper").dataset.confidence = score;

    // Track session
    var existing = state.sessionScores.findIndex(function (s) { return s.id === q.id; });
    var entry    = { id: q.id, questionHtml: q.questionHtml, scoreBefore: scoreBefore, scoreAfter: score };
    if (existing >= 0) state.sessionScores[existing] = entry;
    else               state.sessionScores.push(entry);

    // Highlight selected button
    document.querySelectorAll(".btn-assess").forEach(function (b) {
      b.classList.toggle("selected", Number(b.dataset.score) === score);
    });
  }

  // ── Navigation ──

  function goToQuestion(index) {
    if (index < 0 || index >= state.queue.length) {
      if (index >= state.queue.length) endSession();
      return;
    }
    loadQuestion(index);
  }

  function endSession() {
    stopTimer();
    renderSummary();
    showView("summary");
  }

  // ═══════════════════════════════════════════════════
  //  BROWSE VIEW
  // ═══════════════════════════════════════════════════

  function renderBrowse() {
    var inner  = document.getElementById("browse-inner");
    var conf   = loadConfidence();

    // Mobile filter strip
    var mobileStrip =
      '<div class="browse-filter-strip">'
      + '<div class="btn-group" role="group" aria-label="Subject">'
      + '<button type="button" data-browse-subject="measure"    aria-pressed="true">Real</button>'
      + '<button type="button" data-browse-subject="functional" aria-pressed="false">Functional</button>'
      + '</div>'
      + '<div class="btn-group" role="group" aria-label="Priority">'
      + '<button type="button" data-browse-priority="all" aria-pressed="true">All</button>'
      + '<button type="button" data-browse-priority="★★★" aria-pressed="false">★★★</button>'
      + '<button type="button" data-browse-priority="★★"  aria-pressed="false">★★</button>'
      + '<button type="button" data-browse-priority="★"   aria-pressed="false">★</button>'
      + '</div>'
      + '<div class="btn-group" role="group" aria-label="Type">'
      + '<button type="button" data-browse-proof="all"  aria-pressed="true">Any</button>'
      + '<button type="button" data-browse-proof="true" aria-pressed="false">Proofs</button>'
      + '</div>'
      + '</div>';

    // Build all questions as details elements
    var questionHtml = "";

    ALL_QUESTIONS.forEach(function (q) {
      var sc       = (conf[q.id] && conf[q.id].score) || 0;
      var chapter  = q.chapter;
      var key      = q.subject + "::" + chapter;
      var bankRef  = q.bankRef || "";
      var bankTitle = q.bankRefFull || bankRef;

      questionHtml +=
        '<div class="browse-question" data-q-id="' + q.id + '"'
        + ' data-q-subject="'  + q.subject + '"'
        + ' data-q-priority="' + q.priority + '"'
        + ' data-q-proof="'    + q.isProof + '"'
        + ' data-q-chapter="'  + chapter.replace(/"/g, "&quot;") + '"'
        + ' data-q-key="'      + key.replace(/"/g, "&quot;") + '">'

        + '<div class="browse-dot" data-score="' + sc + '"></div>'

        + '<details class="browse-details">'
        + '<summary class="browse-summary">'
        + '<span class="browse-summary-text">' + q.questionHtml + '</span>'
        + '<span class="browse-tags">'
        + '<span class="browse-tag">' + q.priority + '</span>'
        + (q.isProof ? '<span class="browse-tag proof">Proof</span>' : '')
        + (bankRef   ? '<span class="browse-tag" title="' + bankTitle + '">' + bankRef + '</span>' : '')
        + '</span>'
        + '</summary>'
        + '<div class="browse-answer answer-body">' + q.answerHtml + '</div>'
        + '</details>'
        + '</div>';
    });

    // Build chapter headings with question blocks nested
    var allChapters = DATA.meta.measureChapters.map(function (chapter) {
      return { subject: "measure", chapter: chapter };
    }).concat(DATA.meta.functionalChapters.map(function (chapter) {
      return { subject: "functional", chapter: chapter };
    }));
    var chapterHtml = "";

    allChapters.forEach(function (entry) {
      var chapter = entry.chapter;
      var key = entry.subject + "::" + chapter;
      var displayName = chapter.replace(/^\d+\.\s*/, "");
      chapterHtml +=
        '<div class="browse-chapter-heading" data-subject="' + entry.subject + '" data-chapter="' + chapter.replace(/"/g, "&quot;") + '" data-chapter-key="' + key.replace(/"/g, "&quot;") + '">'
        + '<span class="browse-chapter-title">' + displayName + '</span>'
        + '<span class="browse-chapter-count"></span>'
        + '</div>';
    });

    inner.innerHTML = mobileStrip + chapterHtml + questionHtml;

    // Re-order: inject questions directly after their chapter heading
    var headingMap = {};
    inner.querySelectorAll(".browse-chapter-heading").forEach(function (h) {
      headingMap[h.dataset.chapterKey] = h;
    });
    inner.querySelectorAll(".browse-question").forEach(function (el) {
      var key     = el.dataset.qKey;
      var heading = headingMap[key];
      if (heading) {
        heading.insertAdjacentElement("afterend", el);
        headingMap[key] = el;
      }
    });

    applyBrowseFilter();
    setupBrowseMobileFilters();

    // Normalize legacy markdown (**bold**, lists) in all answer bodies,
    // then typeset everything including question summaries and chapter headings.
    normalizeAnswerBodies(inner);
    typeset(inner);
  }

  function applyBrowseFilter() {
    var inner    = document.getElementById("browse-inner");
    var subject  = state.filter.subject  !== undefined ? state.filter.subject  : state.subject;
    var priority = state.filter.priority !== undefined ? state.filter.priority : "all";
    var proof    = state.filter.proof    !== undefined ? state.filter.proof    : "all";

    // Update topbar buttons to reflect state
    document.querySelectorAll("[data-filter-subject]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.filterSubject === subject));
    });
    document.querySelectorAll("[data-filter-priority]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.filterPriority === priority));
    });
    document.querySelectorAll("[data-filter-proof]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.filterProof === proof));
    });

    var conf = loadConfidence();

    inner.querySelectorAll(".browse-question").forEach(function (el) {
      var qSubject  = el.dataset.qSubject;
      var qPriority = el.dataset.qPriority;
      var qProof    = el.dataset.qProof;

      var visible =
        qSubject === subject &&
        (priority === "all" || qPriority === priority) &&
        (proof    === "all" || qProof    === proof);

      el.hidden = !visible;

      // Also refresh confidence dot
      var id  = el.dataset.qId;
      var sc  = (conf[id] && conf[id].score) || 0;
      var dot = el.querySelector(".browse-dot");
      if (dot) dot.dataset.score = sc;
    });

    // Show/hide chapter headings and update counts
    inner.querySelectorAll(".browse-chapter-heading").forEach(function (heading) {
      var key = heading.dataset.chapterKey;
      if (!key) return;
      var visible = Array.from(inner.querySelectorAll(".browse-question")).filter(function (el) {
        return el.dataset.qKey === key && !el.hidden;
      });
      heading.dataset.empty = String(visible.length === 0);
      var countEl = heading.querySelector(".browse-chapter-count");
      if (countEl) countEl.textContent = visible.length > 0 ? visible.length + " questions" : "";
    });
  }

  function setupBrowseMobileFilters() {
    var inner = document.getElementById("browse-inner");
    if (!inner) return;

    inner.querySelectorAll("[data-browse-subject]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.subject = btn.dataset.browseSubject;
        state.filter.subject = btn.dataset.browseSubject;
        inner.querySelectorAll("[data-browse-subject]").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b.dataset.browseSubject === state.subject));
        });
        applyBrowseFilter();
      });
    });
    inner.querySelectorAll("[data-browse-priority]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.filter.priority = btn.dataset.browsePriority;
        inner.querySelectorAll("[data-browse-priority]").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b.dataset.browsePriority === state.filter.priority));
        });
        applyBrowseFilter();
      });
    });
    inner.querySelectorAll("[data-browse-proof]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.filter.proof = btn.dataset.browseProof;
        inner.querySelectorAll("[data-browse-proof]").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b.dataset.browseProof === state.filter.proof));
        });
        applyBrowseFilter();
      });
    });
  }

  // ═══════════════════════════════════════════════════
  //  MOCK EXAM
  // ═══════════════════════════════════════════════════

  var PREDICTED_MOCK_EXAMS = [
    {
      title: "Predicted July 2026 Theory Mock 1",
      subtitle: "High-probability core: measurability, convergence relations, weak/weak-star",
      rationale: "Uses the strongest July candidates from the conditional model. It avoids exact June repeats and focuses on neighboring broad families instead.",
      questions: [
        {
          title: "Measurability and convergence relations",
          points: 7,
          predictionTag: "High probability - absent from 2026 theory",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>Write the definitions of measurable function, Borel measurable function, and Lebesgue measurable function.</li>
              <li>State equivalent level-set characterizations of measurability for real-valued functions.</li>
              <li>Let \(f,g\in M(X,\mathcal A)\). Prove that \(\{f\lt g\}\), \(\{f\le g\}\), and \(\{f=g\}\) are measurable.</li>
              <li>Let \((f_n)\subset M(X,\mathcal A)\). Prove that \(\sup_n f_n\), \(\inf_n f_n\), \(\limsup_n f_n\), and \(\liminf_n f_n\) are measurable.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>A map \(f:(X,\mathcal A)\to(Y,\mathcal B)\) is measurable if \(f^{-1}(B)\in\mathcal A\) for every \(B\in\mathcal B\). A real function is Borel measurable if inverse images of Borel sets are Borel; it is Lebesgue measurable if inverse images of Borel sets are Lebesgue measurable.</li>
              <li>For \(f:X\to\mathbb R\), measurability is equivalent to any of \(\{f\gt a\}\), \(\{f\ge a\}\), \(\{f\lt a\}\), \(\{f\le a\}\) being measurable for every \(a\in\mathbb R\). It is enough to test \(a\in\mathbb Q\).</li>
              <li>Since \(h=f-g\) is measurable,
                <div class="formula">\[
                \{f\lt g\}=\{h\lt0\},\quad \{f\le g\}=\{h\le0\},\quad \{f=g\}=\{h=0\},
                \]</div>
                and all three are inverse images of Borel sets.</li>
              <li>For \(u=\sup_nf_n\), \(\{u>a\}=\bigcup_n\{f_n>a\}\), so \(u\) is measurable. Then \(\inf_nf_n=-\sup_n(-f_n)\), and
                <div class="formula">\[
                \limsup_nf_n=\inf_k\sup_{n\ge k}f_n,\qquad
                \liminf_nf_n=\sup_k\inf_{n\ge k}f_n.
                \]</div>
                Countable suprema and infima preserve measurability.</li>
            </ol>`
        },
        {
          title: "Convergence in measure and counterexamples",
          points: 6,
          predictionTag: "High probability - July-seasonal convergence traps",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>Define pointwise convergence, almost everywhere convergence, convergence in measure, and \(L^1\) convergence.</li>
              <li>Assume \(\mu(X)\lt\infty\). Prove that a.e. convergence implies convergence in measure.</li>
              <li>Give a counterexample when \(\mu(X)=\infty\).</li>
              <li>Give a counterexample showing that convergence in measure does not imply a.e. convergence of the full sequence.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>The definitions are: \(f_n(x)\to f(x)\) pointwise for every \(x\); a.e. outside a null set; in measure if \(\mu(\{|f_n-f|>\varepsilon\})\to0\) for every \(\varepsilon>0\); in \(L^1\) if \(\int|f_n-f|\,d\mu\to0\).</li>
              <li>Let \(f_n\to f\) a.e. and fix \(\varepsilon\gt0\). Define \(E_n=\bigcup_{k\ge n}\{|f_k-f|\gt\varepsilon\}\). Then \(E_n\downarrow E\), where \(E\) is contained in the null set where convergence fails. Since \(\mu(E_1)\lt\infty\), continuity from above gives \(\mu(E_n)\to0\). Because \(\{|f_n-f|\gt\varepsilon\}\subset E_n\), convergence in measure follows.</li>
              <li>On \(\mathbb R\), \(f_n=\chi_{[n,n+1]}\) converges pointwise to \(0\), but \(\lambda(\{|f_n|\gt\varepsilon\})=1\) for \(0\lt\varepsilon\lt1\), so it does not converge in measure.</li>
              <li>The typewriter sequence on \([0,1]\) converges to \(0\) in measure because the interval lengths tend to \(0\), but every point belongs to infinitely many supports, so the full sequence has no a.e. limit.</li>
            </ol>`
        },
        {
          title: "Weak and weak-star convergence",
          points: 5,
          predictionTag: "High probability - broad weak-convergence family",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>Define weak convergence in a normed space and weak-star convergence in a dual space.</li>
              <li>Show that strong convergence implies weak convergence, and provide a counterexample to the converse.</li>
              <li>State Banach-Alaoglu.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>\(x_n\rightharpoonup x\) means \(L(x_n)\to L(x)\) for all \(L\in X^*\). In \(X^*\), \(L_n\overset{*}{\rightharpoonup}L\) means \(L_n(x)\to L(x)\) for all \(x\in X\).</li>
              <li>If \(\|x_n-x\|\to0\), then \(|L(x_n)-L(x)|\le\|L\|\|x_n-x\|\to0\). The converse fails in \(\ell^2\): \(e_n\rightharpoonup0\), but \(\|e_n\|_2=1\).</li>
              <li>Banach-Alaoglu: the closed unit ball of \(X^*\) is compact in the weak-star topology.</li>
            </ol>`
        }
      ]
    },
    {
      title: "Predicted July 2026 Theory Mock 2",
      subtitle: "Neighboring families: AC/W1,1, Hilbert solvability, Hahn-Banach",
      rationale: "This follows the model's advice to select neighboring topics rather than exact 2026 repeats. It targets AC/W1,1, Hilbert Fredholm/spectral material, and Hahn-Banach.",
      questions: [
        {
          title: "Absolutely continuous functions and \(W^{1,1}\)",
          points: 8,
          predictionTag: "Medium-high probability - family active, exact theory absent",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>Write the definitions of absolutely continuous function, weak derivative, and \(W^{1,p}\).</li>
              <li>State and prove the characterization of absolutely continuous functions in terms of the integration-by-parts formula.</li>
              <li>State the relation between \(W^{1,1}\) and \(AC\), and explain the role of representatives.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>Use the \(\varepsilon\)-\(\delta\) definition on finite disjoint intervals for AC. A weak derivative \(v\) satisfies \(\int u\varphi'=-\int v\varphi\) for all \(\varphi\in C_c^1\). \(W^{1,p}\) consists of \(L^p\) functions with weak derivative in \(L^p\).</li>
              <li>If \(u\) is AC, integration by parts gives the formula with \(v=u'\). Conversely, if the formula holds for some \(v\in L^1\), set \(w(x)=\int_a^xv(t)\,dt\). Then \(u-w\) has weak derivative \(0\), hence is constant a.e.; therefore \(u\) has an AC representative.</li>
              <li>In one dimension, every \(W^{1,1}\) equivalence class has a unique AC representative, and every AC function with derivative in \(L^1\) belongs to \(W^{1,1}\). The statement is about equivalence classes, not arbitrary pointwise versions.</li>
            </ol>`
        },
        {
          title: "Hilbert-space solvability and compact spectrum",
          points: 6,
          predictionTag: "Medium-high probability - July history, not Riesz exact repeat",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>State the Fredholm alternative for \(I-T\), where \(T\) is compact on a Hilbert space.</li>
              <li>Discuss solvability of \(u-Tu=f\).</li>
              <li>State the structure of the spectrum of a compact operator.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>For compact \(T:H\to H\), \(\ker(I-T)\) is finite-dimensional, \(\operatorname{Ran}(I-T)\) is closed, and \(\operatorname{Ran}(I-T)=\ker(I-T^*)^\perp\). Also \(I-T\) is injective iff it is surjective.</li>
              <li>The equation \(u-Tu=f\) is solvable iff \(f\perp\ker(I-T^*)\). If \(\ker(I-T)=\{0\}\), the solution exists and is unique for every \(f\).</li>
              <li>For compact \(T\) on an infinite-dimensional Banach space, \(0\in\sigma(T)\), all nonzero spectral values are eigenvalues of finite multiplicity, and the only possible accumulation point is \(0\).</li>
            </ol>`
        },
        {
          title: "Hahn-Banach corollaries and separation",
          points: 4,
          predictionTag: "Medium probability - absent from 2026 and good substitute for overused Banach principles",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>State the continuous extension form of Hahn-Banach.</li>
              <li>State two standard corollaries.</li>
              <li>Define separation and strict separation by a hyperplane.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>If \(Y\subset X\) and \(f\in Y^*\), there exists \(F\in X^*\) with \(F|_Y=f\) and \(\|F\|=\|f\|\).</li>
              <li>Corollaries: for \(x_0\ne0\), there exists \(L\in X^*\) with \(\|L\|=1\), \(L(x_0)=\|x_0\|\); and \(X^*\) separates points.</li>
              <li>A hyperplane \(\{L=\alpha\}\) separates \(A,B\) if \(L(a)\le\alpha\le L(b)\). It strictly separates them if there is a positive gap: \(L(a)\le\alpha-\varepsilon\lt\alpha+\varepsilon\le L(b)\).</li>
            </ol>`
        }
      ]
    },
    {
      title: "Predicted July 2026 Theory Mock 3",
      subtitle: "Pattern-break hedge: measurable traps, weak-star compactness, Fredholm spectrum",
      rationale: "This set reflects the negative 2026 validation: the frequency model can miss transitions, so this mock concentrates on the strongest non-2026 exact topics while still varying the question style.",
      questions: [
        {
          title: "Measurability traps and characteristic functions",
          points: 7,
          predictionTag: "High probability - top model topic with past July traps",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>Prove that \(A\in\mathcal A\) if and only if \(\chi_A\) is measurable.</li>
              <li>Prove or disprove: \(f\in M(X,\mathcal A)\) if and only if \(f^+,f^-\in M^+(X,\mathcal A)\).</li>
              <li>Prove or disprove: \(f\in M(X,\mathcal A)\) if and only if \(|f|\in M(X,\mathcal A)\).</li>
              <li>Let \((f_n)\subset M(X,\mathcal A)\). Prove that \(\limsup_n f_n\) and \(\liminf_n f_n\) are measurable.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>If \(A\in\mathcal A\), then \(\{\chi_A>1/2\}=A\) and all level sets are measurable. Conversely, if \(\chi_A\) is measurable, then \(A=\{\chi_A>1/2\}\in\mathcal A\).</li>
              <li>The statement with positive and negative parts is true. If \(f\) is measurable, then \(f^+=\max(f,0)\) and \(f^-=\max(-f,0)\) are measurable. Conversely, \(f=f^+-f^-\), so \(f\) is measurable.</li>
              <li>The statement with \(|f|\) is false in the reverse direction. If \(A\notin\mathcal A\), define \(f=\chi_A-\chi_{X\setminus A}\). Then \(|f|=1\) is measurable, but \(f^{-1}(\{1\})=A\) is not.</li>
              <li>Use
                <div class="formula">\[
                \limsup_n f_n=\inf_k\sup_{n\ge k} f_n,\qquad
                \liminf_n f_n=\sup_k\inf_{n\ge k} f_n.
                \]</div>
                Countable suprema and infima of measurable functions are measurable.</li>
            </ol>`
        },
        {
          title: "Weak-star compactness and subsequences",
          points: 6,
          predictionTag: "High probability - weak/weak-star family remains unspent in 2026",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>Define weak-star convergence in \(X^*\).</li>
              <li>State Banach-Alaoglu.</li>
              <li>Explain why, if \(X\) is separable, every bounded sequence in \(X^*\) has a weak-star convergent subsequence.</li>
              <li>State and prove the reflexive/separable corollary giving weakly convergent subsequences.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>\(L_n\overset{*}{\rightharpoonup}L\) in \(X^*\) means \(L_n(x)\to L(x)\) for every \(x\in X\).</li>
              <li>Banach-Alaoglu says the closed unit ball of \(X^*\) is compact for the weak-star topology \(\sigma(X^*,X)\).</li>
              <li>If \(X\) is separable, the weak-star topology is metrizable on bounded subsets of \(X^*\). Compactness plus metrizability gives sequential compactness, hence a weak-star convergent subsequence.</li>
              <li>If \(Y\) is reflexive and separable, a bounded sequence \((y_n)\subset Y\) gives a bounded sequence \(\tau(y_n)\subset Y^{**}\). Apply the weak-star compactness result in \(Y^{**}=(Y^*)^*\). Reflexivity identifies the weak-star limit with \(\tau(y)\), and this exactly means \(y_{n_k}\rightharpoonup y\) weakly in \(Y\).</li>
            </ol>`
        },
        {
          title: "Fredholm alternative and compact spectrum",
          points: 5,
          predictionTag: "Medium-high probability - July history and no exact 2026 use",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>State the Fredholm alternative for \(I-T\) with \(T\) compact on a Hilbert space.</li>
              <li>Discuss solvability of \(u-Tu=f\).</li>
              <li>Write the definitions of \(\rho(T)\), \(\sigma(T)\), \(EV(T)\), and \(\sigma_p(T)\).</li>
              <li>State the spectral theorem for compact self-adjoint operators.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>For compact \(T:H\to H\), \(\ker(I-T)\) is finite-dimensional, \(\operatorname{Ran}(I-T)\) is closed, and \(\operatorname{Ran}(I-T)=\ker(I-T^*)^\perp\). Also \(I-T\) is injective iff it is surjective.</li>
              <li>The equation \(u-Tu=f\) is solvable iff \(f\perp\ker(I-T^*)\). If \(\ker(I-T)=\{0\}\), the solution is unique for every \(f\).</li>
              <li>\(\rho(T)\) is the set of \(\lambda\) such that \(\lambda I-T\) is bijective with bounded inverse. \(\sigma(T)=\mathbb C\setminus\rho(T)\). \(EV(T)=\sigma_p(T)=\{\lambda:\ker(\lambda I-T)\ne\{0\}\}\).</li>
              <li>For compact self-adjoint \(T\), there is an orthonormal system of eigenvectors with real eigenvalues tending only possibly to \(0\), and \(T\) admits the corresponding orthogonal spectral expansion.</li>
            </ol>`
        }
      ]
    }
  ];

  var PREDICTED_EXERCISE_MOCK_EXAMS = [
    {
      title: "Mock July 2026 Exercise Exam 1",
      subtitle: "Convergence traps plus a singular compact operator",
      rationale: "This set forces the common false moves: treating convergence in measure as an \(L^1\) statement, applying DCT with no dominator, and rejecting an operator because the kernel is singular.",
      questions: [
        {
          title: "Cutoff, exponential spike, and a limit outside the space",
          points: 7,
          predictionTag: "Trap: a.e. convergence does not choose the right normed-space limit",
          statementHtml: String.raw`
            <p>On \(((0,\infty),\mathcal L,\lambda)\), define</p>
            <div class="formula">\[
              f_n(x)=\frac{\sin x}{1+x}\,\mathbf 1_{(0,n)}(x)+n^2xe^{-nx},\qquad x\gt0.
            \]</div>
            <ol class="mock-subparts">
              <li>Prove that \(f_n\in L^1_{\mathrm{loc}}(0,\infty)\) for every \(n\). Decide whether \(f_n\in L^1(0,\infty)\).</li>
              <li>Compute the pointwise a.e. limit \(f\).</li>
              <li>Decide whether \(f\in L^1(0,\infty)\), and explain why this matters before speaking about \(L^1\)-convergence.</li>
              <li>Study convergence in measure on every finite interval \((0,A)\).</li>
              <li>Study convergence in measure on \((0,\infty)\).</li>
              <li>Decide whether \(f_n-f\to0\) in \(L^1(0,A)\) for every finite \(A\).</li>
              <li>For \(p\gt1\), decide whether the exponential term tends to \(0\) in \(L^p(0,\infty)\).</li>
              <li>Identify precisely where a dominated-convergence proof would break.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>Both summands are measurable. On finite intervals they are integrable. Globally, \(n^2xe^{-nx}\in L^1(0,\infty)\), but \(\sin x/(1+x)\,\mathbf1_{(0,n)}\) has finite support for fixed \(n\), hence \(f_n\in L^1(0,\infty)\) for every \(n\).</li>
              <li>For fixed \(x\gt0\), eventually \(x\lt n\), so the cutoff term tends to \(\sin x/(1+x)\). Also \(n^2xe^{-nx}\to0\). Hence
                <div class="formula">\[
                  f(x)=\frac{\sin x}{1+x}.
                \]</div></li>
              <li>The limit is not in \(L^1(0,\infty)\). Indeed \(\int_0^\infty |\sin x|/(1+x)\,dx=\infty\) by summing over intervals where \(|\sin x|\) is bounded below. Thus the sentence "\(f_n\to f\) in \(L^1(0,\infty)\)" is not even a statement inside \(L^1\), because \(f\notin L^1\).</li>
              <li>On \((0,A)\), the cutoff disappears for all \(n\gt A\), and \(n^2xe^{-nx}\to0\) a.e. Since convergence a.e. on a finite-measure set implies convergence in measure, \(f_n\to f\) in measure on \((0,A)\).</li>
              <li>On \((0,\infty)\), convergence in measure to \(f\) still holds. For the cutoff error, \(|\sin x|/(1+x)\mathbf1_{[n,\infty)}\) exceeds a fixed \(\varepsilon\gt0\) only when \(x\le 1/\varepsilon-1\), so the set is eventually empty. For the spike, set \(y=nx\): \(n^2xe^{-nx}=nye^{-y}\), and \(\lambda\{n^2xe^{-nx}\gt\varepsilon\}=n^{-1}\lambda\{nye^{-y}\gt\varepsilon\}\to0\); the relevant \(y\)-set has length \(O(\log n)\).</li>
              <li>On every \((0,A)\), the cutoff part is eventually zero. But
                <div class="formula">\[
                  \int_0^A n^2xe^{-nx}\,dx=\int_0^{nA} ye^{-y}\,dy\to1.
                \]</div>
                Therefore \(f_n-f\) does not tend to \(0\) in \(L^1(0,A)\).</li>
              <li>For \(p\gt1\),
                <div class="formula">\[
                  \|n^2xe^{-nx}\|_p^p
                  =n^{2p}\int_0^\infty x^pe^{-pnx}\,dx
                  =C_p n^{p-1},
                \]</div>
                so the \(L^p\)-norm grows like \(n^{1-1/p}\), not to \(0\).</li>
              <li>DCT breaks twice: globally the limit is not in \(L^1\), and locally the moving spike has fixed \(L^1\)-mass with no integrable dominator independent of \(n\). The mental trap is that pointwise disappearance of a spike is not norm disappearance.</li>
            </ol>`
        },
        {
          title: "A singular Volterra operator that is still compact",
          points: 7,
          predictionTag: "Trap: singular kernel, bounded output, compactness by equicontinuity",
          statementHtml: String.raw`
            <p>Let \(X=C([0,1])\) with the uniform norm. Define</p>
            <div class="formula">\[
              (Tf)(x)=\int_0^x \frac{f(t)}{\sqrt t}\,dt,\qquad x\in[0,1],
            \]</div>
            <p>with the improper integral at \(0\).</p>
            <ol class="mock-subparts">
              <li>Prove that \(T\) is well defined and linear from \(X\) to \(X\).</li>
              <li>Prove that \(T\) is continuous and compute \(\|T\|\).</li>
              <li>Prove that \(T\) is compact.</li>
              <li>Decide whether \(T\) maps bounded sets into bounded subsets of \(C^1([0,1])\).</li>
              <li>Find the kernel and range obstruction.</li>
              <li>Determine whether \(T\) has nonzero eigenvalues.</li>
              <li>Decide whether \(0\) is an eigenvalue.</li>
              <li>Explain the trap in saying "the kernel is unbounded, so the operator is unbounded".</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>The weight \(t^{-1/2}\) is in \(L^1(0,1)\). Hence the integral is finite and \(Tf\) is continuous, since indefinite integrals of \(L^1\)-functions are absolutely continuous. Linearity is immediate.</li>
              <li>For \(\|f\|_\infty\le1\),
                <div class="formula">\[
                  |Tf(x)|\le\int_0^x t^{-1/2}\,dt=2\sqrt x\le2.
                \]</div>
                Thus \(\|T\|\le2\). Equality is attained by \(f\equiv1\), since \(Tf(1)=2\). Hence \(\|T\|=2\).</li>
              <li>If \(\|f\|_\infty\le1\), then \(|Tf|\le2\), and
                <div class="formula">\[
                  |Tf(x)-Tf(y)|\le \int_{\min(x,y)}^{\max(x,y)} t^{-1/2}\,dt
                  =2|\sqrt x-\sqrt y|.
                \]</div>
                This gives uniform boundedness and equicontinuity. Arzela-Ascoli gives compactness.</li>
              <li>No. For \(f(0)\ne0\), \((Tf)'(x)=f(x)/\sqrt x\) on \((0,1]\), which is unbounded near \(0\). The image lies in \(AC\), not generally in \(C^1([0,1])\).</li>
              <li>If \(Tf=0\), differentiating on \((0,1]\) gives \(f=0\), so \(\ker T=\{0\}\). Every \(Tf\) satisfies \(Tf(0)=0\) and is absolutely continuous with derivative of the form \(f(x)/\sqrt x\), so \(T\) is not onto \(C([0,1])\).</li>
              <li>If \(Tf=\lambda f\) with \(\lambda\ne0\), then \(f(0)=0\) and differentiating gives \(f'(x)=f(x)/(\lambda\sqrt x)\). The only continuous solution with \(f(0)=0\) is \(f\equiv0\). Thus there are no nonzero eigenvalues.</li>
              <li>\(0\) is not an eigenvalue because \(\ker T=\{0\}\). This is a standard compact-operator trap: on an infinite-dimensional space, \(0\in\sigma(T)\), but it need not be an eigenvalue.</li>
              <li>The singularity is integrable. The operator norm sees \(\int_0^1t^{-1/2}dt\), not the pointwise supremum of the kernel.</li>
            </ol>`
        }
      ]
    },
    {
      title: "Mock July 2026 Exercise Exam 2",
      subtitle: "Oscillation thresholds and weak-star topology",
      rationale: "This set separates pointwise intuition from variation, absolute continuity, weak convergence, and weak-star convergence. It uses familiar objects with one parameter or one topology changed.",
      questions: [
        {
          title: "Oscillation near zero, BV, AC, and weak derivatives",
          points: 7,
          predictionTag: "Trap: continuity threshold differs from variation threshold",
          statementHtml: String.raw`
            <p>For \(\alpha\in\mathbb R\), define</p>
            <div class="formula">\[
              f_\alpha(x)=
              \begin{cases}
                x^\alpha\sin(1/x),&x\in(0,1],\\
                0,&x=0.
              \end{cases}
            \]</div>
            <p>Also define \(g(0)=1\) and \(g(x)=x^2\sin(1/x)\) for \(x\gt0\).</p>
            <ol class="mock-subparts">
              <li>For which \(\alpha\) is \(f_\alpha\) continuous on \([0,1]\)?</li>
              <li>For which \(\alpha\) is \(f_\alpha\in L^1(0,1)\)?</li>
              <li>For which \(\alpha\) is \(f_\alpha\) absolutely continuous on \([0,1]\)?</li>
              <li>For which \(\alpha\) is \(f_\alpha\in BV([0,1])\)?</li>
              <li>For which \(\alpha\) does \(f_\alpha\in W^{1,1}(0,1)\)?</li>
              <li>Is \(g\) equal a.e. to a \(W^{1,1}\)-function?</li>
              <li>Is \(g\) itself absolutely continuous on \([0,1]\)?</li>
              <li>Explain why changing one point can matter for \(AC\), but not for \(W^{1,1}\) as an equivalence class.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>Continuity at \(0\) holds exactly when \(\alpha\gt0\). Away from \(0\), the function is smooth.</li>
              <li>\(|f_\alpha|\le x^\alpha\), so integrability holds for \(\alpha\gt-1\). If \(\alpha\le-1\), the oscillation does not rescue absolute integrability; integrating over half-periods gives divergence.</li>
              <li>On \((0,1]\),
                <div class="formula">\[
                  f_\alpha'(x)=\alpha x^{\alpha-1}\sin(1/x)-x^{\alpha-2}\cos(1/x).
                \]</div>
                The decisive term is \(x^{\alpha-2}\cos(1/x)\), which is in \(L^1(0,1)\) exactly when \(\alpha\gt1\). Together with continuity at \(0\), this gives \(AC\) exactly for \(\alpha\gt1\).</li>
              <li>For a smooth function on \((0,1]\), finite variation requires \(\int_0^1|f_\alpha'|\,dx\lt\infty\) here. Thus the same threshold holds: \(BV\) exactly for \(\alpha\gt1\).</li>
              <li>In one dimension, \(W^{1,1}\) classes are represented by absolutely continuous functions with derivative in \(L^1\). Thus \(f_\alpha\in W^{1,1}(0,1)\) exactly for \(\alpha\gt1\).</li>
              <li>The function \(x^2\sin(1/x)\) belongs to \(W^{1,1}(0,1)\), since the derivative \(2x\sin(1/x)-\cos(1/x)\) is integrable on \((0,1)\). The value at one point is invisible to \(L^1\) and \(W^{1,1}\) equivalence classes, so \(g\) is equal a.e. to a \(W^{1,1}\)-function.</li>
              <li>No. \(g\) is not continuous at \(0\), because \(g(0)=1\) while \(x^2\sin(1/x)\to0\). Absolute continuity implies continuity, so this pointwise representative is not AC.</li>
              <li>\(AC\) is a pointwise property of the chosen representative on the closed interval. \(W^{1,1}\) is a property of an a.e. equivalence class. A single bad point can destroy AC for a representative while leaving the Sobolev class unchanged.</li>
            </ol>`
        },
        {
          title: "Weak-star versus weak convergence in sequence spaces",
          points: 7,
          predictionTag: "Trap: the same symbols live in different dualities",
          statementHtml: String.raw`
            <p>For \(n\ge1\), define \(x_n\in\ell^\infty\) by</p>
            <div class="formula">\[
              x_n(k)=
              \begin{cases}
                \cos(k/n),&1\le k\le n^2,\\
                0,&k\gt n^2.
              \end{cases}
            \]</div>
            <p>Let \(e_n\) be the canonical unit vector.</p>
            <ol class="mock-subparts">
              <li>Compute \(\|x_n\|_\infty\). Does \(x_n\) converge in norm in \(\ell^\infty\)?</li>
              <li>Compute the pointwise limit of \(x_n(k)\) for fixed \(k\).</li>
              <li>Viewing \(\ell^\infty=(\ell^1)^*\), decide whether \(x_n\overset{*}{\rightharpoonup}\mathbf1\).</li>
              <li>Does \(x_n\) converge weakly in \(\ell^\infty\)? Give the safest answer and justify what extra fact would be needed.</li>
              <li>Viewing \(e_n\in\ell^1=(c_0)^*\), prove that \(e_n\overset{*}{\rightharpoonup}0\).</li>
              <li>Prove that \(e_n\) does not converge weakly to \(0\) in \(\ell^1\).</li>
              <li>Define the right shift \(S:\ell^1\to\ell^1\), \(S(a_1,a_2,\dots)=(0,a_1,a_2,\dots)\). Is \(S\) compact?</li>
              <li>Explain why weak-star convergence of \(e_n\) does not contradict \(\|e_n\|_1=1\).</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>\(\|x_n\|_\infty=1\). The sequence does not converge in norm to \(\mathbf1\), since for \(k\gt n^2\), \(x_n(k)=0\), so \(\|x_n-\mathbf1\|_\infty=1\).</li>
              <li>For fixed \(k\), eventually \(k\le n^2\), and \(\cos(k/n)\to1\). Hence the pointwise limit is \(\mathbf1\).</li>
              <li>For \(a\in\ell^1\),
                <div class="formula">\[
                  \sum_k a_kx_n(k)\to\sum_ka_k,
                \]</div>
                by dominated convergence for counting measure, using \(|a_kx_n(k)|\le |a_k|\). Thus \(x_n\overset{*}{\rightharpoonup}\mathbf1\) in \(\ell^\infty=(\ell^1)^*\).</li>
              <li>The safe answer is: not from the given computation. Weak convergence in \(\ell^\infty\) requires testing against every element of \((\ell^\infty)^*\), which is much larger than \(\ell^1\). The weak-star calculation only tests the predual \(\ell^1\).</li>
              <li>For \(y\in c_0\), \(\langle e_n,y\rangle=y_n\to0\). Hence \(e_n\overset{*}{\rightharpoonup}0\) in \((c_0)^*=\ell^1\).</li>
              <li>Weak convergence in \(\ell^1\) tests against \(\ell^\infty\). Taking the constant sequence \(\mathbf1\in\ell^\infty\), \(\langle e_n,\mathbf1\rangle=1\), so \(e_n\) does not converge weakly to \(0\).</li>
              <li>\(S\) is not compact. The bounded sequence \((e_n)\) is mapped to \(e_{n+1}\), which has no norm-convergent subsequence in \(\ell^1\).</li>
              <li>Weak-star convergence is weaker than norm convergence. Banach-Alaoglu predicts compactness only in the weak-star topology, not norm compactness.</li>
            </ol>`
        }
      ]
    },
    {
      title: "Mock July 2026 Exercise Exam 3",
      subtitle: "Measure decomposition and one formula on two spaces",
      rationale: "This set tests whether you track the ambient object: which measure dominates which, and which function space permits which extremizer.",
      questions: [
        {
          title: "Radon-Nikodym with an atom hidden at zero",
          points: 7,
          predictionTag: "Trap: finite measures do not imply mutual absolute continuity",
          statementHtml: String.raw`
            <p>On \([0,1]\), let</p>
            <div class="formula">\[
              \mu=\lambda+\delta_0,\qquad
              d\nu(x)=x^{-1/2}\,d\lambda(x).
            \]</div>
            <ol class="mock-subparts">
              <li>Prove that \(\mu\) and \(\nu\) are finite measures.</li>
              <li>Decide whether \(\nu\ll\mu\).</li>
              <li>Decide whether \(\mu\ll\nu\).</li>
              <li>Compute \(d\nu/d\mu\), if it exists.</li>
              <li>Does \(d\mu/d\nu\) exist? Give the precise obstruction.</li>
              <li>Give the Lebesgue decomposition of \(\mu\) with respect to \(\nu\).</li>
              <li>Is \(\lambda\ll\nu\)? Compute \(d\lambda/d\nu\).</li>
              <li>Explain why the value at the atom is irrelevant in one derivative but decisive for the other direction.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>\(\mu([0,1])=2\), and \(\nu([0,1])=\int_0^1x^{-1/2}\,dx=2\). Both are finite.</li>
              <li>If \(\mu(E)=0\), then \(\lambda(E)=0\) and \(0\notin E\). Therefore \(\nu(E)=\int_E x^{-1/2}\,d\lambda=0\), so \(\nu\ll\mu\).</li>
              <li>No. \(\nu(\{0\})=0\), but \(\mu(\{0\})=1\). Hence \(\mu\not\ll\nu\).</li>
              <li>The derivative exists because \(\nu\ll\mu\). It is
                <div class="formula">\[
                  \frac{d\nu}{d\mu}(x)=x^{-1/2}\quad x\gt0,\qquad
                  \frac{d\nu}{d\mu}(0)=0.
                \]</div>
                The value at \(0\) must give no mass contribution to \(\nu\) on the atom.</li>
              <li>\(d\mu/d\nu\) does not exist globally because \(\mu\not\ll\nu\). The obstruction is exactly the atom \(\{0\}\).</li>
              <li>The decomposition is
                <div class="formula">\[
                  \mu=\lambda+\delta_0,\qquad \lambda\ll\nu,\qquad \delta_0\perp\nu.
                \]</div></li>
              <li>Yes, \(\lambda\ll\nu\). Since \(d\nu=x^{-1/2}d\lambda\), we have \(d\lambda/d\nu=\sqrt x\) for \(x\gt0\), with arbitrary value at \(0\) \(\nu\)-a.e.</li>
              <li>Radon-Nikodym derivatives are defined up to null sets for the dominating measure. The point \(0\) is \(\lambda\)- and \(\nu\)-null, but not \(\mu\)-null. That is the entire trap.</li>
            </ol>`
        },
        {
          title: "One formula, two spaces, and a norm that is not attained",
          points: 7,
          predictionTag: "Trap: same operator formula, different admissible maximizers",
          statementHtml: String.raw`
            <p>Let \(X_1=L^\infty(0,1)\) and \(X_2=C([0,1])\), both with the uniform norm. Define</p>
            <div class="formula">\[
              (T_if)(t)=\int_0^1\sin(1/x)f(x)\,dx,\qquad i=1,2.
            \]</div>
            <p>The output is the constant function with that value.</p>
            <ol class="mock-subparts">
              <li>Prove that \(T_1\) and \(T_2\) are well defined and continuous.</li>
              <li>Compute \(\|T_1\|\), and decide whether the norm is attained.</li>
              <li>Compute \(\|T_2\|\), and decide whether the norm is attained.</li>
              <li>Prove that both operators are compact.</li>
              <li>Determine the range and kernel of each operator.</li>
              <li>Compute \(T_i^2\).</li>
              <li>Determine the nonzero eigenvalues, if any.</li>
              <li>Determine \(\sigma(T_i)\).</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>The function \(\sin(1/x)\) is bounded and measurable, hence in \(L^1(0,1)\). Therefore
                <div class="formula">\[
                  |T_if|\le \|f\|_\infty\int_0^1|\sin(1/x)|\,dx.
                \]</div>
                Both operators are continuous and well defined.</li>
              <li>On \(L^\infty\),
                <div class="formula">\[
                  \|T_1\|=\int_0^1|\sin(1/x)|\,dx,
                \]</div>
                and the norm is attained by \(f=\operatorname{sgn}(\sin(1/x))\).</li>
              <li>On \(C([0,1])\), the same norm is obtained as a supremum by continuous approximations of the sign function. It is not attained: equality would force \(f\sin(1/x)=|\sin(1/x)|\) a.e. with \(|f|=1\), so \(f\) would have to change sign infinitely often near \(0\), impossible for a continuous function at \(0\).</li>
              <li>The range is contained in the one-dimensional space of constant functions. Hence both operators are finite rank, therefore compact.</li>
              <li>The range is exactly the constants, because the functional is not zero. The kernel is
                <div class="formula">\[
                  \ker T_i=\left\{f\in X_i:\int_0^1\sin(1/x)f(x)\,dx=0\right\}.
                \]</div></li>
              <li>Let \(A=\int_0^1\sin(1/x)\,dx\). Since \(T_if\) is constant, \(T_i^2f=A\,T_if\).</li>
              <li>The constant function \(1\) is an eigenvector with eigenvalue \(A\). If \(A\ne0\), this is the only nonzero eigenvalue; if \(A=0\), there is no nonzero eigenvalue.</li>
              <li>In all cases, \(\sigma(T_i)=\{0,A\}\), with the convention that this is just \(\{0\}\) if \(A=0\).</li>
            </ol>`
        }
      ]
    }
  ];

  var MOCK_SETS = {
    theory: {
      exams: PREDICTED_MOCK_EXAMS,
      itemLabel: "Question",
      scorePrefix: "Q",
      dateLabel: "July 2026 theory prediction set",
      instructions: "Three theory questions, 18 total points, following the 2026 Q1-Q2-Q3 style. These are model-weighted prediction mocks, not leaked exam content.",
      answerPlaceholder: "Jot key ideas here (optional)..."
    },
    exercise: {
      exams: PREDICTED_EXERCISE_MOCK_EXAMS,
      itemLabel: "Exercise",
      scorePrefix: "E",
      dateLabel: "July 2026 exercise mock set",
      instructions: "Two exercise problems, 14 total points. These are trap-first synthetic practice mocks built from past-exam patterns, not leaked exam content.",
      answerPlaceholder: "Work the proof, estimates, and counterexamples here (optional)..."
    }
  };

  function getActiveMockSet() {
    return MOCK_SETS[state.mockSet] || MOCK_SETS.theory;
  }

  function startMockExam(mockSet) {
    state.mockSet = mockSet || "theory";
    state.mockQuestions = getActiveMockSet().exams[0].questions;
    state.mockRevealed  = false;
    state.mockExerciseIndex = 0;

    renderMockPaper(0);
    showView("mock");
  }

  function renderMockPaper(examIndex) {
    var wrap = document.getElementById("mock-wrap");
    var mockSet = getActiveMockSet();
    var exams = mockSet.exams;
    var exam = exams[examIndex] || exams[0];
    var today = new Date();
    var dateStr = today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    state.mockQuestions = exam.questions;
    state.mockRevealed = false;
    state.mockExerciseIndex = 0;

    var tabsHtml = exams.map(function (item, i) {
      return '<button type="button" data-predicted-exam="' + i + '" aria-pressed="' + (i === examIndex ? "true" : "false") + '">Exam ' + (i + 1) + '</button>';
    }).join("");

    var questionsHtml = exam.questions.map(function (q, i) {
      return '<div class="mock-question-block" data-mock-idx="' + i + '">'
        + '<div class="mock-q-meta">' + q.predictionTag + '</div>'
        + '<h2 class="mock-q-heading">' + mockSet.itemLabel + ' ' + (i + 1) + '. ' + q.title + ' <span class="mock-pts">[' + q.points + ' points]</span></h2>'
        + '<div class="mock-q-text">' + q.statementHtml + '</div>'
        + '<div class="mock-answer-space">'
        + '<textarea placeholder="' + mockSet.answerPlaceholder + '" rows="5" aria-label="Answer notes for ' + mockSet.itemLabel.toLowerCase() + ' ' + (i + 1) + '"></textarea>'
        + '</div>'
        + '<div class="mock-revealed-answer" id="mock-answer-' + i + '" hidden></div>'
        + '</div>';
    }).join("");

    var scoreHeaders = exam.questions.map(function (_, i) {
      return '<div class="mock-score-cell header">' + mockSet.scorePrefix + (i + 1) + '</div>';
    }).join("") + '<div class="mock-score-cell header">Total</div>';
    var scoreValues = exam.questions.map(function (_, i) {
      return '<div class="mock-score-cell value" id="mscore-' + (i + 1) + '"></div>';
    }).join("") + '<div class="mock-score-cell value" id="mscore-total"></div>';

    wrap.innerHTML =
      '<div class="mock-switcher" role="group" aria-label="Predicted mock exam set">' + tabsHtml + '</div>'
      + '<div class="mock-paper">'
      + '<div class="mock-letterhead">'
      + '<div class="mock-uni">Politecnico di Milano, Mathematical Engineering</div>'
      + '<div class="mock-course">Real and Functional Analysis</div>'
      + '<div class="mock-date">' + mockSet.dateLabel + ' · ' + dateStr + '</div>'
      + '<h1 class="mock-title">' + exam.title + '</h1>'
      + '<p class="mock-subtitle">' + exam.subtitle + '</p>'
      + '<p class="mock-rationale">' + exam.rationale + '</p>'
      + '<div class="mock-score-row">'
      + scoreHeaders
      + scoreValues
      + '</div>'
      + '</div>'
      + '<div class="mock-body">'
      + '<div class="mock-instructions">' + mockSet.instructions + '</div>'
      + questionsHtml
      + '</div>'
      + '<div class="mock-actions" id="mock-actions-bar">'
      + '<button class="btn-secondary" id="btn-mock-prev">Previous ' + mockSet.itemLabel.toLowerCase() + '</button>'
      + '<span class="mock-page-counter" id="mock-page-counter">' + mockSet.itemLabel + ' 1 / ' + state.mockQuestions.length + '</span>'
      + '<button class="btn-secondary" id="btn-mock-next">Next ' + mockSet.itemLabel.toLowerCase() + '</button>'
      + '<button class="btn-primary" id="btn-mock-reveal">Reveal solution</button>'
      + '</div>'
      + '</div>';

    wrap.querySelectorAll("[data-predicted-exam]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        renderMockPaper(Number(btn.dataset.predictedExam));
      });
    });

    // Typeset question texts
    state.mockQuestions.forEach(function (q, i) {
      var el = wrap.querySelector('[data-mock-idx="' + i + '"] .mock-q-text');
      if (el) typeset(el);
    });

    // Reveal button
    document.getElementById("btn-mock-reveal").addEventListener("click", function () {
      revealMockAnswer(state.mockExerciseIndex);
    });

    document.getElementById("btn-mock-prev").addEventListener("click", function () {
      showMockExercise(state.mockExerciseIndex - 1);
    });

    document.getElementById("btn-mock-next").addEventListener("click", function () {
      showMockExercise(state.mockExerciseIndex + 1);
    });

    typeset(wrap.querySelector(".mock-letterhead"));
    showMockExercise(0);
  }

  function showMockExercise(index) {
    if (index < 0 || index >= state.mockQuestions.length) return;
    var mockSet = getActiveMockSet();
    state.mockExerciseIndex = index;

    document.querySelectorAll(".mock-question-block").forEach(function (el) {
      el.hidden = Number(el.dataset.mockIdx) !== index;
    });

    var counter = document.getElementById("mock-page-counter");
    if (counter) counter.textContent = mockSet.itemLabel + " " + (index + 1) + " / " + state.mockQuestions.length;

    var prev = document.getElementById("btn-mock-prev");
    var next = document.getElementById("btn-mock-next");
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index === state.mockQuestions.length - 1;

    var reveal = document.getElementById("btn-mock-reveal");
    var answer = document.getElementById("mock-answer-" + index);
    if (reveal && answer) reveal.disabled = !answer.hidden;

    var current = document.querySelector('[data-mock-idx="' + index + '"]');
    if (current) typeset(current);
  }

  function revealMockAnswer(index) {
    var q = state.mockQuestions[index];
    var revealEl = document.getElementById("mock-answer-" + index);
    if (!q || !revealEl || !revealEl.hidden) return;

    revealEl.hidden = false;
    revealEl.innerHTML =
      '<div class="mock-solution-heading">Complete solution</div>'
      + '<div class="answer-body">' + q.solutionHtml + '</div>';

    var answerBodyEl = revealEl.querySelector(".answer-body");
    normalizeAnswerBodies(answerBodyEl);
    typeset(answerBodyEl);

    var reveal = document.getElementById("btn-mock-reveal");
    if (reveal) reveal.disabled = true;
  }

  // ═══════════════════════════════════════════════════
  //  SUMMARY VIEW
  // ═══════════════════════════════════════════════════

  function renderSummary() {
    var wrap = document.getElementById("summary-wrap");
    var ss   = state.sessionScores;

    var blank   = ss.filter(function (s) { return s.scoreAfter === 1; });
    var partial = ss.filter(function (s) { return s.scoreAfter === 2; });
    var gotit   = ss.filter(function (s) { return s.scoreAfter === 3; });

    var title = gotit.length === ss.length
      ? "Excellent session! 🎉"
      : blank.length > gotit.length
        ? "Keep at it — you'll get there."
        : "Good progress!";

    function scoreLabel(s) {
      return s === 1 ? "blank" : s === 2 ? "partial" : "gotit";
    }
    function scoreText(s) {
      return s === 1 ? "Blank" : s === 2 ? "Partial" : "Got it";
    }

    var listHtml = ss.map(function (s) {
      var cls = scoreLabel(s.scoreAfter);
      return '<div class="summary-q-row">'
        + '<div class="summary-q-dot ' + cls + '"></div>'
        + '<div class="summary-q-text">' + s.questionHtml + '</div>'
        + '<div class="summary-q-tag">' + scoreText(s.scoreAfter) + '</div>'
        + '</div>';
    }).join("");

    wrap.innerHTML =
      '<div class="summary-hero">'
      + '<h1 class="summary-title">' + title + '</h1>'
      + '<p class="summary-sub">You reviewed ' + ss.length + ' question' + (ss.length !== 1 ? "s" : "") + ' this session.</p>'
      + '</div>'

      + '<div class="summary-stats">'
      + '<div class="summary-stat blank">'
      + '<div class="summary-stat-n">' + blank.length + '</div>'
      + '<div class="summary-stat-label">Blank</div>'
      + '</div>'
      + '<div class="summary-stat partial">'
      + '<div class="summary-stat-n">' + partial.length + '</div>'
      + '<div class="summary-stat-label">Partial</div>'
      + '</div>'
      + '<div class="summary-stat gotit">'
      + '<div class="summary-stat-n">' + gotit.length + '</div>'
      + '<div class="summary-stat-label">Got it</div>'
      + '</div>'
      + '</div>'

      + (ss.length > 0
        ? '<div class="summary-list">'
          + '<div class="summary-list-heading">This session</div>'
          + listHtml
          + '</div>'
        : '')

      + '<div class="summary-actions">'
      + (blank.length > 0
        ? '<button class="btn-primary" id="sum-retry-weak">Practice weak spots again</button>'
        : '')
      + '<button class="btn-secondary" id="sum-home">Back to home</button>'
      + '</div>';

    // Wire buttons
    var retryBtn = document.getElementById("sum-retry-weak");
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        startPracticeSession("weak", state.subject, "all", "all", null);
      });
    }
    document.getElementById("sum-home").addEventListener("click", function () {
      renderHome();
      showView("home");
    });

    // Typeset question texts in summary
    typeset(wrap);
  }

  // ═══════════════════════════════════════════════════
  //  FILTER SETUP (topbar)
  // ═══════════════════════════════════════════════════

  function setupFilters() {
    // Subject
    document.querySelectorAll("[data-filter-subject]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.subject = btn.dataset.filterSubject;
        state.filter.subject = btn.dataset.filterSubject;
        document.querySelectorAll("[data-filter-subject]").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b.dataset.filterSubject === state.subject));
        });
        if (state.view === "browse") applyBrowseFilter();
      });
    });

    // Priority
    document.querySelectorAll("[data-filter-priority]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.filter.priority = btn.dataset.filterPriority;
        document.querySelectorAll("[data-filter-priority]").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b.dataset.filterPriority === state.filter.priority));
        });
        if (state.view === "browse") applyBrowseFilter();
      });
    });

    // Proof type
    document.querySelectorAll("[data-filter-proof]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.filter.proof = btn.dataset.filterProof;
        document.querySelectorAll("[data-filter-proof]").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b.dataset.filterProof === state.filter.proof));
        });
        if (state.view === "browse") applyBrowseFilter();
      });
    });
  }

  // ═══════════════════════════════════════════════════
  //  KEYBOARD SHORTCUTS
  // ═══════════════════════════════════════════════════

  function setupKeyboard() {
    document.addEventListener("keydown", function (e) {
      if (state.view !== "practice") return;
      // Don't capture when typing in inputs
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      switch (e.key) {
        case " ":
        case "Enter":
          e.preventDefault();
          if (!state.recallStarted) {
            startRecall();
          } else if (state.revealLevel === 0) {
            // Jump to full answer
            revealLayer(3);
          }
          break;

        case "1":
          if (state.revealLevel > 0) { e.preventDefault(); saveScore(1); }
          break;
        case "2":
          if (state.revealLevel > 0) { e.preventDefault(); saveScore(2); }
          break;
        case "3":
          if (state.revealLevel > 0) { e.preventDefault(); saveScore(3); }
          break;

        case "ArrowLeft":
          e.preventDefault();
          goToQuestion(state.queueIndex - 1);
          break;
        case "ArrowRight":
          e.preventDefault();
          goToQuestion(state.queueIndex + 1);
          break;
      }
    });
  }

  // ═══════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════

  function init() {
    initTheme();
    setupFilters();
    setupKeyboard();

    // Back button
    document.getElementById("btn-back").addEventListener("click", function () {
      switch (state.view) {
        case "chapter-picker": showView("home"); renderHome(); break;
        case "practice":       stopTimer(); showView("home"); renderHome(); break;
        case "browse":         showView("home"); renderHome(); break;
        case "mock":           showView("home"); renderHome(); break;
        case "summary":        showView("home"); renderHome(); break;
        default:               showView("home"); renderHome(); break;
      }
    });

    // Home mode buttons
    document.getElementById("mode-weak").addEventListener("click", function () {
      startPracticeSession("weak", state.subject, state.filter.priority, state.filter.proof, null);
    });

    document.getElementById("mode-chapter").addEventListener("click", function () {
      renderChapterPicker("chapter");
    });

    document.getElementById("mode-random").addEventListener("click", function () {
      startPracticeSession("random", state.subject, state.filter.priority, state.filter.proof, null);
    });

    document.getElementById("mode-mock").addEventListener("click", function () {
      startMockExam("theory");
    });

    document.getElementById("mode-exercise-mock").addEventListener("click", function () {
      startMockExam("exercise");
    });

    document.getElementById("btn-browse").addEventListener("click", function () {
      state.filter.subject = state.subject;
      renderBrowse();
      showView("browse");
    });

    // Practice: start recall
    document.getElementById("btn-start-recall").addEventListener("click", function () {
      startRecall();
    });

    // Practice: skip timer (jump to reveal)
    document.getElementById("btn-skip-timer").addEventListener("click", function () {
      revealLayer(3);
    });

    // Practice: reveal buttons
    document.getElementById("btn-reveal-strategy").addEventListener("click", function () {
      revealLayer(1);
    });
    document.getElementById("btn-reveal-keysteps").addEventListener("click", function () {
      revealLayer(2);
    });
    document.getElementById("btn-reveal-full").addEventListener("click", function () {
      revealLayer(3);
    });

    // Practice: assessment
    document.querySelectorAll(".btn-assess").forEach(function (btn) {
      btn.addEventListener("click", function () {
        saveScore(Number(btn.dataset.score));
      });
    });

    // Practice: navigation
    document.getElementById("btn-prev-q").addEventListener("click", function () {
      goToQuestion(state.queueIndex - 1);
    });
    document.getElementById("btn-next-q").addEventListener("click", function () {
      goToQuestion(state.queueIndex + 1);
    });

    // Start on home
    renderHome();
    showView("home");
  }

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
