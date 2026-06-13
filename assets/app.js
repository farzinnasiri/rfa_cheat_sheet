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
    mockQuestions: [],
    mockRevealed:  false,
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
    var chapters    = chaptersForSubject(state.subject);
    var questionHtml = "";

    ALL_QUESTIONS.forEach(function (q) {
      var sc       = (conf[q.id] && conf[q.id].score) || 0;
      var chapter  = q.chapter;
      var bankRef  = q.bankRef || "";
      var bankTitle = q.bankRefFull || bankRef;

      questionHtml +=
        '<div class="browse-question" data-q-id="' + q.id + '"'
        + ' data-q-subject="'  + q.subject + '"'
        + ' data-q-priority="' + q.priority + '"'
        + ' data-q-proof="'    + q.isProof + '"'
        + ' data-q-chapter="'  + chapter.replace(/"/g, "&quot;") + '">'

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
    var allChapters = DATA.meta.measureChapters.concat(DATA.meta.functionalChapters);
    var chapterHtml = "";

    allChapters.forEach(function (chapter) {
      var displayName = chapter.replace(/^\d+\.\s*/, "");
      chapterHtml +=
        '<div class="browse-chapter-heading" data-chapter="' + chapter.replace(/"/g, "&quot;") + '">'
        + '<span class="browse-chapter-title">' + displayName + '</span>'
        + '<span class="browse-chapter-count"></span>'
        + '</div>';
    });

    inner.innerHTML = mobileStrip + chapterHtml + questionHtml;

    // Re-order: inject questions directly after their chapter heading
    var headingMap = {};
    inner.querySelectorAll(".browse-chapter-heading").forEach(function (h) {
      headingMap[h.dataset.chapter] = h;
    });
    inner.querySelectorAll(".browse-question").forEach(function (el) {
      var ch      = el.dataset.qChapter;
      var heading = headingMap[ch];
      if (heading) heading.insertAdjacentElement("afterend", el);
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
      var chapter = heading.dataset.chapter;
      if (!chapter) return;
      var visible = Array.from(inner.querySelectorAll(".browse-question")).filter(function (el) {
        return el.dataset.qChapter === chapter && !el.hidden;
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

  // Fisher-Yates shuffle — true uniform randomness, no state needed.
  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function startMockExam() {
    // Exam structure (matches real Polimi RFA format):
    //   Q1 [7 pts] — one proof question    (data-proof="true")
    //   Q2 [6 pts] — one no-proof question (data-proof="false")
    //   Q3 [5 pts] — one no-proof question (data-proof="false"), different from Q2

    var proofPool   = ALL_QUESTIONS.filter(function (q) { return  q.isProof; });
    var noProofPool = ALL_QUESTIONS.filter(function (q) { return !q.isProof; });

    // Shuffle both pools independently — every call gives a different ordering.
    var sProof   = shuffled(proofPool);
    var sNoProof = shuffled(noProofPool);

    var q1 = sProof[0]   || null;
    var q2 = sNoProof[0] || null;
    // Q3: skip the index used for Q2 (they're in a shuffled order so index 1 is already different)
    var q3 = sNoProof[1] || sNoProof[0] || null;

    state.mockQuestions = [q1, q2, q3].filter(Boolean);
    state.mockRevealed  = false;

    renderMockPaper();
    showView("mock");
  }

  function renderMockPaper() {
    var wrap = document.getElementById("mock-wrap");
    var pts  = [7, 6, 5];
    var today = new Date();
    var dateStr = today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    var questionsHtml = state.mockQuestions.map(function (q, i) {
      return '<div class="mock-question-block" data-mock-idx="' + i + '">'
        + '<h2 class="mock-q-heading">Question ' + (i + 1) + '. <span class="mock-pts">[' + pts[i] + ' points]</span></h2>'
        + '<div class="mock-q-text">' + q.questionHtml + '</div>'
        + '<div class="mock-answer-space">'
        + '<textarea placeholder="Jot key ideas here (optional)…" rows="5" aria-label="Answer notes for question ' + (i + 1) + '"></textarea>'
        + '</div>'
        + '<div class="mock-revealed-answer" id="mock-answer-' + i + '" hidden></div>'
        + '</div>';
    }).join("");

    wrap.innerHTML =
      '<div class="mock-paper">'
      + '<div class="mock-letterhead">'
      + '<div class="mock-uni">Politecnico di Milano, Mathematical Engineering</div>'
      + '<div class="mock-course">Real and Functional Analysis</div>'
      + '<div class="mock-date">Practice Exam · ' + dateStr + '</div>'
      + '<div class="mock-score-row">'
      + '<div class="mock-score-cell header">Q1</div><div class="mock-score-cell header">Q2</div>'
      + '<div class="mock-score-cell header">Q3</div><div class="mock-score-cell header">Total</div>'
      + '<div class="mock-score-cell value" id="mscore-1"></div>'
      + '<div class="mock-score-cell value" id="mscore-2"></div>'
      + '<div class="mock-score-cell value" id="mscore-3"></div>'
      + '<div class="mock-score-cell value" id="mscore-total"></div>'
      + '</div>'
      + '</div>'
      + '<div class="mock-body">'
      + '<div class="mock-instructions">[Answers must be written under the text. Self-assess after revealing — be honest with yourself.]</div>'
      + questionsHtml
      + '</div>'
      + '<div class="mock-actions" id="mock-actions-bar">'
      + '<button class="btn-primary" id="btn-mock-reveal">Reveal answers</button>'
      + '<button class="btn-secondary" id="btn-mock-new">New exam</button>'
      + '</div>'
      + '</div>';

    // Typeset question texts
    state.mockQuestions.forEach(function (q, i) {
      var el = wrap.querySelector('[data-mock-idx="' + i + '"] .mock-q-text');
      if (el) typeset(el);
    });

    // Reveal button
    document.getElementById("btn-mock-reveal").addEventListener("click", function () {
      revealMockAnswers();
    });

    document.getElementById("btn-mock-new").addEventListener("click", function () {
      startMockExam();
    });
  }

  function revealMockAnswers() {
    if (state.mockRevealed) return;
    state.mockRevealed = true;

    document.getElementById("btn-mock-reveal").disabled = true;

    state.mockQuestions.forEach(function (q, i) {
      var revealEl = document.getElementById("mock-answer-" + i);
      revealEl.hidden = false;
      revealEl.innerHTML =
        '<div class="answer-body">' + q.answerHtml + '</div>'
        + '<div class="mock-assess-row">'
        + '<span class="mock-assess-label">How did it go?</span>'
        + '<button class="btn-assess-small" data-score="1" data-mock-q="' + q.id + '">😶 Blank</button>'
        + '<button class="btn-assess-small" data-score="2" data-mock-q="' + q.id + '">🤔 Partial</button>'
        + '<button class="btn-assess-small" data-score="3" data-mock-q="' + q.id + '">✓ Got it</button>'
        + '</div>';

      var answerBodyEl = revealEl.querySelector(".answer-body");
      normalizeAnswerBodies(answerBodyEl);
      typeset(answerBodyEl);

      // Assessment buttons
      revealEl.querySelectorAll("[data-mock-q]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var score = Number(btn.dataset.score);
          setScore(btn.dataset.mockQ, score);
          revealEl.querySelectorAll("[data-mock-q]").forEach(function (b) {
            b.classList.toggle("selected", Number(b.dataset.score) === score);
          });
        });
      });
    });
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
      startMockExam();
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
