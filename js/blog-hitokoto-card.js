/**
 * 首页“今日签”卡片。
 * 一言 API 提供内容，本地按日期缓存；支持去重换签、请求排队和点击复制。
 */
(function () {
  "use strict";

  const API_URL = "https://v1.hitokoto.cn/?c=d&c=e&c=i&encode=json&charset=utf-8&max_length=34";
  const CACHE_KEY = "blog-hitokoto-card:v1";
  const REQUEST_TIMEOUT_MS = 8000;
  const FALLBACKS = [
    { hitokoto: "山高路远，看世界，也找自己。", from: "今日签", from_who: "", type: "e" },
    { hitokoto: "愿每一次出发，都离喜欢的生活更近。", from: "今日签", from_who: "", type: "e" },
    { hitokoto: "保持热爱，慢慢走，也会到达。", from: "今日签", from_who: "", type: "e" }
  ];

  const previousInstance = window.blogHitokotoCard;
  if (previousInstance && typeof previousInstance.destroy === "function") {
    previousInstance.destroy();
  }

  const state = {
    card: null,
    controller: null,
    requestId: 0,
    loading: false,
    pendingRefreshes: 0,
    currentText: "",
    currentQuote: null,
    feedbackTimer: 0,
    queueTimer: 0
  };

  function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function readCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
      return cached && cached.date === todayKey() && cached.data ? cached.data : null;
    } catch (_) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ date: todayKey(), data }));
    } catch (_) {}
  }

  function fallbackQuote() {
    // 使用日期选择备用句，保证接口离线时同一天内容仍然稳定。
    const dayNumber = Math.floor(new Date().setHours(0, 0, 0, 0) / 86400000);
    return FALLBACKS[Math.abs(dayNumber) % FALLBACKS.length];
  }

  function normalizeQuote(data) {
    if (!data || typeof data.hitokoto !== "string" || !data.hitokoto.trim()) {
      throw new Error("Invalid Hitokoto response");
    }
    return {
      hitokoto: data.hitokoto.trim(),
      from: typeof data.from === "string" ? data.from.trim() : "一言",
      from_who: typeof data.from_who === "string" ? data.from_who.trim() : "",
      uuid: typeof data.uuid === "string" ? data.uuid : "",
      type: typeof data.type === "string" ? data.type : ""
    };
  }

  function categoryLabel(type) {
    return ({ a: "动画", b: "漫画", c: "游戏", d: "文学", e: "原创", f: "网络", g: "其他", h: "影视", i: "诗词", j: "音乐", k: "哲学", l: "趣味" })[type] || "一言";
  }

  function render(data, fallback) {
    if (!state.card || !state.card.isConnected) return;
    const text = state.card.querySelector("[data-hitokoto-text]");
    const source = state.card.querySelector("[data-hitokoto-source]");
    const category = state.card.querySelector("[data-hitokoto-category]");
    const author = data.from_who && data.from_who !== data.from ? data.from_who : "";
    text.textContent = `“${data.hitokoto}”`;
    source.textContent = `—— ${author ? `${author} · ` : ""}${data.from || "一言"}`;
    category.textContent = fallback ? "本地" : categoryLabel(data.type);
    state.card.dataset.loading = "false";
    state.card.dataset.fallback = fallback ? "true" : "false";
    state.card.setAttribute("aria-busy", "false");
    state.currentText = data.hitokoto;
    state.currentQuote = data;
    state.card.title = fallback ? "一言暂时未连接，当前显示本地备用签" : "来自一言 · 点击右上角可以换一签";
    window.requestAnimationFrame(() => {
      if (state.card) state.card.classList.remove("is-changing");
    });
  }

  function setCopyFeedback(success) {
    if (!state.card) return;
    const feedback = state.card.querySelector("[data-hitokoto-feedback]");
    const icon = success ? "fa-check" : "fa-xmark";
    feedback.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>${success ? "已复制" : "复制失败"}`;
    feedback.classList.add("is-visible");
    window.clearTimeout(state.feedbackTimer);
    state.feedbackTimer = window.setTimeout(() => {
      if (feedback) feedback.classList.remove("is-visible");
    }, 1500);
  }

  async function copyQuote() {
    if (!state.currentQuote) return;
    const data = state.currentQuote;
    const author = data.from_who && data.from_who !== data.from ? `${data.from_who} · ` : "";
    const content = `“${data.hitokoto}” —— ${author}${data.from || "一言"}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(content);
      } else {
        const input = document.createElement("textarea");
        input.value = content;
        input.setAttribute("readonly", "");
        input.style.cssText = "position:fixed;left:-9999px;opacity:0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("Copy failed");
      }
      setCopyFeedback(true);
    } catch (_) {
      setCopyFeedback(false);
    }
  }

  async function requestDifferentQuote(currentText, requestId) {
    let lastQuote = null;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (requestId !== state.requestId) throw new DOMException("Request replaced", "AbortError");
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      state.controller = controller;
      try {
        const separator = API_URL.includes("?") ? "&" : "?";
        const response = await fetch(`${API_URL}${separator}_=${Date.now()}-${attempt}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        lastQuote = normalizeQuote(await response.json());
        if (!currentText || lastQuote.hitokoto !== currentText) return lastQuote;
      } catch (error) {
        lastError = error;
        // destroy() 会递增 requestId；此时立即终止，不再发起后续重试。
        if (requestId !== state.requestId) throw error;
      } finally {
        window.clearTimeout(timer);
        if (state.controller === controller) state.controller = null;
      }
    }
    if (lastQuote) return lastQuote;
    throw lastError || new Error("Hitokoto request failed");
  }

  async function load(force) {
    if (!state.card) return;
    const cached = force ? null : readCache();
    if (cached) {
      render(cached, false);
      return;
    }

    if (state.loading) {
      if (force) {
        // 将快速连点串行化，避免并发响应覆盖较新的内容。
        state.pendingRefreshes = Math.min(state.pendingRefreshes + 1, 3);
        state.card.dataset.queued = "true";
      }
      return;
    }

    state.loading = true;
    const currentRequest = ++state.requestId;
    state.card.dataset.loading = "true";
    state.card.dataset.queued = "false";
    state.card.setAttribute("aria-busy", "true");
    state.card.classList.add("is-changing");

    try {
      const quote = await requestDifferentQuote(state.currentText, currentRequest);
      if (currentRequest !== state.requestId) return;
      writeCache(quote);
      render(quote, false);
    } catch (_) {
      if (currentRequest !== state.requestId) return;
      render(readCache() || fallbackQuote(), true);
    } finally {
      if (currentRequest === state.requestId) {
        state.loading = false;
        if (state.pendingRefreshes > 0) {
          state.pendingRefreshes -= 1;
          state.card.dataset.queued = state.pendingRefreshes > 0 ? "true" : "false";
          state.queueTimer = window.setTimeout(() => {
            state.queueTimer = 0;
            load(true);
          }, 180);
        } else if (state.card) {
          state.card.dataset.queued = "false";
        }
      }
    }
  }

  function createCard() {
    const card = document.createElement("section");
    card.className = "hitokoto-card";
    card.dataset.loading = "true";
    card.setAttribute("aria-label", "今日一言");
    card.innerHTML = `
      <header class="hitokoto-card__header">
        <span class="hitokoto-card__title"><i class="fa-solid fa-bookmark" aria-hidden="true"></i>今日签</span>
        <span class="hitokoto-card__actions">
          <span class="hitokoto-card__feedback" data-hitokoto-feedback aria-live="polite"></span>
          <span class="hitokoto-card__category" data-hitokoto-category>一言</span>
          <button class="hitokoto-card__refresh" type="button" aria-label="换一条今日签" title="换一签">
            <i class="fa-solid fa-rotate" aria-hidden="true"></i>
          </button>
        </span>
      </header>
      <button class="hitokoto-card__quote" type="button" aria-label="复制今日签" title="点击复制这句话">
        <span data-hitokoto-text aria-live="polite">正在拾取一句话……</span>
      </button>
      <footer class="hitokoto-card__source" data-hitokoto-source>—— 一言</footer>`;
    return card;
  }

  function mount() {
    const sidebar = document.querySelector(".home-sidebar-container .sticky-container");
    if (!sidebar) return false;
    const oldCard = sidebar.querySelector(".hitokoto-card");
    if (oldCard) oldCard.remove();

    state.card = createCard();
    const weatherCard = sidebar.querySelector(".weather-clock-card");
    if (weatherCard) weatherCard.insertAdjacentElement("afterend", state.card);
    else sidebar.appendChild(state.card);
    state.card.querySelector(".hitokoto-card__refresh").addEventListener("click", () => load(true));
    state.card.querySelector(".hitokoto-card__quote").addEventListener("click", copyQuote);
    return true;
  }

  function destroy() {
    state.requestId += 1;
    if (state.controller) state.controller.abort();
    state.loading = false;
    state.pendingRefreshes = 0;
    window.clearTimeout(state.feedbackTimer);
    window.clearTimeout(state.queueTimer);
    if (state.card) state.card.remove();
    state.card = null;
  }

  window.blogHitokotoCard = {
    destroy,
    refresh: () => load(true)
  };

  if (mount()) load(false);
})();
