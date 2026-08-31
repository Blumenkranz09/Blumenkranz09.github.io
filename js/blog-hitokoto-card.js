/**
 * 首页“每日一签”卡片。
 * 本地签文库 + 访客种子 + 日期，保证同一访客当天结果稳定、次日自动更新。
 */
(function initDailyFortuneCard() {
  "use strict";

  const CACHE_KEY = "blog-fortune-card:v1";
  const VISITOR_KEY = "blog-fortune-visitor:v1";
  const DRAW_DURATION_MS = 900;

  const RANKS = [
    {
      rank: "上上签",
      weight: 8,
      theme: "gold",
      fortunes: [
        { poem: "云开月明风正好，一路所行皆有光。", meaning: "积累正在得到回应，适合把想法真正落地。", suitable: "创作、发布、启程", avoid: "自我怀疑、拖延" },
        { poem: "春风有信花将醒，心有所期事可成。", meaning: "今天的行动容易得到正向反馈，主动一点会更好。", suitable: "表达、尝试、合作", avoid: "畏缩、错失时机" },
        { poem: "长风送舟过千岭，前路清明万事新。", meaning: "阻碍正在减弱，适合推动搁置已久的计划。", suitable: "决定、推进、远行", avoid: "反复纠结" },
        { poem: "星河入梦添新意，所念皆能有回音。", meaning: "灵感与人缘都不错，真诚表达更容易被理解。", suitable: "写作、交流、告白", avoid: "言不由衷" },
        { poem: "一朝好雨润新枝，静待花开正当时。", meaning: "此前的努力开始显现成果，保持节奏即可。", suitable: "收尾、展示、分享", avoid: "急于求成" }
      ]
    },
    {
      rank: "上签",
      weight: 17,
      theme: "red",
      fortunes: [
        { poem: "前山虽远路犹明，缓步徐行自有程。", meaning: "方向正确，不必追求一步到位。", suitable: "学习、积累、整理", avoid: "与人比较" },
        { poem: "微风拂面云初散，小有所得亦心安。", meaning: "今天适合完成具体的小目标，成就感会带来动力。", suitable: "清单、复盘、完成", avoid: "目标过多" },
        { poem: "灯火可亲人可近，一言温暖抵千金。", meaning: "沟通运势不错，认真回应会收获善意。", suitable: "联系、倾听、协作", avoid: "冷处理" },
        { poem: "旧页翻过新章起，落笔从容自有声。", meaning: "适合告别旧问题，以新的方法重新开始。", suitable: "重构、更新、断舍离", avoid: "沉溺过去" },
        { poem: "水到渠成无须催，心平自有好事来。", meaning: "事情正在自然推进，耐心比催促更有效。", suitable: "等待、完善、观察", avoid: "频繁改变" }
      ]
    },
    {
      rank: "中上签",
      weight: 25,
      theme: "amber",
      fortunes: [
        { poem: "晨光未满天将晓，先行一步见分明。", meaning: "信息还不完整，可以先做低风险的第一步。", suitable: "试验、草稿、验证", avoid: "孤注一掷" },
        { poem: "石上清泉声自远，守住初心路自宽。", meaning: "坚持自己的节奏，外界的杂音不必全部回应。", suitable: "专注、练习、独处", avoid: "分心、内耗" },
        { poem: "新枝尚嫩宜勤护，待到春深自成荫。", meaning: "新计划值得培养，但暂时需要更多耐心。", suitable: "打基础、记录、迭代", avoid: "过早否定" },
        { poem: "偶有斜风吹旧梦，回身仍见满庭芳。", meaning: "小插曲不会改变整体方向，及时调整即可。", suitable: "修正、备份、复查", avoid: "因小失大" },
        { poem: "半卷闲书一盏茶，慢中亦可见芳华。", meaning: "放慢速度反而更容易发现遗漏和灵感。", suitable: "阅读、思考、休息", avoid: "疲劳硬撑" },
        { poem: "有心栽花勤照料，日后自会满庭香。", meaning: "今天的投入未必立即见效，但会成为之后的优势。", suitable: "积累、储备、长期计划", avoid: "只看眼前" }
      ]
    },
    {
      rank: "中签",
      weight: 30,
      theme: "blue",
      fortunes: [
        { poem: "行至水穷且安坐，静看云起再前行。", meaning: "暂时没有明显突破，先观察再决定更稳妥。", suitable: "整理、等待、复盘", avoid: "冲动决定" },
        { poem: "一日寻常一日新，细微之处见真心。", meaning: "今天运势平稳，把普通事情认真做好就是收获。", suitable: "日常、维护、收尾", avoid: "好高骛远" },
        { poem: "路逢岔口休忙走，问清方向再启程。", meaning: "遇到选择时先补充信息，不需要立即给出答案。", suitable: "询问、调查、列计划", avoid: "凭感觉下注" },
        { poem: "潮来潮去皆有序，得失随缘心自宁。", meaning: "结果可能普通，保持稳定心态比短期输赢更重要。", suitable: "平常心、规律作息", avoid: "情绪化" },
        { poem: "窗前风过无留迹，手边小事莫轻看。", meaning: "容易忽略细节，今天适合认真检查。", suitable: "测试、校对、备份", avoid: "粗心、跳步骤" },
        { poem: "且把浮心收一处，平凡日里有清欢。", meaning: "减少同时处理的任务，专注会让今天更顺利。", suitable: "单线程、清理、专注", avoid: "多线并行" }
      ]
    },
    {
      rank: "中下签",
      weight: 15,
      theme: "violet",
      fortunes: [
        { poem: "雾里看花休急取，待风吹散见分明。", meaning: "当前判断容易受情绪影响，重要决定可以缓一缓。", suitable: "观察、求证、休息", avoid: "仓促承诺" },
        { poem: "舟行浅滩须慢桨，稳住方向莫争先。", meaning: "阻力比预想稍大，降低速度能避免返工。", suitable: "小步推进、留余量", avoid: "赶进度" },
        { poem: "旧事偶来敲心门，清茶一盏送黄昏。", meaning: "可能被旧问题干扰，处理好情绪再继续行动。", suitable: "散步、倾诉、整理", avoid: "钻牛角尖" },
        { poem: "弦若太紧声易乱，松弛有度曲方长。", meaning: "疲劳正在影响效率，适当休息并不是浪费时间。", suitable: "早睡、减负、暂停", avoid: "透支精力" },
        { poem: "风急不宜扬远帆，暂泊岸边护舟安。", meaning: "外部条件暂时不稳定，先保护已有成果。", suitable: "保存、备份、控制风险", avoid: "激进改变" }
      ]
    },
    {
      rank: "下签",
      weight: 5,
      theme: "gray",
      fortunes: [
        { poem: "风雨暂遮来时路，静候天光照远山。", meaning: "今天更适合守成，重要事情尽量多检查一次。", suitable: "休息、检查、等待", avoid: "冒进、争执" },
        { poem: "沙中行路步难快，留得从容便是安。", meaning: "推进可能不顺，不必把暂时停顿看成失败。", suitable: "缩小目标、保存体力", avoid: "勉强硬撑" },
        { poem: "云重未必终无月，且待夜深风自开。", meaning: "眼前的信息偏负面，但还不是最终结果。", suitable: "延后判断、寻找帮助", avoid: "悲观定论" },
        { poem: "门外喧声暂莫问，先将心事理分明。", meaning: "今天容易受到他人影响，先照顾好自己的状态。", suitable: "独处、梳理、早休息", avoid: "情绪对抗" }
      ]
    }
  ];

  const previousInstance = window.blogHitokotoCard;
  if (previousInstance && typeof previousInstance.destroy === "function") {
    previousInstance.destroy();
  }

  const state = {
    card: null,
    fortune: null,
    drawTimer: 0,
    feedbackTimer: 0,
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
    return {
      date: todayKey(),
      rank: selectedRank.rank,
      theme: selectedRank.theme,
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

  function renderFortune(fortune, animate) {
    if (!state.card || !state.card.isConnected) return;
    state.fortune = fortune;
    state.card.dataset.rank = fortune.theme;
    state.card.dataset.drawn = "true";
    state.card.dataset.drawing = "false";
    state.card.setAttribute("aria-busy", "false");
    state.card.querySelector("[data-fortune-rank]").textContent = fortune.rank;
    state.card.querySelector("[data-fortune-poem]").textContent = fortune.poem;
    state.card.querySelector("[data-fortune-meaning]").textContent = fortune.meaning;
    state.card.querySelector("[data-fortune-suitable]").textContent = fortune.suitable;
    state.card.querySelector("[data-fortune-avoid]").textContent = fortune.avoid;
    state.card.querySelector("[data-fortune-footer]").textContent = `${displayDate()} · 今日签已定`;
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
    state.card.querySelector("[data-fortune-rank]").textContent = "摇签中";

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    state.drawTimer = window.setTimeout(() => {
      state.drawTimer = 0;
      state.drawing = false;
      const fortune = createDailyFortune();
      writeCache(fortune);
      renderFortune(fortune, !reduceMotion);
    }, reduceMotion ? 0 : DRAW_DURATION_MS);
  }

  async function copyFortune() {
    if (!state.fortune) return;
    const fortune = state.fortune;
    const content = `【${fortune.rank}】\n${fortune.poem}\n解签：${fortune.meaning}\n宜：${fortune.suitable}\n忌：${fortune.avoid}\n${displayDate()} · 每日一签`;

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
          <span class="fortune-card__draw-label">求一签</span>
          <small>心诚则灵 · 每日一次</small>
        </button>

        <button class="fortune-card__result" type="button" data-fortune-result aria-label="复制今日签" title="点击复制今日签">
          <span class="fortune-card__poem" data-fortune-poem></span>
          <span class="fortune-card__meaning"><b>解签</b><span data-fortune-meaning></span></span>
          <span class="fortune-card__guidance">
            <span class="is-suitable"><b>宜</b><span data-fortune-suitable></span></span>
            <span class="is-avoid"><b>忌</b><span data-fortune-avoid></span></span>
          </span>
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
    return true;
  }

  function destroy() {
    window.clearTimeout(state.drawTimer);
    window.clearTimeout(state.feedbackTimer);
    state.drawing = false;
    if (state.card) state.card.remove();
    state.card = null;
  }

  window.blogHitokotoCard = {
    destroy,
    refresh: () => {
      if (!state.card && mount()) return;
      const cached = readCache();
      if (cached) renderFortune(cached, false);
    }
  };

  mount();
})();
