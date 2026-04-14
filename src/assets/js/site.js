(function () {
  let selectedTag = "all";
  let panelScrollBound = false;

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
  }

  window.addEventListener("DOMContentLoaded", () => {
    initPage();
    initPjax();
  });
})();
