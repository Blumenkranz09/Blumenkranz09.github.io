/**
 * 首页邮箱快捷复制。
 * 通过站点层增强 mailto 链接，不修改主题模板；兼容 Swup 重复执行脚本。
 */
(function () {
  "use strict";

  const previousInstance = window.blogEmailCopy;
  if (previousInstance && typeof previousInstance.destroy === "function") {
    previousInstance.destroy();
  }

  let link = null;
  let wrapper = null;
  let feedback = null;
  let hideTimer = null;
  let originalTitle = null;
  let originalAriaLabel = null;

  /** Clipboard API 仅在安全上下文可用，保留旧浏览器降级方案。 */
  function fallbackCopy(text) {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;pointer-events:none";
    document.body.appendChild(input);
    input.select();
    input.setSelectionRange(0, input.value.length);
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("Copy command failed");
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (_) {}
    }
    fallbackCopy(text);
  }

  function showFeedback(message) {
    if (!feedback) return;
    window.clearTimeout(hideTimer);
    feedback.textContent = message;
    feedback.classList.add("is-visible");
    hideTimer = window.setTimeout(() => {
      if (feedback) feedback.classList.remove("is-visible");
    }, 1800);
  }

  async function handleClick(event) {
    event.preventDefault();
    const email = link.href.replace(/^mailto:/i, "").split("?")[0];
    try {
      await copyText(decodeURIComponent(email));
      showFeedback("邮箱已复制");
    } catch (_) {
      showFeedback("复制失败，请重试");
    }
  }

  function mount() {
    link = document.querySelector('.home-banner-container .social-contact-item a[href^="mailto:"]');
    if (!link) return;

    wrapper = link.closest(".social-contact-item");
    if (!wrapper) return;
    wrapper.querySelector(".email-copy-feedback")?.remove();
    originalTitle = link.getAttribute("title");
    originalAriaLabel = link.getAttribute("aria-label");
    wrapper.classList.add("email-copy-enabled");
    link.title = "点击复制邮箱";
    link.setAttribute("aria-label", "复制邮箱地址");
    link.addEventListener("click", handleClick);

    feedback = document.createElement("span");
    feedback.className = "email-copy-feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    wrapper.appendChild(feedback);
  }

  function destroy() {
    window.clearTimeout(hideTimer);
    if (link) link.removeEventListener("click", handleClick);
    if (feedback) feedback.remove();
    if (wrapper) wrapper.classList.remove("email-copy-enabled");
    if (link) {
      if (originalTitle === null) link.removeAttribute("title");
      else link.setAttribute("title", originalTitle);
      if (originalAriaLabel === null) link.removeAttribute("aria-label");
      else link.setAttribute("aria-label", originalAriaLabel);
    }
  }

  window.blogEmailCopy = { destroy };
  mount();
})();
