/**
 * 博客音乐播放器增强
 *
 * 保持 Redefine / APlayer 框架源码不变，在站点层完成：
 * 1. MP3 时长异常时的有限值回退；
 * 2. 播放状态 class 同步，供圆形唱片动画使用；
 * 3. 播放器实例初始化与安全检查。
 */
(function initBlogAPlayer() {
  "use strict";

  // 单页导航可能再次执行 footer 脚本；已有实例时禁止重复初始化。
  if (window.blogAPlayer) return;

  const config = window.theme?.plugins?.aplayer;
  const container = document.getElementById("aplayer");

  // 配置、容器或 APlayer 库缺失时静默退出，避免影响博客其他功能。
  if (!config || !container || typeof window.APlayer !== "function") return;

  const audioList = (config.audios || []).map((audio) => ({
    name: audio.name,
    artist: audio.artist,
    url: audio.url,
    cover: audio.cover,
    lrc: audio.lrc,
    theme: audio.theme,
    // duration 来自本地 MP3 帧头，用于浏览器返回 Infinity 时回退。
    duration: Number(audio.duration),
  }));

  if (audioList.length === 0) return;

  const player = new window.APlayer({
    container,
    fixed: true,
    lrcType: 3,
    audio: audioList,
  });

  /** 返回当前歌曲可用于进度计算的有限时长。 */
  function getDuration(index = player.list.index) {
    const nativeDuration = player.audio.duration;
    if (index === player.list.index && Number.isFinite(nativeDuration) && nativeDuration > 0) {
      return nativeDuration;
    }

    const fallbackDuration = audioList[index]?.duration;
    return Number.isFinite(fallbackDuration) && fallbackDuration > 0
      ? fallbackDuration
      : 0;
  }

  // APlayer 内部的进度条、缓冲条和 seek 都读取 player.duration。
  // 用实例级 getter 提供回退值，不需要修改 APlayer 库源码。
  Object.defineProperty(player, "duration", {
    configurable: true,
    get: () => getDuration(),
  });

  /** 将秒数格式化为 mm:ss；超过一小时则显示 hh:mm:ss。 */
  function formatTime(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    const parts = [minutes, remainder].map((value) => String(value).padStart(2, "0"));

    if (hours > 0) parts.unshift(String(hours).padStart(2, "0"));
    return parts.join(":");
  }

  /** 同步结束时间；切歌时可显式传入新歌曲索引。 */
  function updateDurationLabel(index = player.list.index) {
    player.template.dtime.textContent = formatTime(getDuration(index));
  }

  // listswitch 在 APlayer 更新内部索引之前触发，因此下一帧再刷新标签。
  player.on("listswitch", ({ index }) => {
    window.requestAnimationFrame(() => updateDurationLabel(index));
  });
  player.on("durationchange", () => updateDurationLabel());
  updateDurationLabel();

  // CSS 只依赖这一个状态 class；暂停和播放结束时都会停止唱片旋转。
  player.on("play", () => container.classList.add("aplayer-is-playing"));
  const markPaused = () => container.classList.remove("aplayer-is-playing");
  player.on("pause", markPaused);
  player.on("ended", markPaused);

  // 默认隐藏无歌词歌曲的空歌词面板；元素不存在时不报错。
  container.querySelector(".aplayer-icon-lrc")?.click();

  // 暴露单一只读入口，便于以后在控制台调试或添加站点级功能。
  Object.defineProperty(window, "blogAPlayer", {
    configurable: true,
    value: player,
  });
})();
