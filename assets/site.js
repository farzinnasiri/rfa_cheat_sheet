(function () {
  const STORAGE_KEY = "rfa-theme";
  const root = document.documentElement;
  const frames = document.querySelectorAll(".checklist-frame");
  const themeButtons = document.querySelectorAll("[data-theme-choice]");
  const headerFilter = document.querySelector(".topbar-filter");
  const headerFilterButtons = headerFilter ? headerFilter.querySelectorAll("button") : [];
  const markdownBlockPattern = /(^|\n)\s*(?:\d+\.|-)\s+|(?:^|\s)\d+\.\s+\*\*|\*\*/;
  let mathTypesetStarted = false;
  let filterState = { priority: "all", proof: "all" };

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderInlineMarkdown(value) {
    const mathSegments = [];
    const protectedValue = value.replace(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g, function (match) {
      const token = "\u0000MATH" + mathSegments.length + "\u0000";
      mathSegments.push(match);
      return token;
    });

    return escapeHtml(protectedValue)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
      .replace(/\u0000MATH(\d+)\u0000/g, function (_, index) {
        return escapeHtml(mathSegments[Number(index)]);
      });
  }

  function splitLegacyMarkdownLines(value) {
    return value
      .replace(/\s+(\d+\.\s+\*\*)/g, "\n$1")
      .replace(/\s+(-\s+\*\*)/g, "\n$1")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function appendParagraph(fragment, text) {
    const paragraph = document.createElement("p");
    paragraph.innerHTML = renderInlineMarkdown(text);
    fragment.appendChild(paragraph);
  }

  function renderLegacyMarkdownBlock(value) {
    const fragment = document.createDocumentFragment();
    let orderedList = null;
    let unorderedList = null;
    let currentOrderedItem = null;

    splitLegacyMarkdownLines(value).forEach((line) => {
      const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/);
      const unorderedMatch = line.match(/^-\s+(.+)$/);

      if (orderedMatch) {
        unorderedList = null;
        if (!orderedList) {
          orderedList = document.createElement("ol");
          orderedList.start = Number(orderedMatch[1]);
          fragment.appendChild(orderedList);
        }
        currentOrderedItem = document.createElement("li");
        currentOrderedItem.innerHTML = renderInlineMarkdown(orderedMatch[2]);
        orderedList.appendChild(currentOrderedItem);
        return;
      }

      if (unorderedMatch) {
        const parent = currentOrderedItem || fragment;
        if (!unorderedList || unorderedList.parentNode !== parent) {
          unorderedList = document.createElement("ul");
          parent.appendChild(unorderedList);
        }
        const item = document.createElement("li");
        item.innerHTML = renderInlineMarkdown(unorderedMatch[1]);
        unorderedList.appendChild(item);
        return;
      }

      orderedList = null;
      unorderedList = null;
      currentOrderedItem = null;
      appendParagraph(fragment, line);
    });

    return fragment;
  }

  function normalizeLegacyMarkdownParagraph(paragraph) {
    if (paragraph.children.length > 0 || !markdownBlockPattern.test(paragraph.textContent)) {
      return;
    }

    const fragment = renderLegacyMarkdownBlock(paragraph.textContent);
    if (!fragment.childNodes.length) return;
    paragraph.replaceWith(fragment);
  }

  function normalizeLooseAnswerText(answerBody) {
    const walker = document.createTreeWalker(answerBody, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.textContent.trim() || !markdownBlockPattern.test(node.textContent)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.parentElement && node.parentElement.closest("mjx-container, script, style, .formula")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach((node) => {
      const fragment = renderLegacyMarkdownBlock(node.textContent);
      node.replaceWith(fragment);
    });
  }

  function normalizeLegacyMarkdownAnswers() {
    document.querySelectorAll(".answer-body").forEach((answerBody) => {
      normalizeLooseAnswerText(answerBody);
      answerBody.querySelectorAll("p").forEach(normalizeLegacyMarkdownParagraph);
    });
    typesetMathWhenReady(0);
  }

  function typesetMathWhenReady(attempt) {
    function typesetAnswers() {
      if (mathTypesetStarted) return;
      mathTypesetStarted = true;
      if (typeof window.MathJax.typesetPromise === "function") {
        window.MathJax.typesetPromise([document.body]).catch(function () {});
      }
    }

    if (!window.MathJax) {
      if (attempt < 120) setTimeout(function () { typesetMathWhenReady(attempt + 1); }, 50);
      return;
    }

    if (window.MathJax.startup && window.MathJax.startup.promise) {
      window.MathJax.startup.promise.then(typesetAnswers).catch(function () {});
    } else if (typeof window.MathJax.typesetPromise === "function") {
      typesetAnswers();
    } else if (attempt < 120) {
      setTimeout(function () { typesetMathWhenReady(attempt + 1); }, 50);
    }
  }

  function systemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function storedTheme() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === "dark" || value === "light" ? value : systemTheme();
    } catch (_) {
      return systemTheme();
    }
  }

  function saveTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
  }

  function withThemeTransitionSuppressed(callback) {
    root.classList.add("theme-switching");
    callback();
    requestAnimationFrame(function () {
      root.classList.remove("theme-switching");
    });
  }

  function applyThemeToFrames(theme) {
    frames.forEach(function (frame) {
      try {
        if (frame.contentWindow) {
          frame.contentWindow.postMessage({ type: "rfa-theme", theme: theme }, "*");
        }
        var frameDoc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        if (frameDoc && frameDoc.documentElement) {
          frameDoc.documentElement.dataset.theme = theme;
        }
      } catch (_) {}
    });
  }

  function applyTheme(theme, persist) {
    withThemeTransitionSuppressed(function () {
      root.dataset.theme = theme;
      if (persist) saveTheme(theme);
      themeButtons.forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme));
      });
      applyThemeToFrames(theme);
    });
  }

  function postFilterToFrames() {
    frames.forEach(function (frame) {
      try {
        if (frame.contentWindow) {
          frame.contentWindow.postMessage({ type: "rfa-filter", filter: filterState }, "*");
        }
      } catch (_) {}
    });
  }

  function syncHeaderFilterButtons() {
    headerFilterButtons.forEach(function (button) {
      if (button.dataset.priority) {
        button.setAttribute("aria-pressed", String(button.dataset.priority === filterState.priority));
      }
      if (button.dataset.proof) {
        button.setAttribute("aria-pressed", String(button.dataset.proof === filterState.proof));
      }
    });
  }

  function setupHeaderFilters() {
    if (!headerFilter) return;

    headerFilterButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.dataset.priority) filterState.priority = button.dataset.priority;
        if (button.dataset.proof) filterState.proof = button.dataset.proof;
        syncHeaderFilterButtons();
        postFilterToFrames();
      });
    });

    syncHeaderFilterButtons();
    postFilterToFrames();
  }

  function setupAnswerModal() {
    const answers = document.querySelectorAll(".answer-detail");
    if (!answers.length) return;

    const dialog = document.createElement("dialog");
    dialog.className = "answer-modal";
    dialog.innerHTML = '<div class="answer-modal__panel"><button type="button" class="answer-modal__close" aria-label="Close focused answer">&times;</button><div class="answer-modal__content"></div></div>';
    document.body.appendChild(dialog);

    const modalContent = dialog.querySelector(".answer-modal__content");
    const closeButton = dialog.querySelector(".answer-modal__close");
    closeButton.addEventListener("click", function () {
      dialog.close();
    });
    dialog.addEventListener("close", function () {
      window.parent.postMessage({ type: "rfa-answer-modal", open: false }, "*");
    });
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });

    answers.forEach(function (answer) {
      if (answer.querySelector(".answer-focus-button")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "answer-focus-button";
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
      button.setAttribute("aria-label", "Open answer in focused view");
      answer.insertBefore(button, answer.querySelector(".answer-body"));

      button.addEventListener("click", function () {
        const body = answer.querySelector(".answer-body");
        if (!body) return;
        modalContent.innerHTML = body.innerHTML;
        dialog.showModal();
        window.parent.postMessage({ type: "rfa-answer-modal", open: true }, "*");
        if (window.MathJax && typeof window.MathJax.typesetPromise === "function") {
          window.MathJax.typesetPromise([modalContent]).catch(function () {});
        }
      });
    });
  }

  function initialTheme() {
    try {
      var params = new URLSearchParams(window.location.search);
      var queryTheme = params.get("theme");
      return queryTheme === "dark" || queryTheme === "light" ? queryTheme : storedTheme();
    } catch (_) {
      return storedTheme();
    }
  }

  themeButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      applyTheme(button.dataset.themeChoice, true);
    });
  });

  applyTheme(initialTheme(), false);
  normalizeLegacyMarkdownAnswers();
  setupHeaderFilters();
  setupAnswerModal();

  // When an embedded checklist finishes loading, push the current theme into it.
  if (frames.length) {
    window.addEventListener("message", function (event) {
      var data = event.data;
      if (data && data.type === "rfa-answer-modal") {
        document.body.classList.toggle("answer-modal-active", Boolean(data.open));
      }
    });

    frames.forEach(function (frame) {
      frame.addEventListener("load", function () {
        applyThemeToFrames(root.dataset.theme || initialTheme());
        postFilterToFrames();
      });
    });
  }

  // In standalone (non-embedded) mode: listen for theme changes from parent if embedded in an unknown parent
  if (!frames.length) {
    window.addEventListener("message", function (event) {
      var data = event.data;
      var theme = data && data.type === "rfa-theme" ? data.theme : null;
      if (theme === "dark" || theme === "light") {
        applyTheme(theme, false);
      }
    });
  }
})();
