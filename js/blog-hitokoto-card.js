/**
 * 首页“每日一签”卡片。
 * 本地签文库 + 访客种子 + 日期，保证同一访客当天结果稳定、次日自动更新。
 */
(function initDailyFortuneCard() {
  "use strict";

  const CACHE_KEY = "blog-fortune-card:v2";
  const VISITOR_KEY = "blog-fortune-visitor:v1";
  const DRAW_PHASES = [
    { phase: "calm", label: "静心", rank: "静心片刻", delay: 0 },
    { phase: "shake", label: "摇签", rank: "摇签中", delay: 360 },
    { phase: "reveal", label: "揭签", rank: "签意将明", delay: 920 }
  ];
  const DRAW_DURATION_MS = 1280;

  const RANKS = window.blogFortuneLibrary;
  if (!Array.isArray(RANKS) || RANKS.length === 0) {
    console.error("每日一签：签文库未加载，请检查 blog-fortune-library.js 的注入顺序。");
    return;
  }

  const previousInstance = window.blogHitokotoCard;
  if (previousInstance && typeof previousInstance.destroy === "function") {
    previousInstance.destroy();
  }

  const state = {
    card: null,
    fortune: null,
    drawTimer: 0,
    phaseTimers: [],
    feedbackTimer: 0,
    dayTimer: 0,
    currentDate: "",
    drawing: false
  };

  function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function displayDate() {
    const now = new Date();
    return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  }

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const values = new Uint32Array(4);
      window.crypto.getRandomValues(values);
      return Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("");
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function visitorSeed() {
    try {
      let seed = localStorage.getItem(VISITOR_KEY);
      if (!seed) {
        seed = randomId();
        localStorage.setItem(VISITOR_KEY, seed);
      }
      return seed;
    } catch (_) {
      return "anonymous-visitor";
    }
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return function next() {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createDailyFortune() {
    const random = seededRandom(hashString(`${todayKey()}:${visitorSeed()}`));
    const totalWeight = RANKS.reduce((total, item) => total + item.weight, 0);
    let ticket = random() * totalWeight;
    let selectedRank = RANKS[RANKS.length - 1];

    for (const item of RANKS) {
      ticket -= item.weight;
      if (ticket < 0) {
        selectedRank = item;
        break;
      }
    }

    const selected = selectedRank.fortunes[Math.floor(random() * selectedRank.fortunes.length)];
    const keywords = [...selectedRank.keywords];
    for (let index = keywords.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [keywords[index], keywords[swapIndex]] = [keywords[swapIndex], keywords[index]];
    }
    return {
      date: todayKey(),
      rank: selectedRank.rank,
      theme: selectedRank.theme,
      keywords: keywords.slice(0, 3),
      poem: selected.poem,
      meaning: selected.meaning,
      suitable: selected.suitable,
      avoid: selected.avoid
    };
  }

  function isValidFortune(value) {
    return value &&
      value.date === todayKey() &&
      typeof value.rank === "string" &&
      Array.isArray(value.keywords) &&
      typeof value.poem === "string" &&
      typeof value.meaning === "string";
  }

  function readCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
      return isValidFortune(cached) ? cached : null;
    } catch (_) {
      return null;
    }
  }

  function writeCache(fortune) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(fortune));
    } catch (_) {}
  }

  function clearCache() {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (_) {}
  }

  function setFeedback(success) {
    if (!state.card) return;
    const feedback = state.card.querySelector("[data-fortune-feedback]");
    feedback.innerHTML = `<i class="fa-solid ${success ? "fa-check" : "fa-xmark"}" aria-hidden="true"></i>${success ? "已复制" : "复制失败"}`;
    feedback.classList.add("is-visible");
    window.clearTimeout(state.feedbackTimer);
    state.feedbackTimer = window.setTimeout(() => {
      if (feedback) feedback.classList.remove("is-visible");
    }, 1500);
  }

  function clearPhaseTimers() {
    state.phaseTimers.forEach((timer) => window.clearTimeout(timer));
    state.phaseTimers = [];
  }

  function setDrawPhase(item) {
    if (!state.card || !state.card.isConnected) return;
    state.card.dataset.phase = item.phase;
    state.card.querySelector("[data-fortune-rank]").textContent = item.rank;
    state.card.querySelector("[data-fortune-draw-label]").textContent = item.label;
  }

  function resetCardForNewDay() {
    window.clearTimeout(state.drawTimer);
    state.drawTimer = 0;
    clearPhaseTimers();
    clearCache();
    state.currentDate = todayKey();
    state.fortune = null;
    state.drawing = false;

    if (state.card && state.card.isConnected) {
      state.card.dataset.drawn = "false";
      state.card.dataset.drawing = "false";
      state.card.dataset.phase = "idle";
      state.card.dataset.rank = "plain";
      state.card.classList.remove("is-revealing");
      state.card.setAttribute("aria-busy", "false");
      state.card.removeAttribute("title");
      state.card.querySelector("[data-fortune-rank]").textContent = "未揭签";
      state.card.querySelector("[data-fortune-draw-label]").textContent = "求一签";
      state.card.querySelector("[data-fortune-keywords]").textContent = "";
      state.card.querySelector("[data-fortune-poem]").textContent = "";
      state.card.querySelector("[data-fortune-meaning]").textContent = "";
      state.card.querySelector("[data-fortune-suitable]").textContent = "";
      state.card.querySelector("[data-fortune-avoid]").textContent = "";
      state.card.querySelector("[data-fortune-footer]").textContent = `${displayDate()} · 仅供娱乐`;
    }

    scheduleMidnightRefresh();
  }

  function scheduleMidnightRefresh() {
    window.clearTimeout(state.dayTimer);
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
    state.dayTimer = window.setTimeout(() => {
      if (state.currentDate !== todayKey()) resetCardForNewDay();
      else scheduleMidnightRefresh();
    }, Math.max(1000, nextDay.getTime() - now.getTime()));
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible" && state.currentDate !== todayKey()) {
      resetCardForNewDay();
    }
  }

  function renderFortune(fortune, animate) {
    if (!state.card || !state.card.isConnected) return;
    state.fortune = fortune;
    state.card.dataset.rank = fortune.theme;
    state.card.dataset.drawn = "true";
    state.card.dataset.drawing = "false";
    state.card.dataset.phase = "done";
    state.card.setAttribute("aria-busy", "false");
    state.card.querySelector("[data-fortune-rank]").textContent = fortune.rank;
    state.card.querySelector("[data-fortune-keywords]").textContent = fortune.keywords.join(" · ");
    state.card.querySelector("[data-fortune-poem]").textContent = fortune.poem;
    state.card.querySelector("[data-fortune-meaning]").textContent = fortune.meaning;
    state.card.querySelector("[data-fortune-suitable]").textContent = fortune.suitable;
    state.card.querySelector("[data-fortune-avoid]").textContent = fortune.avoid;
    state.card.querySelector("[data-fortune-footer]").textContent = `${displayDate()} · 今日之签已定，明日再来`;
    state.card.title = "点击签文可复制今日签";

    if (animate) {
      state.card.classList.add("is-revealing");
      window.setTimeout(() => {
        if (state.card) state.card.classList.remove("is-revealing");
      }, 700);
    }
  }

  function drawFortune() {
    if (!state.card || state.drawing || state.fortune) return;
    state.drawing = true;
    state.card.dataset.drawing = "true";
    state.card.setAttribute("aria-busy", "true");

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    clearPhaseTimers();
    if (!reduceMotion) {
      DRAW_PHASES.forEach((item) => {
        const timer = window.setTimeout(() => setDrawPhase(item), item.delay);
        state.phaseTimers.push(timer);
      });
    }
    state.drawTimer = window.setTimeout(() => {
      state.drawTimer = 0;
      clearPhaseTimers();
      state.drawing = false;
      const fortune = createDailyFortune();
      writeCache(fortune);
      renderFortune(fortune, !reduceMotion);
    }, reduceMotion ? 0 : DRAW_DURATION_MS);
  }

  async function copyFortune() {
    if (!state.fortune) return;
    const fortune = state.fortune;
    const content = `【${fortune.rank}】\n关键词：${fortune.keywords.join(" · ")}\n${fortune.poem}\n解签：${fortune.meaning}\n宜：${fortune.suitable}\n忌：${fortune.avoid}\n${displayDate()} · 每日一签`;

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
      setFeedback(true);
    } catch (_) {
      setFeedback(false);
    }
  }

  function createCard() {
    const card = document.createElement("section");
    card.className = "hitokoto-card fortune-card";
    card.dataset.drawn = "false";
    card.dataset.drawing = "false";
    card.dataset.phase = "idle";
    card.dataset.rank = "plain";
    card.setAttribute("aria-label", "每日一签");
    card.innerHTML = `
      <header class="fortune-card__header">
        <span class="fortune-card__title"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>每日一签</span>
        <span class="fortune-card__header-right">
          <span class="fortune-card__feedback" data-fortune-feedback aria-live="polite"></span>
          <span class="fortune-card__rank" data-fortune-rank>未揭签</span>
        </span>
      </header>

      <div class="fortune-card__stage">
        <button class="fortune-card__draw" type="button" data-fortune-draw aria-label="求一支今日签">
          <span class="fortune-card__bamboo" aria-hidden="true">
            <i></i><i></i><i></i>
          </span>
          <span class="fortune-card__draw-label" data-fortune-draw-label>求一签</span>
          <small>静心 · 摇签 · 揭签</small>
        </button>

        <button class="fortune-card__result" type="button" data-fortune-result aria-label="复制今日签" title="点击复制今日签">
          <span class="fortune-card__keywords"><b>今日关键词</b><span data-fortune-keywords></span></span>
          <span class="fortune-card__poem" data-fortune-poem></span>
          <span class="fortune-card__meaning"><b>解签</b><span data-fortune-meaning></span></span>
          <span class="fortune-card__guidance">
            <span class="is-suitable"><b>宜</b><span data-fortune-suitable></span></span>
            <span class="is-avoid"><b>忌</b><span data-fortune-avoid></span></span>
          </span>
          <span class="fortune-card__copy-hint"><i class="fa-regular fa-copy" aria-hidden="true"></i> 点击签文复制</span>
        </button>
      </div>

      <footer class="fortune-card__footer" data-fortune-footer>${displayDate()} · 仅供娱乐</footer>`;
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

    state.card.querySelector("[data-fortune-draw]").addEventListener("click", drawFortune);
    state.card.querySelector("[data-fortune-result]").addEventListener("click", copyFortune);

    const cached = readCache();
    if (cached) renderFortune(cached, false);
    state.currentDate = todayKey();
    return true;
  }

  function destroy() {
    window.clearTimeout(state.drawTimer);
    clearPhaseTimers();
    window.clearTimeout(state.feedbackTimer);
    window.clearTimeout(state.dayTimer);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    state.drawing = false;
    if (state.card) state.card.remove();
    state.card = null;
  }

  window.blogHitokotoCard = {
    destroy,
    refresh: () => {
      if (state.currentDate && state.currentDate !== todayKey()) {
        resetCardForNewDay();
      }
      if (!state.card && mount()) return;
      const cached = readCache();
      if (cached) renderFortune(cached, false);
    }
  };

  mount();
  scheduleMidnightRefresh();
  document.addEventListener("visibilitychange", handleVisibilityChange);
})();
