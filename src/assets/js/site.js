(function () {
  let selectedTag = "all";
  let panelScrollBound = false;
  let progressScrollHandler = null;
  let themeBound = false;

  function initHomeFilters() {
    const searchInput = document.getElementById("postSearch");
    const filterRoot = document.getElementById("tagFilter");
    const rows = Array.from(document.querySelectorAll(".timeline-item"));
    const noResults = document.getElementById("noResults");
    if (!searchInput || !filterRoot) return;

    if (rows.length === 0 || !noResults) {
      searchInput.value = "";
      searchInput.disabled = true;
      searchInput.placeholder = "回到首页可搜索文章";
      filterRoot.querySelectorAll("button").forEach((node) => {
        node.disabled = true;
      });
      return;
    }

    searchInput.disabled = false;
    searchInput.placeholder = "输入标题或日期关键词";
    filterRoot.querySelectorAll("button").forEach((node) => {
      node.disabled = false;
    });

    selectedTag = "all";

    const applyFilters = () => {
      const keyword = searchInput.value.trim().toLowerCase();
      let shownCount = 0;

      rows.forEach((row) => {
        const tags = (row.dataset.tags || "").split(",").filter(Boolean);
        const haystack = `${row.dataset.title || ""} ${row.dataset.date || ""}`;
        const matchesTag = selectedTag === "all" || tags.includes(selectedTag);
        const matchesKeyword = !keyword || haystack.includes(keyword);
        const show = matchesTag && matchesKeyword;

        row.style.display = show ? "block" : "none";
        if (show) shownCount += 1;
      });

      noResults.hidden = shownCount !== 0;
    };

    filterRoot.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-tag]");
      if (!btn) return;

      selectedTag = btn.dataset.tag;
      filterRoot
        .querySelectorAll("button")
        .forEach((node) => node.classList.remove("is-active"));
      btn.classList.add("is-active");
      applyFilters();
    });

    searchInput.addEventListener("input", applyFilters);
  }

  function initControlPanelState() {
    const updatePanelState = () => {
      const controlPanel = document.querySelector(".control-panel");
      if (!controlPanel) return;
      controlPanel.classList.toggle("is-scrolled", window.scrollY > 24);
    };

    updatePanelState();
    if (!panelScrollBound) {
      window.addEventListener("scroll", updatePanelState, { passive: true });
      panelScrollBound = true;
    }
  }

  function initReadingProgress() {
    const progress = document.getElementById("readingProgress");
    if (!progress) return;

    // Clean up any previous handler before re-binding (PJAX navigation)
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

  function initThemeToggle() {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    if (themeBound) return; // header persists across PJAX; bind once
    themeBound = true;

    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch (e) {}
    });
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

    if (!options || options.push !== false) {
      window.history.pushState({ pjax: true, url }, "", url);
    }

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
    initHomeFilters();
    initControlPanelState();
    initReadingProgress();
    initThemeToggle();
  }

  window.addEventListener("DOMContentLoaded", () => {
    initPage();
    initPjax();
  });
})();
