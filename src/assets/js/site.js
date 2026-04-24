(function () {
  const THEMES = ["paper", "modern", "midnight"];
  const THEME_ICONS = { paper: "☀", modern: "◐", midnight: "☾" };
  let activeTags = [];
  let progressScrollHandler = null;
  let themeBound = false;
  let backToTopBound = false;
  let backToTopHandler = null;

  function getTheme() {
    const t = document.body.getAttribute("data-theme") || "paper";
    return THEMES.indexOf(t) !== -1 ? t : "paper";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("theme", theme);
    } catch (e) {}
    const icon = document.getElementById("themeIcon");
    if (icon) icon.textContent = THEME_ICONS[theme] || "☀";
    syncGiscusTheme(theme);
  }

  function syncGiscusTheme(theme) {
    try {
      const frame = document.querySelector("iframe.giscus-frame");
      if (!frame) return;
      const giscusTheme = theme === "midnight" ? "dark" : "light";
      frame.contentWindow.postMessage(
        { giscus: { setConfig: { theme: giscusTheme } } },
        "https://giscus.app"
      );
    } catch (e) {}
  }

  function initThemeToggle() {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;

    // Set initial icon based on stored/current theme
    const current = getTheme();
    applyTheme(current);

    if (themeBound) return; // nav persists across PJAX; bind once
    themeBound = true;

    btn.addEventListener("click", () => {
      const now = getTheme();
      const next = THEMES[(THEMES.indexOf(now) + 1) % THEMES.length];
      applyTheme(next);
    });
  }

  function initHomeFilters() {
    const searchInput = document.getElementById("postSearch");
    const searchClear = document.getElementById("searchClear");
    const tagRoot = document.getElementById("tagFilter");
    const tagClear = document.getElementById("tagClear");
    const items = Array.from(document.querySelectorAll(".tl-item"));
    const yearSeps = Array.from(document.querySelectorAll(".year-sep"));
    const noResults = document.getElementById("noResults");

    if (!searchInput || !tagRoot) return;
    if (items.length === 0) return;

    activeTags = [];

    const applyFilters = () => {
      const keyword = (searchInput.value || "").trim().toLowerCase();
      let shown = 0;

      items.forEach((item) => {
        const tags = (item.dataset.tags || "").split(",").filter(Boolean);
        const haystack = `${item.dataset.title || ""} ${item.dataset.date || ""}`.toLowerCase();
        const matchesTag = activeTags.length === 0 || activeTags.every((t) => tags.includes(t));
        const matchesKeyword = !keyword || haystack.includes(keyword);
        const show = matchesTag && matchesKeyword;
        item.style.display = show ? "" : "none";
        if (show) shown += 1;
      });

      // Hide year separators with no visible items under them
      yearSeps.forEach((sep) => {
        let next = sep.nextElementSibling;
        let hasVisible = false;
        while (next && !next.classList.contains("year-sep")) {
          if (next.classList.contains("tl-item") && next.style.display !== "none") {
            hasVisible = true;
            break;
          }
          next = next.nextElementSibling;
        }
        sep.style.display = hasVisible ? "" : "none";
      });

      if (noResults) noResults.hidden = shown !== 0;
      if (tagClear) tagClear.style.display = activeTags.length > 0 ? "" : "none";
      if (searchClear) searchClear.style.display = searchInput.value ? "" : "none";
    };

    tagRoot.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-tag]");
      if (!btn) return;
      const tag = btn.dataset.tag;
      const idx = activeTags.indexOf(tag);
      if (idx === -1) activeTags.push(tag);
      else activeTags.splice(idx, 1);
      btn.classList.toggle("on", idx === -1);
      applyFilters();
    });

    if (tagClear) {
      tagClear.addEventListener("click", () => {
        activeTags = [];
        tagRoot.querySelectorAll("button.on").forEach((b) => b.classList.remove("on"));
        applyFilters();
      });
    }

    if (searchClear) {
      searchClear.addEventListener("click", () => {
        searchInput.value = "";
        applyFilters();
        searchInput.focus();
      });
    }

    searchInput.addEventListener("input", applyFilters);
    applyFilters();
  }

  function initReadingProgress() {
    const progress = document.getElementById("readingProgress");
    if (!progress) return;

    if (progressScrollHandler) {
      window.removeEventListener("scroll", progressScrollHandler);
      window.removeEventListener("resize", progressScrollHandler);
      progressScrollHandler = null;
    }

    const article = document.querySelector("[data-post-article]");
    if (!article) {
      progress.hidden = true;
      progress.style.width = "0%";
      return;
    }

    progress.hidden = false;

    const update = () => {
      const rect = article.getBoundingClientRect();
      const articleTop = rect.top + window.scrollY;
      const articleHeight = article.offsetHeight;
      const viewport = window.innerHeight;
      const scrolled = window.scrollY - articleTop + viewport * 0.3;
      const total = Math.max(1, articleHeight - viewport * 0.4);
      const ratio = Math.min(1, Math.max(0, scrolled / total));
      progress.style.width = (ratio * 100).toFixed(2) + "%";
    };

    update();
    progressScrollHandler = update;
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
  }

  function initBackToTop() {
    const btn = document.getElementById("backToTop");
    if (!btn) return;

    const update = () => {
      if (window.scrollY > 300) btn.classList.remove("hidden");
      else btn.classList.add("hidden");
    };

    if (backToTopBound) {
      update();
      return;
    }
    backToTopBound = true;

    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    backToTopHandler = update;
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  function shouldHandleWithPjax(anchor, event) {
    if (!anchor || !event) return false;
    if (event.defaultPrevented) return false;
    if (event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (anchor.target && anchor.target !== "_self") return false;
    if (anchor.hasAttribute("download")) return false;

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return false;
    }

    const url = new URL(anchor.href, window.location.origin);
    if (url.origin !== window.location.origin) return false;
    if (url.pathname === window.location.pathname && url.search === window.location.search) return false;
    if (url.pathname.endsWith(".xml")) return false;

    return true;
  }

  async function navigateWithPjax(url, options) {
    const main = document.getElementById("pjax-root");
    if (!main) {
      window.location.href = url;
      return;
    }

    let response;
    try {
      response = await fetch(url, {
        headers: { "X-PJAX": "true" },
        credentials: "same-origin"
      });
    } catch (error) {
      window.location.href = url;
      return;
    }

    if (!response.ok) {
      window.location.href = url;
      return;
    }

    const html = await response.text();
    const parser = new DOMParser();
    const nextDoc = parser.parseFromString(html, "text/html");
    const nextMain = nextDoc.getElementById("pjax-root");
    if (!nextMain) {
      window.location.href = url;
      return;
    }

    main.innerHTML = nextMain.innerHTML;
    document.title = nextDoc.title || document.title;

    // Sync active nav link
    const nextLinks = nextDoc.querySelectorAll(".nav-link");
    const curLinks = document.querySelectorAll(".nav-link");
    if (nextLinks.length === curLinks.length) {
      nextLinks.forEach((nl, i) => {
        curLinks[i].classList.toggle("active", nl.classList.contains("active"));
      });
    }

    if (!options || options.push !== false) {
      window.history.pushState({ pjax: true, url }, "", url);
    }

    // Re-trigger page-enter animation
    main.classList.remove("page-enter");
    void main.offsetWidth;
    main.classList.add("page-enter");

    window.scrollTo({ top: 0, behavior: "auto" });
    initPage();
  }

  function initPjax() {
    document.addEventListener("click", (event) => {
      const anchor = event.target.closest("a");
      if (!shouldHandleWithPjax(anchor, event)) return;

      event.preventDefault();
      navigateWithPjax(anchor.href);
    });

    window.addEventListener("popstate", () => {
      navigateWithPjax(window.location.href, { push: false });
    });
  }

  function initPage() {
    initThemeToggle();
    initHomeFilters();
    initReadingProgress();
    initBackToTop();
  }

  window.addEventListener("DOMContentLoaded", () => {
    initPage();
    initPjax();
  });
})();
