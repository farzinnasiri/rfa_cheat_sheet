(function () {
  const STORAGE_KEY = "rfa-theme";
  const root = document.documentElement;
  const frame = document.getElementById("checklistFrame");
  const themeButtons = document.querySelectorAll("[data-theme-choice]");

  function systemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function storedTheme() {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "light" ? value : systemTheme();
  }

  function updateFrameThemeParam(theme) {
    if (!frame) return;
    const src = new URL(frame.getAttribute("src"), window.location.href);
    src.searchParams.set("theme", theme);
    const nextSrc = `${src.pathname.split("/").pop()}${src.search}`;
    if (frame.getAttribute("src") !== nextSrc) {
      frame.setAttribute("src", nextSrc);
    }
  }

  function sendFrameTheme(theme) {
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ type: "rfa-theme", theme }, window.location.origin);
  }

  function applyTheme(theme, persist) {
    root.dataset.theme = theme;
    if (persist) localStorage.setItem(STORAGE_KEY, theme);
    themeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme));
    });
    sendFrameTheme(theme);
  }

  function initialTheme() {
    const params = new URLSearchParams(window.location.search);
    const queryTheme = params.get("theme");
    return queryTheme === "dark" || queryTheme === "light" ? queryTheme : storedTheme();
  }

  themeButtons.forEach((button) => {
    button.addEventListener("click", () => applyTheme(button.dataset.themeChoice, true));
  });

  applyTheme(initialTheme(), false);

  if (frame) {
    window.addEventListener("message", (event) => {
      if (event.origin === window.location.origin && event.data === "rfa-frame-ready") {
        sendFrameTheme(root.dataset.theme);
      }
    });
  }

  if (!frame) {
    window.addEventListener("message", (event) => {
      const theme = event.data && event.data.type === "rfa-theme" ? event.data.theme : null;
      if (event.origin === window.location.origin && (theme === "dark" || theme === "light")) {
        applyTheme(theme, false);
      }
    });
  } else {
    updateFrameThemeParam(root.dataset.theme);
  }
})();
