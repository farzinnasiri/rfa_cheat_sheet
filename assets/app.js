/* global window, document, localStorage, MathJax */
(function () {
  "use strict";

  // ═══════════════════════════════════════════════════
  //  DATA HELPERS
  // ═══════════════════════════════════════════════════

  var DATA = window.RFA_DATA;
  var FINAL_SCORES = DATA.finalScores || window.RFA_FINAL_SCORES || [];

  var FINAL_SCORE_BY_REF = {};
  FINAL_SCORES.forEach(function (row) {
    FINAL_SCORE_BY_REF[row.qid] = row;
  });

  var TIER_STARS = {
    "A": "★★★",
    "B": "★★",
    "C": "★",
    "D": "Suppressed"
  };

  var TIER_LABELS = {
    "A": "A must-cover",
    "B": "B strong",
    "C": "C skim",
    "D": "D suppress"
  };

  var TOPIC_LABELS = {
    measurable_functions: "Measurability traps",
    integral_definitions: "Integral definitions",
    convergence_modes: "Convergence modes",
    convergence_theorems: "Convergence theorems",
    lebesgue_points_ftc: "Lebesgue points / FTC",
    ac_w11_bv: "AC / BV / W11",
    weak_weakstar: "Weak / weak-star",
    fredholm_spectral: "Fredholm / spectral",
    hahn_banach_dual: "Hahn-Banach / duality",
    open_inverse_closed_graph: "Open / inverse / closed graph",
    baire_ubp: "Baire / UBP",
    metric_topology: "Metric / separability",
    lp_ellp: "Lp / ellp",
    operator_basics: "Operator basics",
    compact_operator: "Compact operators",
    hilbert_projection_riesz: "Hilbert representation",
    reflexivity_uniform_convexity: "Reflexivity",
    normed_banach_basics: "Normed basics",
    outer_measure_caratheodory: "Caratheodory",
    measure_basics: "Measure basics",
    lebesgue_regular: "Lebesgue regularity",
    vanishing_lemma: "Vanishing lemma",
    cantor_vitali: "Cantor / Vitali",
    radon_nikodym: "Radon-Nikodym"
  };

  var CORE_BANK_REFS = new Set([
    "Q1.5", "Q1.9", "Q1.10", "Q1.11", "Q1.12", "Q1.13", "Q1.14", "Q1.18",
    "Q1.20", "Q1.21", "Q1.22", "Q1.23", "Q1.24", "Q1.25", "Q1.26", "Q1.27", "Q1.28", "Q1.32", "Q1.33",
    "Q1.34", "Q1.43", "Q1.44", "Q1.45", "Q1.52", "Q1.54",
    "Q1.58", "Q1.61", "Q1.62", "Q1.63", "Q1.64", "Q1.65",
    "Q1.66", "Q1.67", "Q1.68", "Q1.69", "Q1.70", "Q1.71",
    "Q2.17", "Q2.22", "Q2.30", "Q2.31", "Q2.33", "Q2.34", "Q2.35", "Q2.36", "Q2.37",
    "Q2.42", "Q2.45", "Q2.46", "Q2.49", "Q2.50",
    "Q2.53", "Q2.54", "Q2.55", "Q2.56", "Q2.57", "Q2.58", "Q2.59", "Q2.60", "Q2.61", "Q2.62", "Q2.63",
    "Q2.64", "Q2.65", "Q2.66", "Q2.68", "Q2.69", "Q2.73", "Q2.74", "Q2.75", "Q2.76"
  ]);

  var SEEN_2026_EXACT_REFS = new Set([
    "Q1.18", "Q1.34", "Q1.38", "Q1.40", "Q1.43", "Q1.49", "Q1.52",
    "Q2.30", "Q2.31", "Q2.33", "Q2.34", "Q2.36", "Q2.37",
    "Q2.49", "Q2.50", "Q2.64", "Q2.65", "Q2.66", "Q2.69"
  ]);

  function bankRefsOf(q) {
    return (q.bankRef || "").match(/Q[12]\.\d+/g) || [];
  }

  function tierKey(tier) {
    return (tier || "D").charAt(0);
  }

  function tierPriority(tier) {
    return TIER_STARS[tierKey(tier)] || "★";
  }

  function bestFinalScore(refs) {
    var best = null;
    refs.forEach(function (ref) {
      var row = FINAL_SCORE_BY_REF[ref];
      if (!row) return;
      if (!best || row.score > best.score) best = row;
    });
    return best;
  }

  function inferQuestionForm(q) {
    var text = (q.questionHtml || "").toLowerCase();
    var forms = [];
    if (q.isProof || /\bprove\b|show that|justify/.test(text)) forms.push("Proof");
    if (/definition|define|write the definitions/.test(text)) forms.push("Definition");
    if (/state\b|statement|theorem/.test(text)) forms.push("Statement");
    if (/counterexample|disprove|what happens if|is it true/.test(text)) forms.push("Trap");
    if (/relation|compare|equivalent|characterize|which hypothesis/.test(text)) forms.push("Relations");
    return forms.length ? forms : ["Recall"];
  }

  function cleanBankQuestionText(text) {
    return String(text || "")
      .replace(/\s*\d+\s*=+\s*PAGE\s+\d+\s*=+\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escAttr(v) {
    return escHtml(String(v || "")).replace(/"/g, "&quot;");
  }

  function formatBankRefs(bankRef, bankTitle, tagClass) {
    if (!bankRef) return "";
    var refs = bankRef.match(/Q[12]\.\d+/g) || [];
    var cls = tagClass || "tag";
    return refs.map(function (ref) {
      var isCore = CORE_BANK_REFS.has(ref);
      var seen2026 = SEEN_2026_EXACT_REFS.has(ref);
      var title = bankTitle || ref;
      if (seen2026) title += " · seen in 2026; exact July repeat is penalized";
      return '<span class="' + cls + (isCore ? ' core-bank-ref' : '') + (seen2026 ? ' seen-2026-ref' : '') + '" title="' + escHtml(title) + '">' + ref + '</span>';
    }).join("");
  }

  function finalBadges(q, tagClass) {
    var cls = tagClass || "tag";
    var tier = q.finalTier || "D";
    var badges = [
      '<span class="' + cls + ' tier-' + tier + '" title="Final July 2026 cutoff tier">' + escHtml(TIER_LABELS[tier] || q.finalTier) + '</span>',
      '<span class="' + cls + ' score-tag" title="Final July 2026 score">Score ' + escHtml(String(q.finalScore || 0)) + '</span>',
      '<span class="' + cls + ' topic-tag" title="' + escAttr(q.finalFamily || "") + '">' + escHtml(q.finalTopicLabel || "Unscored") + '</span>'
    ];
    if (q.finalSeen2026) {
      badges.push('<span class="' + cls + ' suppressed-tag" title="' + escAttr(q.finalReason) + '">Seen 2026</span>');
    }
    if (q.finalReason && /July exact history/.test(q.finalReason)) {
      badges.push('<span class="' + cls + ' july-tag">July history</span>');
    }
    if (q.finalReason && /repeated core ID/.test(q.finalReason)) {
      badges.push('<span class="' + cls + ' core-tag">Core ID</span>');
    }
    q.finalForm.forEach(function (form) {
      badges.push('<span class="' + cls + ' form-tag">' + escHtml(form) + '</span>');
    });
    return badges.join("");
  }

  DATA.questions.forEach(function (q) {
    if (!q.finalForm) q.finalForm = inferQuestionForm(q);
  });

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


  function tierMatches(q, tierFilter) {
    if (!tierFilter || tierFilter === "focus") return q.finalTier === "A" || q.finalTier === "B";
    if (tierFilter === "all") return true;
    return q.finalTier === tierFilter;
  }

  function getQuestions(subject, priority, proof) {
    return ALL_QUESTIONS.filter(function (q) {
      if (q.subject !== subject) return false;
      if (!tierMatches(q, priority)) return false;
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
  const MOCK_SEEN_KEY = "rfa-mock-seen-v1";

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

  function getConfidenceEntry(id) {
    var conf = loadConfidence();
    return conf[id] || { score: 0, ts: 0 };
  }

  function retentionWeight(id) {
    var entry = getConfidenceEntry(id);
    var score = Number(entry.score || 0);
    if (!score) return 3.4;

    var elapsedHours = Math.max(0, (Date.now() - Number(entry.ts || 0)) / 36e5);
    var reviewInterval = score === 1 ? 4 : score === 2 ? 24 : 96;
    var due = Math.min(2.2, elapsedHours / reviewInterval);

    if (score === 1) return 3.2 + due;
    if (score === 2) return 1.45 + due;
    return 0.18 + due * 0.38;
  }

  function loadMockSeen() {
    try {
      return JSON.parse(localStorage.getItem(MOCK_SEEN_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function saveMockSeen(seen) {
    try {
      localStorage.setItem(MOCK_SEEN_KEY, JSON.stringify(seen));
    } catch (_) {}
  }

  function mockSeenCount(id) {
    var seen = loadMockSeen();
    return (seen[id] && seen[id].count) || 0;
  }

  function markMockSeen(ids) {
    var seen = loadMockSeen();
    ids.forEach(function (id) {
      if (!seen[id]) seen[id] = { count: 0, ts: 0 };
      seen[id].count += 1;
      seen[id].ts = Date.now();
    });
    saveMockSeen(seen);
  }

  function coverageWeight(id) {
    var count = mockSeenCount(id);
    if (count === 0) return 18;
    return 1 / Math.sqrt(count + 1);
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
    filter:  { subject: "measure", priority: "focus", proof: "all" },

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
    mockTimerInterval: null,
    mockTimerSeconds: 0,
    generatedMockExam: null,
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

    var tierCounts = { A: 0, B: 0, C: 0, D: 0 };
    FINAL_SCORES.forEach(function (row) {
      var tier = tierKey(row.tier);
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    });

    var topReal = FINAL_SCORES.filter(function (row) { return row.subject === "real" && (tierKey(row.tier) === "A" || tierKey(row.tier) === "B"); })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 6);
    var topFunctional = FINAL_SCORES.filter(function (row) { return row.subject === "functional" && (tierKey(row.tier) === "A" || tierKey(row.tier) === "B"); })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 6);

    function focusList(label, rows) {
      return '<div class="july-focus-list"><span class="july-focus-label">' + label + '</span>'
        + rows.map(function (row) {
          return '<span class="july-focus-pill" title="' + escAttr(cleanBankQuestionText(row.question)) + '">'
            + escHtml(row.qid + " · " + (TOPIC_LABELS[row.topic] || row.topic))
            + '</span>';
        }).join("")
        + '</div>';
    }

    var julyDashboard =
      '<section class="july-dashboard" aria-label="July 2026 scoring dashboard">'
      + '<div class="july-dashboard-head">'
      + '<span class="section-label">July 2026 model</span>'
      + '<p>Default focus is A+B. Suppressed cards are hidden unless you ask for them.</p>'
      + '</div>'
      + '<div class="july-tier-grid">'
      + '<div class="july-tier tier-A"><strong>A</strong><span>' + tierCounts.A + ' must-cover</span></div>'
      + '<div class="july-tier tier-B"><strong>B</strong><span>' + tierCounts.B + ' strong</span></div>'
      + '<div class="july-tier tier-C"><strong>C</strong><span>' + tierCounts.C + ' skim</span></div>'
      + '<div class="july-tier tier-D"><strong>D</strong><span>' + tierCounts.D + ' suppressed</span></div>'
      + '</div>'
      + focusList("Real slot", topReal)
      + focusList("Functional slots", topFunctional)
      + '</section>';

    statsEl.innerHTML = julyDashboard + statBlockHtml("Real Analysis", ms) + statBlockHtml("Functional Analysis", fs);

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
        // All subjects, filter by July tier/proof, scored 0 or 1 first, then 2
        pool = ALL_QUESTIONS.filter(function (q) {
          if (!tierMatches(q, priority)) return false;
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
      finalBadges(q, "tag")
      + '<span class="tag tag-stars">' + q.priority + '</span>'
      + (q.isProof
        ? '<span class="tag tag-proof">Proof</span>'
        : '<span class="tag tag-noProof">No proof</span>')
      + formatBankRefs(bankRef, q.bankRefFull || bankRef, "tag");

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
      + '<button type="button" data-browse-priority="focus" aria-pressed="true">A+B</button>'
      + '<button type="button" data-browse-priority="A" aria-pressed="false">A</button>'
      + '<button type="button" data-browse-priority="B" aria-pressed="false">B</button>'
      + '<button type="button" data-browse-priority="C" aria-pressed="false">C</button>'
      + '<button type="button" data-browse-priority="D" aria-pressed="false">Suppressed</button>'
      + '<button type="button" data-browse-priority="all" aria-pressed="false">All</button>'
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
        + ' data-q-tier="'     + q.finalTier + '"'
        + ' data-q-proof="'    + q.isProof + '"'
        + ' data-q-chapter="'  + chapter.replace(/"/g, "&quot;") + '"'
        + ' data-q-key="'      + key.replace(/"/g, "&quot;") + '">'

        + '<div class="browse-dot" data-score="' + sc + '"></div>'

        + '<details class="browse-details">'
        + '<summary class="browse-summary">'
        + '<span class="browse-summary-text">' + q.questionHtml + '</span>'
        + '<span class="browse-tags">'
        + finalBadges(q, "browse-tag")
        + '<span class="browse-tag">' + q.priority + '</span>'
        + (q.isProof ? '<span class="browse-tag proof">Proof</span>' : '')
        + formatBankRefs(bankRef, bankTitle, "browse-tag")
        + '</span>'
        + '</summary>'
        + '<div class="browse-score-note">Rank ' + q.finalRank + ' · ' + escHtml(q.finalReason || "") + '</div>'
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
    var priority = state.filter.priority !== undefined ? state.filter.priority : "focus";
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
      var qTier     = el.dataset.qTier;
      var qProof    = el.dataset.qProof;

      var visible =
        qSubject === subject &&
        (priority === "all" || (priority === "focus" ? (qTier === "A" || qTier === "B") : qTier === priority)) &&
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
      subtitle: "Highest-probability core: measurable functions, weak/weak-star, Hahn-Banach",
      rationale: "Uses the strongest July candidates from the conditional model and the 70-ID practical core. It avoids exact 2026 repeats and concentrates on high-frequency unused or neighboring clusters.",
      questions: [
        {
          title: "Measurable functions and closure traps",
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
          title: "Hahn-Banach corollaries and separation",
          points: 6,
          predictionTag: "Medium-high probability - unused 2026 core substitute for repeated Banach principles",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>State the continuous extension form of Hahn-Banach.</li>
              <li>State and prove the corollary saying that for \(x_0\ne0\) there exists \(L\in X^*\) with \(\|L\|=1\) and \(L(x_0)=\|x_0\|\).</li>
              <li>Explain why \(X^*\) separates points of \(X\).</li>
              <li>Define separation and strict separation by a hyperplane.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>If \(Y\subset X\) and \(f\in Y^*\), Hahn-Banach gives \(F\in X^*\) with \(F|_Y=f\) and \(\|F\|=\|f\|\).</li>
              <li>Let \(Y=\operatorname{span}\{x_0\}\), and define \(f(\alpha x_0)=\alpha\|x_0\|\). Then \(\|f\|=1\). Extend \(f\) to \(L\in X^*\) with the same norm. Then \(L(x_0)=\|x_0\|\) and \(\|L\|=1\).</li>
              <li>If \(x\ne y\), apply the previous corollary to \(x-y\). There is \(L\in X^*\) with \(L(x-y)\ne0\), hence \(L(x)\ne L(y)\).</li>
              <li>A hyperplane \(\{L=\alpha\}\) separates \(A,B\) if \(L(a)\le\alpha\le L(b)\). It strictly separates them if there is a positive gap, for instance \(L(a)\le\alpha-\varepsilon\lt\alpha+\varepsilon\le L(b)\).</li>
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
      subtitle: "Convergence modes plus compact/spectral functional analysis",
      rationale: "This mock follows the practical-core signal while suppressing exact 2026 repeats: convergence modes are high-value and unused in 2026, Fredholm/spectral is a July-seasonal compact-Hilbert cluster, and finite-rank compactness is a neighboring compact-operator variant rather than the exact February compact-surjectivity question.",
      questions: [
        {
          title: "Convergence in measure, \(L^1\), and counterexamples",
          points: 8,
          predictionTag: "High probability - core IDs absent from 2026 and July-seasonal",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>Define pointwise convergence, almost everywhere convergence, convergence in measure, and \(L^1\)-convergence.</li>
              <li>Assume \(\mu(X)\lt\infty\). Prove that a.e. convergence implies convergence in measure.</li>
              <li>Give a counterexample showing the finite-measure hypothesis is necessary.</li>
              <li>Prove that \(L^1\)-convergence implies convergence in measure.</li>
              <li>Give counterexamples showing that convergence in measure does not imply \(L^1\)-convergence and does not imply a.e. convergence of the full sequence.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>The definitions are: pointwise for every \(x\), a.e. outside a null set, in measure if \(\mu(\{|f_n-f|\gt\varepsilon\})\to0\) for every \(\varepsilon\gt0\), and in \(L^1\) if \(\int|f_n-f|\,d\mu\to0\).</li>
              <li>Fix \(\varepsilon\gt0\) and set \(E_n=\bigcup_{k\ge n}\{|f_k-f|\gt\varepsilon\}\). Then \(E_n\downarrow E\), where \(E\) is contained in the null set of non-convergence. Since \(\mu(E_1)\lt\infty\), continuity from above gives \(\mu(E_n)\to0\), hence \(\mu(\{|f_n-f|\gt\varepsilon\})\to0\).</li>
              <li>On \(\mathbb R\), \(f_n=\chi_{[n,n+1]}\) converges pointwise to \(0\), but \(\lambda(\{|f_n|\gt1/2\})=1\), so not in measure.</li>
              <li>By Chebyshev,
                <div class="formula">\[
                \mu(\{|f_n-f|\gt\varepsilon\})\le \frac1\varepsilon\int |f_n-f|\,d\mu\to0.
                \]</div></li>
              <li>For measure but not \(L^1\), take \(f_n=n\chi_{(0,1/n)}\) on \((0,1)\). For measure but not a.e. full-sequence convergence, use the typewriter sequence on \([0,1]\).</li>
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
          title: "Compact operators through finite-rank approximation",
          points: 4,
          predictionTag: "Medium probability - neighboring compact core, not exact February repeat",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>Define compact operator and finite-rank operator.</li>
              <li>Prove that every finite-rank operator is compact.</li>
              <li>State and prove that an operator-norm limit of compact operators is compact.</li>
              <li>Apply this to a diagonal operator \(T:\ell^2\to\ell^2\), \(T(x_k)=(a_kx_k)\), when \(a_k\to0\).</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>\(T:X\to Y\) is compact if it maps bounded sets into relatively compact sets. It has finite rank if \(\dim T(X)\lt\infty\).</li>
              <li>If \(B\subset X\) is bounded, then \(T(B)\) is bounded in the finite-dimensional space \(T(X)\), hence relatively compact.</li>
              <li>Let \(T_n\to T\) in norm and let \((x_k)\) be bounded. Use compactness of \(T_1,T_2,\ldots\) and a diagonal subsequence so each \(T_Nx_{k_j}\) converges. Then \(\|T-T_N\|\to0\) makes \(Tx_{k_j}\) Cauchy, hence convergent.</li>
              <li>Let \(T_N(x_1,x_2,\dots)=(a_1x_1,\dots,a_Nx_N,0,\dots)\). Then \(T_N\) is finite rank and
                <div class="formula">\[
                \|T-T_N\|=\sup_{k>N}|a_k|\to0.
                \]</div>
                Hence \(T\) is compact.</li>
            </ol>`
        }
      ]
    },
    {
      title: "Predicted July 2026 Theory Mock 3",
      subtitle: "Controlled-randomness core: AC/FTC, Hilbert projection, \(L^p\)",
      rationale: "This is the pattern-break mock. It still stays inside the 70-ID practical core, but it spends one slot on lower-frequency core material. The real-analysis question targets the high-value AC/FTC cluster; the functional questions hedge with Hilbert projection and \(L^p\)/Holder material instead of repeating weak-star, Hahn-Banach, or Fredholm.",
      questions: [
        {
          title: "Lebesgue points, absolutely continuous functions, and \(W^{1,1}\)",
          points: 7,
          predictionTag: "Medium-high probability - core cluster, absent from 2026 theory",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>Define Lebesgue point and state what can be said about non-Lebesgue points of \(f\in L^1_{\mathrm{loc}}\).</li>
              <li>State and prove the first Fundamental Theorem of Calculus for \(f\in L^1(a,b)\).</li>
              <li>Define absolutely continuous function.</li>
              <li>State the characterization of absolutely continuous functions by integration against an \(L^1\)-derivative.</li>
              <li>State the relation between \(W^{1,1}(a,b)\) and \(AC([a,b])\), being precise about representatives.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>\(x\) is a Lebesgue point of \(f\) if
                <div class="formula">\[
                \lim_{r\downarrow0}\frac1{2r}\int_{x-r}^{x+r}|f(t)-f(x)|\,dt=0.
                \]</div>
                Almost every point is a Lebesgue point.</li>
              <li>For \(F(x)=\int_a^x f(t)\,dt\), at every Lebesgue point \(x\),
                <div class="formula">\[
                \frac{F(x+h)-F(x)}h-f(x)=\frac1h\int_x^{x+h}(f(t)-f(x))\,dt\to0.
                \]</div>
                Hence \(F'=f\) a.e.</li>
              <li>\(u\) is absolutely continuous if small total length of finitely many disjoint intervals forces small total oscillation of \(u\) on those intervals.</li>
              <li>\(u\in AC([a,b])\) iff there exists \(v\in L^1(a,b)\) such that \(u(x)=u(a)+\int_a^xv(t)\,dt\). Then \(v=u'\) a.e.</li>
              <li>Every \(W^{1,1}\) class has an absolutely continuous representative, and every absolutely continuous function with derivative in \(L^1\) belongs to \(W^{1,1}\). The statement is about representatives, not arbitrary pointwise versions.</li>
            </ol>`
        },
        {
          title: "Hilbert projection theorem and Riesz representation",
          points: 6,
          predictionTag: "Medium controlled-randomness - core Hilbert family, avoids exact 2026 Riesz-only repeat",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>State and prove the projection theorem on a closed convex subset of a Hilbert space.</li>
              <li>State the projection theorem corollary for a closed subspace \(M\subset H\).</li>
              <li>Use the corollary to outline the proof of the Riesz representation theorem in Hilbert spaces.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>If \(C\subset H\) is nonempty, closed, and convex, then for every \(x\in H\) there exists a unique \(p\in C\) minimizing \(\|x-p\|\). Existence follows from a minimizing sequence and the parallelogram identity; uniqueness follows from strict convexity of the Hilbert norm.</li>
              <li>If \(M\) is a closed subspace, every \(x\in H\) decomposes uniquely as \(x=m+z\), with \(m\in M\) and \(z\in M^\perp\).</li>
              <li>For \(F\in H^*\), if \(F\ne0\), then \(\ker F\) is a closed proper subspace. Decompose \(H=\ker F\oplus(\ker F)^\perp\), choose \(z_0\in(\ker F)^\perp\), and show every \(x\) satisfies \(F(x)=\langle x,y\rangle\) for a suitable \(y\in H\). Uniqueness follows by testing against the difference of two representing vectors.</li>
            </ol>`
        },
        {
          title: "\(L^p\) core inequalities and completeness",
          points: 5,
          predictionTag: "Lower-probability random core - one controlled surprise slot",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>Define conjugate exponents and state Holder's inequality.</li>
              <li>Prove Holder's inequality from Young's inequality.</li>
              <li>State Minkowski's inequality.</li>
              <li>State the completeness theorem for \(L^p\) spaces.</li>
              <li>Explain why this slot is lower probability but still belongs to the practical core.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>\(p,q\in[1,\infty]\) are conjugate if \(1/p+1/q=1\). Holder says
                <div class="formula">\[
                \|fg\|_1\le \|f\|_p\|g\|_q.
                \]</div></li>
              <li>Normalize so \(\|f\|_p=\|g\|_q=1\). Young's inequality gives \(|fg|\le |f|^p/p+|g|^q/q\). Integrating gives Holder; rescale for the general case.</li>
              <li>Minkowski says \(\|f+g\|_p\le\|f\|_p+\|g\|_p\), so \(\|\cdot\|_p\) is a norm for \(p\ge1\).</li>
              <li>For \(1\le p\le\infty\), \(L^p\) is complete, hence a Banach space.</li>
              <li>It is lower probability because \(L^p\)-inequality questions are less frequent than weak-star or convergence modes, but \(Q2.17\) and \(Q2.22\) are in the flagged core and give useful controlled randomness.</li>
            </ol>`
        }
      ]
    },
    {
      title: "Predicted July 2026 Theory Mock 4",
      subtitle: "Core hedge: Caratheodory plus Banach-principle neighbors",
      rationale: "This mock uses the analysis file's core-bank hedge logic: Caratheodory/outer-measure is a recurring but not top July cluster, while the functional slots cover neighboring Banach-principle material without repeating the exact 2026 Open Mapping/Closed Graph package.",
      questions: [
        {
          title: "Outer measure and Caratheodory construction",
          points: 7,
          predictionTag: "Medium hedge - recurring core cluster absent from 2026",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>Define outer measure.</li>
              <li>State the Caratheodory condition and explain why it is enough to prove one inequality.</li>
              <li>Prove that every set of outer measure zero is Caratheodory measurable.</li>
              <li>State Caratheodory's theorem about the measurable sets of an outer measure.</li>
              <li>Describe the construction of Lebesgue measure from \(\lambda^*\) on \(\mathbb R\).</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>An outer measure \(\mu^*\) on \(X\) satisfies \(\mu^*(\varnothing)=0\), monotonicity, and countable subadditivity.</li>
              <li>\(E\subset X\) is measurable if for every \(A\subset X\),
                <div class="formula">\[
                \mu^*(A)=\mu^*(A\cap E)+\mu^*(A\setminus E).
                \]</div>
                Subadditivity gives \(\le\), so the content is proving \(\ge\).</li>
              <li>If \(\mu^*(E)=0\), then \(\mu^*(A\cap E)=0\), while \(\mu^*(A\setminus E)\le\mu^*(A)\). Together with subadditivity this gives equality.</li>
              <li>The Caratheodory measurable sets form a \(\sigma\)-algebra, and \(\mu^*\) restricted to it is a complete measure.</li>
              <li>\(\lambda^*(E)\) is the infimum of sums of interval lengths over countable interval covers of \(E\). Lebesgue measurable sets are the Caratheodory measurable sets for \(\lambda^*\), and \(\lambda\) is the restriction of \(\lambda^*\).</li>
            </ol>`
        },
        {
          title: "Baire and Banach-Steinhaus as a neighboring repeat",
          points: 6,
          predictionTag: "Low-to-medium exact, medium family - one allowed repeat-risk slot",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>State Baire's theorem in a complete metric space.</li>
              <li>Define pointwise boundedness and uniform boundedness for a family \(\mathcal F\subset L(X,Y)\).</li>
              <li>State and prove the Banach-Steinhaus theorem.</li>
              <li>Explain why this is a repeat-risk question after January 2026, but still belongs in one coverage mock.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>In a complete metric space, a countable union of closed sets with empty interior cannot be the whole space.</li>
              <li>Pointwise bounded means \(\sup_{T\in\mathcal F}\|Tx\|\lt\infty\) for every fixed \(x\). Uniform boundedness means \(\sup_{T\in\mathcal F}\|T\|\lt\infty\).</li>
              <li>Let
                <div class="formula">\[
                E_n=\{x\in X:\|Tx\|\le n\ \forall T\in\mathcal F\}.
                \]</div>
                The \(E_n\) are closed and cover \(X\). By Baire, some \(E_N\) contains a ball. Linearity and translation from that ball give a global bound on \(\|Tx\|\), uniformly in \(T\), hence \(\sup_T\|T\|\lt\infty\).</li>
              <li>The exact ID appeared in January 2026, so the analysis suppresses it as a top exact July target. It remains a core theorem and a plausible low-probability repeat component, especially because later-year exams sometimes include one recycled ID.</li>
            </ol>`
        },
        {
          title: "Equivalent norms through the bounded inverse theorem",
          points: 5,
          predictionTag: "Medium hedge - core neighbor of 2026 Banach theorem package",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>State the Bounded Inverse Theorem.</li>
              <li>Let \(X\) carry two norms \(\|\cdot\|_1\), \(\|\cdot\|_2\), both making \(X\) Banach. Prove that if \(\|x\|_2\le C\|x\|_1\), then the two norms are equivalent.</li>
              <li>Explain the role of completeness in the proof.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>If \(X,Y\) are Banach spaces and \(T:X\to Y\) is a bijective bounded linear map, then \(T^{-1}\) is bounded.</li>
              <li>The identity
                <div class="formula">\[
                I:(X,\|\cdot\|_1)\to(X,\|\cdot\|_2)
                \]</div>
                is bounded by the assumed inequality and is bijective. By the bounded inverse theorem, \(I^{-1}\) is bounded, so \(\|x\|_1\le C'\|x\|_2\). Thus the norms are equivalent.</li>
              <li>Completeness is needed because the bounded inverse theorem is a Banach-space theorem; without completeness, a bijective bounded linear map need not have bounded inverse.</li>
            </ol>`
        }
      ]
    },
    {
      title: "Predicted July 2026 Theory Mock 5",
      subtitle: "Coverage extender: convergence theorems, separability, operator basics",
      rationale: "This is the broadest coverage mock. It uses the analysis file's practical core but intentionally spends more probability mass on medium/lower-frequency core IDs so the five-mock set is not just repeated weak-star, convergence modes, and compact spectrum.",
      questions: [
        {
          title: "Fatou, monotone convergence, and dominated convergence",
          points: 7,
          predictionTag: "Medium probability - core theorem family, absent from 2026 theory",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>State the Monotone Convergence Theorem.</li>
              <li>State and prove Fatou's Lemma.</li>
              <li>State the Dominated Convergence Theorem.</li>
              <li>Prove the Dominated Convergence Theorem using Fatou's Lemma.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>If \(0\le f_n\uparrow f\), then \(\int f_n\,d\mu\uparrow\int f\,d\mu\).</li>
              <li>For \(f_n\ge0\), Fatou says
                <div class="formula">\[
                \int\liminf_n f_n\,d\mu\le\liminf_n\int f_n\,d\mu.
                \]</div>
                Put \(g_k=\inf_{n\ge k}f_n\). Then \(g_k\uparrow\liminf f_n\), and \(g_k\le f_n\) for \(n\ge k\). Apply MCT and compare with tail infima.</li>
              <li>If \(f_n\to f\) a.e. and \(|f_n|\le g\in L^1\), then \(f\in L^1\), \(\int|f_n-f|\to0\), and \(\int f_n\to\int f\).</li>
              <li>Apply Fatou to \(2g-|f_n-f|\ge0\). Since the pointwise limit is \(2g\),
                <div class="formula">\[
                \int2g\le\liminf_n\int(2g-|f_n-f|)
                =\int2g-\limsup_n\int|f_n-f|.
                \]</div>
                Hence the limsup of the error integrals is \(0\).</li>
            </ol>`
        },
        {
          title: "Separability of \(C^0([a,b])\) and the Hahn-Banach separability criterion",
          points: 6,
          predictionTag: "Controlled randomness - core but less frequent",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>Define separable metric space.</li>
              <li>Prove that \(C^0([a,b])\) is separable with the uniform norm.</li>
              <li>State the sufficient condition for separability involving \(X^*\).</li>
              <li>Explain why this is included as a lower-probability coverage slot.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>A metric space is separable if it contains a countable dense subset.</li>
              <li>By Weierstrass, polynomials are dense in \(C^0([a,b])\). Polynomials with rational coefficients are countable and still dense, because real coefficients can be approximated by rational coefficients uniformly on \([a,b]\).</li>
              <li>A standard Hahn-Banach consequence is: if \(X^*\) is separable, then \(X\) is separable. Let \((f_n)\) be dense in \(X^*\). For each nonzero \(f_n\), choose \(x_{n,k}\) with \(\|x_{n,k}\|=1\) and \(|f_n(x_{n,k})|\ge \|f_n\|-1/k\). Let \(Y\) be the closed linear span of these countably many points. If \(Y\ne X\), Hahn-Banach gives \(0\ne f\in X^*\) with \(f|_Y=0\). Approximate \(f\) by some \(f_n\); the choice of \(x_{n,k}\in Y\) gives \(\|f_n\|\) small, contradicting \(f_n\approx f\ne0\). Hence \(Y=X\), so \(X\) is separable.</li>
              <li>The ID-level analysis flags \(Q2.46\) as occasional but real, and July 2024 used a separability slot. It is not top probability, but it is a good fifth-mock hedge.</li>
            </ol>`
        },
        {
          title: "Bounded linear operators and operator norm",
          points: 5,
          predictionTag: "Low-probability core foundation - useful if the professor chooses definitions",
          statementHtml: String.raw`
            <ol class="mock-subparts">
              <li>Define linear operator, bounded operator, continuous operator, functional, and dual space.</li>
              <li>Prove that a linear operator between normed spaces is continuous if and only if it is bounded.</li>
              <li>Define the operator norm and state its equivalent formulas.</li>
              <li>State when \(L(X,Y)\) is Banach.</li>
            </ol>`,
          solutionHtml: String.raw`
            <ol>
              <li>A bounded linear operator satisfies \(\|Tx\|_Y\le C\|x\|_X\). A functional is scalar-valued; \(X^*\) is the space of continuous linear functionals.</li>
              <li>Boundedness gives Lipschitz continuity. Conversely, if \(T\) is continuous at \(0\), there is \(\delta\gt0\) such that \(\|x\|\le\delta\Rightarrow\|Tx\|\le1\). Scaling gives \(\|Tx\|\le\delta^{-1}\|x\|\).</li>
              <li>
                <div class="formula">\[
                \|T\|=\sup_{\|x\|\le1}\|Tx\|=\sup_{\|x\|=1}\|Tx\|=\sup_{x\ne0}\frac{\|Tx\|}{\|x\|}.
                \]</div></li>
              <li>If \(X\) is normed and \(Y\) is Banach, then \(L(X,Y)\) is Banach with the operator norm.</li>
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
    if (q.bankItems) {
      q.bankItems.forEach(function (item) { refreshMockRecallControls(item.id); });
    }

    var reveal = document.getElementById("btn-mock-reveal");
    if (reveal) reveal.disabled = true;
  }

  // ═══════════════════════════════════════════════════
  //  RANDOM THEORY MOCK GENERATOR
  // ═══════════════════════════════════════════════════

  var THEORY_POINT_SCHEMES = [
    [5, 5, 8],
    [8, 6, 4],
    [7, 6, 5]
  ];

  var THEORY_SLOT_RULES = [
    {
      subject: "measure",
      label: "Question 1",
      role: "Real Analysis",
      statementBias: 0.62,
      templates: [
        "definitions and statements",
        "theorem plus proof",
        "definition bundle with one trap"
      ]
    },
    {
      subject: "functional",
      label: "Question 2",
      role: "Functional Analysis",
      statementBias: 0.54,
      templates: [
        "definitions and statements",
        "theorem plus proof",
        "operator or duality package"
      ]
    },
    {
      subject: "functional",
      label: "Question 3",
      role: "Functional Analysis",
      statementBias: 0.42,
      templates: [
        "heavier proof theorem",
        "statement bundle",
        "relationship theorem"
      ]
    }
  ];

  function randomInt(max) {
    return Math.floor(Math.random() * max);
  }

  function sampleOne(items) {
    return items[randomInt(items.length)];
  }

  function scoreWeight(q) {
    var tier = tierKey(q.finalTier);
    var score = Number(q.finalScore || 0);
    var weight = tier === "A" ? 9 : tier === "B" ? 5 : tier === "C" ? 2 : 0;
    weight += Math.min(6, Math.max(0, score / 5));
    if (q.finalSeen2026) weight *= 0.42;
    if (q.isProof) weight *= 1.18;
    if (q.finalReason && /July exact history/.test(q.finalReason)) weight *= 1.25;
    weight *= retentionWeight(q.id);
    weight *= coverageWeight(q.id);
    return Math.max(1, Math.round(weight));
  }

  function weightedPick(pool, usedIds, preferProof) {
    var weighted = [];
    pool.forEach(function (q) {
      if (usedIds.has(q.id)) return;
      var w = scoreWeight(q);
      if (preferProof && q.isProof) w *= 2;
      if (!preferProof && !q.isProof) w *= 2;
      for (var i = 0; i < w; i++) weighted.push(q);
    });
    return weighted.length ? sampleOne(weighted) : null;
  }

  function siblingPool(anchor, allPool, usedIds) {
    var topic = anchor.finalTopic;
    var chapter = anchor.chapter;
    return allPool.filter(function (q) {
      return q.id !== anchor.id
        && !usedIds.has(q.id)
        && (q.finalTopic === topic || q.chapter === chapter);
    });
  }

  function stripQuestionHtml(html) {
    var div = document.createElement("div");
    div.innerHTML = html || "";
    return div.textContent.replace(/\s+/g, " ").trim();
  }

  function chooseSubparts(slot, points, usedIds) {
    var allPool = ALL_QUESTIONS.filter(function (q) {
      var tier = tierKey(q.finalTier);
      return q.subject === slot.subject && (tier === "A" || tier === "B" || tier === "C");
    });
    var preferProof = points >= 7 || Math.random() > slot.statementBias;
    var unseenPool = allPool.filter(function (q) { return mockSeenCount(q.id) === 0; });
    var anchorPool = unseenPool.length && Math.random() < 0.82 ? unseenPool : allPool;
    var anchor = weightedPick(anchorPool, usedIds, preferProof) || weightedPick(allPool, usedIds, false);
    if (!anchor) return [];

    var count = points >= 8 ? 3 : points >= 6 ? 2 + randomInt(2) : 1 + randomInt(2);
    if (preferProof && anchor.isProof && points >= 7) count = Math.max(1, count - 1);

    var picked = [anchor];
    usedIds.add(anchor.id);

    var siblings = siblingPool(anchor, allPool, usedIds);
    while (picked.length < count) {
      var unseenSiblings = siblings.filter(function (q) { return mockSeenCount(q.id) === 0; });
      var fallbackUnseen = allPool.filter(function (q) { return !usedIds.has(q.id) && mockSeenCount(q.id) === 0; });
      var candidatePool = unseenSiblings.length ? unseenSiblings : siblings.length ? siblings : fallbackUnseen.length ? fallbackUnseen : allPool;
      var next = weightedPick(candidatePool, usedIds, false);
      if (!next) break;
      picked.push(next);
      usedIds.add(next.id);
      siblings = siblingPool(anchor, allPool, usedIds);
    }

    return picked;
  }

  function questionInstruction(items, points) {
    var hasProof = items.some(function (q) { return q.isProof; });
    if (hasProof && points >= 7) {
      return "State precisely and prove the requested result. Provide all relevant definitions.";
    }
    if (hasProof) {
      return "Answer all items. Proofs are required only where explicitly requested.";
    }
    return "Write the requested definitions and statements. No proofs are required unless explicitly asked.";
  }

  function generatedTitle(items, slot) {
    var topic = items[0] && (items[0].finalTopicLabel || TOPIC_LABELS[items[0].finalTopic]);
    if (items.length === 1) return topic || slot.role;
    return (topic || slot.role) + " package";
  }

  function renderGeneratedStatement(items, points) {
    var allocation = Math.max(1, Math.floor(points / Math.max(1, items.length)));
    return '<p>' + questionInstruction(items, points) + '</p>'
      + '<ol class="mock-subparts">'
      + items.map(function (q, i) {
        var pts = i === items.length - 1
          ? points - allocation * (items.length - 1)
          : allocation;
        var refs = bankRefsOf(q);
        var refHtml = refs.length
          ? '<span class="mock-bank-ref-inline">' + refs.map(escHtml).join(" · ") + '</span> '
          : "";
        return '<li>' + refHtml + q.questionHtml + ' <span class="mock-subpoints">[' + pts + ' pts]</span>'
          + mockRecallControls(q)
          + '</li>';
      }).join("")
      + '</ol>';
  }

  function mockRecallControls(q) {
    var score = getScore(q.id);
    return '<div class="mock-recall-controls" data-recall-id="' + escAttr(q.id) + '">'
      + '<span class="mock-recall-label">Recall level</span>'
      + [1, 2, 3].map(function (level) {
        var label = level === 1 ? "1 repeat" : level === 2 ? "2 medium" : "3 mastered";
        return '<button type="button" data-mock-recall-score="' + level + '" aria-pressed="' + String(score === level) + '">' + label + '</button>';
      }).join("")
      + '</div>';
  }

  function refreshMockRecallControls(id) {
    var score = getScore(id);
    document.querySelectorAll('[data-recall-id="' + id + '"] [data-mock-recall-score]').forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(Number(btn.dataset.mockRecallScore) === score));
    });
  }

  function saveMockRecallScore(id, score) {
    setScore(id, score);
    refreshMockRecallControls(id);
  }

  function renderGeneratedSolution(items) {
    return items.map(function (q, i) {
      return '<section class="mock-bank-solution" data-bank-solution="' + escAttr(q.id) + '">'
        + '<div class="mock-bank-heading">'
        + '<span>Bank item ' + (i + 1) + '</span>'
        + '<button type="button" class="btn-text mock-bank-open" data-open-bank-question="' + escAttr(q.id) + '">Open as recall card</button>'
        + '</div>'
        + '<div class="mock-bank-question">' + q.questionHtml + '</div>'
        + '<div class="mock-bank-tags">'
        + finalBadges(q, "browse-tag")
        + '<span class="browse-tag">' + escHtml(q.priority || "") + '</span>'
        + formatBankRefs(q.bankRef || "", q.bankRefFull || q.bankRef || "", "browse-tag")
        + '</div>'
        + mockRecallControls(q)
        + '<div class="answer-body">' + q.answerHtml + '</div>'
        + '</section>';
    }).join("");
  }

  function generateTheoryMockExam() {
    var scheme = sampleOne(THEORY_POINT_SCHEMES);
    var usedIds = new Set();
    var questions = THEORY_SLOT_RULES.map(function (slot, i) {
      var items = chooseSubparts(slot, scheme[i], usedIds);
      return {
        title: generatedTitle(items, slot),
        points: scheme[i],
        predictionTag: slot.role + " · randomized A/B/C bank · " + (items.length > 1 ? "bundled" : "single theorem"),
        statementHtml: renderGeneratedStatement(items, scheme[i]),
        solutionHtml: renderGeneratedSolution(items),
        bankItems: items
      };
    });
    markMockSeen(Array.from(usedIds));

    return {
      title: "Generated July 2026 Theory Mock",
      subtitle: "Randomized from A/B/C scored bank items in the 2026 three-question format",
      rationale: "This paper uses the observed 2026 theory structure: three holistic questions, 18 total points, one Real Analysis slot and two Functional Analysis slots. Bundles may combine related bank items, as in the real papers.",
      questions: questions
    };
  }

  function mockCoverageStats() {
    var abc = ALL_QUESTIONS.filter(function (q) {
      var tier = tierKey(q.finalTier);
      return tier === "A" || tier === "B" || tier === "C";
    });
    var covered = abc.filter(function (q) { return mockSeenCount(q.id) > 0; }).length;
    return { covered: covered, total: abc.length };
  }

  function formatMockTimer(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function stopMockTimer() {
    if (state.mockTimerInterval) {
      clearInterval(state.mockTimerInterval);
      state.mockTimerInterval = null;
    }
  }

  function resetMockTimer() {
    stopMockTimer();
    state.mockTimerSeconds = 0;
    var display = document.getElementById("mock-timer-display");
    if (display) display.textContent = formatMockTimer(0);
  }

  function startMockTimer() {
    if (state.mockTimerInterval) return;
    state.mockTimerInterval = setInterval(function () {
      state.mockTimerSeconds += 1;
      var display = document.getElementById("mock-timer-display");
      if (display) display.textContent = formatMockTimer(state.mockTimerSeconds);
    }, 1000);
  }

  function openBankQuestionFromMock(id) {
    var q = ALL_QUESTIONS.find(function (item) { return item.id === id; });
    if (!q) return;
    stopMockTimer();
    state.queue = [q];
    state.queueIndex = 0;
    state.sessionScores = [];
    showView("practice");
    loadQuestion(0);
  }

  function startMockExam(mockSet) {
    state.mockSet = mockSet || "theory";
    state.mockRevealed = false;
    state.mockExerciseIndex = 0;
    resetMockTimer();

    if (state.mockSet === "theory") {
      if (!state.generatedMockExam) {
        state.generatedMockExam = generateTheoryMockExam();
      }
      renderGeneratedMockPaper();
    } else {
      state.mockQuestions = getActiveMockSet().exams[0].questions;
      renderMockPaper(0);
    }
    showView("mock");
  }

  function renderGeneratedMockPaper() {
    var wrap = document.getElementById("mock-wrap");
    var exam = state.generatedMockExam || generateTheoryMockExam();
    var today = new Date();
    var dateStr = today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    state.generatedMockExam = exam;
    state.mockQuestions = exam.questions;
    state.mockRevealed = false;
    state.mockExerciseIndex = 0;

    var questionsHtml = exam.questions.map(function (q, i) {
      return '<div class="mock-question-block" data-mock-idx="' + i + '">'
        + '<div class="mock-q-meta">' + q.predictionTag + '</div>'
        + '<h2 class="mock-q-heading">Question ' + (i + 1) + '. ' + q.title + ' <span class="mock-pts">[' + q.points + ' points]</span></h2>'
        + '<div class="mock-q-text">' + q.statementHtml + '</div>'
        + '<div class="mock-answer-space">'
        + '<textarea placeholder="Write your exam answer here (optional)..." rows="7" aria-label="Answer notes for question ' + (i + 1) + '"></textarea>'
        + '</div>'
        + '<div class="mock-revealed-answer" id="mock-answer-' + i + '" hidden></div>'
        + '</div>';
    }).join("");

    var scoreHeaders = exam.questions.map(function (_, i) {
      return '<div class="mock-score-cell header">Q' + (i + 1) + '</div>';
    }).join("") + '<div class="mock-score-cell header">Total</div>';
    var scoreValues = exam.questions.map(function (q) {
      return '<div class="mock-score-cell value">' + q.points + '</div>';
    }).join("") + '<div class="mock-score-cell value">18</div>';
    var coverage = mockCoverageStats();

    wrap.innerHTML =
      '<div class="mock-generator-bar">'
      + '<button type="button" class="btn-primary" id="btn-generate-theory-mock">Generate new mock</button>'
      + '<button type="button" class="btn-secondary" id="btn-mock-timer">Start timer</button>'
      + '<span class="mock-timer" id="mock-timer-display">00:00</span>'
      + '<button type="button" class="btn-secondary" id="btn-mock-reset-timer">Reset</button>'
      + '<span class="mock-coverage-pill" title="Distinct A/B/C bank items that have appeared in generated mock papers on this browser">Generated bank items ' + coverage.covered + ' / ' + coverage.total + '</span>'
      + '</div>'
      + '<div class="mock-paper">'
      + '<div class="mock-letterhead">'
      + '<div class="mock-uni">Politecnico di Milano, Mathematical Engineering</div>'
      + '<div class="mock-course">Real and Functional Analysis</div>'
      + '<div class="mock-date">Generated July 2026 theory mock · ' + dateStr + '</div>'
      + '<h1 class="mock-title">' + exam.title + '</h1>'
      + '<p class="mock-subtitle">' + exam.subtitle + '</p>'
      + '<p class="mock-rationale">' + exam.rationale + '</p>'
      + '<div class="mock-score-row">' + scoreHeaders + scoreValues + '</div>'
      + '</div>'
      + '<div class="mock-body">'
      + '<div class="mock-instructions">Three theory questions, 18 total points. Answers must be written only under the text and on the back. Use this as timed recall; reveal solutions only after attempting the question.</div>'
      + questionsHtml
      + '</div>'
      + '<div class="mock-actions" id="mock-actions-bar">'
      + '<button class="btn-secondary" id="btn-mock-prev">Previous question</button>'
      + '<span class="mock-page-counter" id="mock-page-counter">Question 1 / 3</span>'
      + '<button class="btn-secondary" id="btn-mock-next">Next question</button>'
      + '<button class="btn-primary" id="btn-mock-reveal">Reveal linked solutions</button>'
      + '</div>'
      + '</div>';

    document.getElementById("btn-generate-theory-mock").addEventListener("click", function () {
      state.generatedMockExam = generateTheoryMockExam();
      resetMockTimer();
      renderGeneratedMockPaper();
    });
    document.getElementById("btn-mock-timer").addEventListener("click", function () {
      var btn = document.getElementById("btn-mock-timer");
      if (state.mockTimerInterval) {
        stopMockTimer();
        btn.textContent = "Resume timer";
      } else {
        startMockTimer();
        btn.textContent = "Pause timer";
      }
    });
    document.getElementById("btn-mock-reset-timer").addEventListener("click", resetMockTimer);
    document.getElementById("btn-mock-reveal").addEventListener("click", function () {
      revealMockAnswer(state.mockExerciseIndex);
    });
    document.getElementById("btn-mock-prev").addEventListener("click", function () {
      showMockExercise(state.mockExerciseIndex - 1);
    });
    document.getElementById("btn-mock-next").addEventListener("click", function () {
      showMockExercise(state.mockExerciseIndex + 1);
    });
    wrap.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-open-bank-question]");
      if (btn) {
        openBankQuestionFromMock(btn.dataset.openBankQuestion);
        return;
      }
      var recallBtn = event.target.closest("[data-mock-recall-score]");
      if (recallBtn) {
        var holder = recallBtn.closest("[data-recall-id]");
        if (holder) saveMockRecallScore(holder.dataset.recallId, Number(recallBtn.dataset.mockRecallScore));
      }
    });

    state.mockQuestions.forEach(function (_, i) {
      var el = wrap.querySelector('[data-mock-idx="' + i + '"] .mock-q-text');
      if (el) typeset(el);
    });
    typeset(wrap.querySelector(".mock-letterhead"));
    showMockExercise(0);
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
        case "mock":           stopMockTimer(); showView("home"); renderHome(); break;
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
