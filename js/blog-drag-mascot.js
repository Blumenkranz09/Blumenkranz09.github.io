/**
 * 右下角纸片看板娘。
 * Pointer Events 负责鼠标/触摸拖拽，requestAnimationFrame 计算弹簧回弹；
 * 眨眼、翻面和纸张细节动画只在完全静止时运行。
 */
(function () {
  "use strict";

  const previousInstance = window.blogDragMascot;
  if (previousInstance && typeof previousInstance.destroy === "function") {
    previousInstance.destroy();
  }

  const CONFIG = {
    spring: 0.075,
    damping: 0.78,
    maxDistanceDesktop: 190,
    maxDistanceMobile: 125,
    overscrollResistance: 0.18,
    maxOverscroll: 34,
    maxRotation: 14,
    restTetherLengthDesktop: 48,
    restTetherLengthMobile: 34
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const state = {
    rig: null,
    mascot: null,
    sprite: null,
    blinkImage: null,
    blinkReady: false,
    tether: null,
    anchor: null,
    restX: 0,
    restY: 0,
    anchorX: 0,
    anchorY: 0,
    offsetX: 0,
    offsetY: 0,
    velocityX: 0,
    velocityY: 0,
    rotation: 0,
    scale: 1,
    dragging: false,
    pointerId: null,
    dragStartX: 0,
    dragStartY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    lastPointerX: 0,
    lastPointerY: 0,
    lastPointerTime: 0,
    frame: 0,
    lastFrameTime: 0,
    blinkTimer: 0,
    breathTimer: 0,
    wiggleTimer: 0,
    flipTimer: 0,
    resumeTimer: 0,
    flipping: false,
    limitShakeTriggered: false,
    blinkFrames: new Set(),
    idleEffects: new Set(),
    dragEffects: new Set()
  };

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function randomBetween(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function clearTimer(name) {
    if (state[name]) window.clearTimeout(state[name]);
    state[name] = 0;
  }

  function clearTimerSet(timerSet) {
    timerSet.forEach((timer) => window.clearTimeout(timer));
    timerSet.clear();
  }

  function queueTimer(timerSet, callback, delay) {
    const timer = window.setTimeout(() => {
      timerSet.delete(timer);
      callback();
    }, delay);
    timerSet.add(timer);
    return timer;
  }

  /** 待机动画必须与拖拽、回弹和键盘位移互斥。 */
  function canRunIdle() {
    return Boolean(
      state.mascot &&
      !state.dragging &&
      state.frame === 0 &&
      state.offsetX === 0 &&
      state.offsetY === 0 &&
      !document.hidden &&
      !reducedMotion.matches
    );
  }

  function setBlinking(blinking) {
    if (state.sprite) state.sprite.classList.toggle("is-blinking", blinking);
  }

  function performBlink(doubleBlink, reschedule, force) {
    if (!force && !canRunIdle()) return;
    if (!force && state.flipping) {
      if (reschedule) scheduleBlink(900);
      return;
    }
    if (!state.blinkReady) {
      if (reschedule) scheduleBlink(800);
      return;
    }
    clearTimerSet(state.blinkFrames);
    setBlinking(true);
    queueTimer(state.blinkFrames, () => setBlinking(false), 105);
    if (doubleBlink) {
      queueTimer(state.blinkFrames, () => setBlinking(true), 205);
      queueTimer(state.blinkFrames, () => setBlinking(false), 315);
    }
    if (reschedule) {
      queueTimer(state.blinkFrames, () => scheduleBlink(), doubleBlink ? 620 : 430);
    }
  }

  function scheduleBlink(delay) {
    clearTimer("blinkTimer");
    if (!canRunIdle()) return;
    state.blinkTimer = window.setTimeout(() => {
      state.blinkTimer = 0;
      performBlink(Math.random() < 0.2, true, false);
    }, delay || randomBetween(4000, 9000));
  }

  function scheduleBreath(delay) {
    clearTimer("breathTimer");
    if (!canRunIdle()) return;
    state.breathTimer = window.setTimeout(() => {
      state.breathTimer = 0;
      if (!canRunIdle()) return;
      state.rig.classList.add("is-breathing");
      queueTimer(state.idleEffects, () => state.rig && state.rig.classList.remove("is-breathing"), 1480);
      scheduleBreath(randomBetween(3300, 5200));
    }, delay || randomBetween(2200, 3800));
  }

  function scheduleWiggle(delay) {
    clearTimer("wiggleTimer");
    if (!canRunIdle()) return;
    state.wiggleTimer = window.setTimeout(() => {
      state.wiggleTimer = 0;
      if (!canRunIdle()) return;
      state.rig.classList.add("is-wiggling");
      queueTimer(state.idleEffects, () => state.rig && state.rig.classList.remove("is-wiggling"), 610);
      scheduleWiggle(randomBetween(8000, 15000));
    }, delay || randomBetween(8000, 15000));
  }

  function scheduleFlip(delay) {
    clearTimer("flipTimer");
    if (!canRunIdle() || state.flipping) return;
    state.flipTimer = window.setTimeout(() => {
      state.flipTimer = 0;
      if (!canRunIdle() || state.flipping) return;
      clearTimerSet(state.blinkFrames);
      setBlinking(false);
      state.flipping = true;
      state.mascot.classList.add("is-flipping");
      queueTimer(state.idleEffects, () => {
        if (!state.mascot) return;
        state.mascot.classList.remove("is-flipping");
        state.flipping = false;
        scheduleBlink(randomBetween(1300, 2800));
        scheduleFlip();
      }, 1320);
    }, delay || randomBetween(8000, 16000));
  }

  function stopIdle() {
    clearTimer("blinkTimer");
    clearTimer("breathTimer");
    clearTimer("wiggleTimer");
    clearTimer("flipTimer");
    clearTimer("resumeTimer");
    clearTimerSet(state.blinkFrames);
    clearTimerSet(state.idleEffects);
    state.flipping = false;
    setBlinking(false);
    if (state.mascot) {
      state.mascot.classList.add("is-active");
      state.mascot.classList.remove("is-flipping");
    }
    if (state.rig) state.rig.classList.remove("is-breathing", "is-wiggling");
  }

  function startIdle(delay) {
    stopIdle();
    if (!state.mascot || reducedMotion.matches) return;
    state.resumeTimer = window.setTimeout(() => {
      state.resumeTimer = 0;
      if (!canRunIdle()) return;
      state.mascot.classList.remove("is-active");
      scheduleBlink();
      scheduleBreath();
      scheduleWiggle();
      scheduleFlip();
    }, delay || 0);
  }

  function updateRestPosition() {
    const mobile = isMobile();
    const size = state.mascot ? state.mascot.offsetWidth : (mobile ? 112 : 168);
    const rightReserve = mobile ? 70 : 86;
    const anchorBottom = mobile ? 22 : 20;
    const restTetherLength = mobile ? CONFIG.restTetherLengthMobile : CONFIG.restTetherLengthDesktop;

    state.anchorX = window.innerWidth - rightReserve - size / 2;
    state.anchorY = window.innerHeight - anchorBottom;
    state.restX = state.anchorX - size / 2;
    state.restY = state.anchorY - restTetherLength - size * 0.82;
  }

  function limitDragOffset(x, y) {
    const maxDistance = isMobile() ? CONFIG.maxDistanceMobile : CONFIG.maxDistanceDesktop;
    const distance = Math.hypot(x, y);
    if (distance <= maxDistance || distance === 0) return { x, y };

    const resistedDistance = Math.min(maxDistance + (distance - maxDistance) * CONFIG.overscrollResistance, maxDistance + CONFIG.maxOverscroll);
    const ratio = resistedDistance / distance;
    return { x: x * ratio, y: y * ratio };
  }

  function getMascotAttachment(x, y) {
    const size = state.mascot.offsetWidth;
    return {
      x: x + size * 0.5,
      y: y + size * 0.82
    };
  }

  /**
   * 所有位移集中在主元素渲染；待机动画使用内层元素，避免覆盖拖拽 transform。
   * 完全静止时恢复整数 left/top，可减少透明 PNG 的亚像素模糊。
   */
  function render() {
    if (!state.mascot) return;
    const atRest = !state.dragging && state.frame === 0 && state.offsetX === 0 && state.offsetY === 0 && state.rotation === 0 && state.scale === 1;
    const x = atRest ? Math.round(state.restX) : state.restX + state.offsetX;
    const y = atRest ? Math.round(state.restY) : state.restY + state.offsetY;
    if (atRest) {
      state.mascot.style.left = `${x}px`;
      state.mascot.style.top = `${y}px`;
      state.mascot.style.transform = "none";
    } else {
      state.mascot.style.left = "0";
      state.mascot.style.top = "0";
      state.mascot.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${state.rotation.toFixed(2)}deg) scale(${state.scale.toFixed(3)})`;
    }

    const attachment = getMascotAttachment(x, y);
    const deltaX = attachment.x - state.anchorX;
    const deltaY = attachment.y - state.anchorY;
    const length = Math.max(1, Math.hypot(deltaX, deltaY));
    const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
    const maxDistance = isMobile() ? CONFIG.maxDistanceMobile : CONFIG.maxDistanceDesktop;
    const tension = clamp(Math.hypot(state.offsetX, state.offsetY) / maxDistance, 0, 1);
    state.rig.style.setProperty("--paper-tension", tension.toFixed(3));
    state.rig.style.setProperty("--paper-thinning", `${(tension * (isMobile() ? 2 : 3)).toFixed(2)}px`);
    state.rig.style.setProperty("--paper-shadow-lift", `${(tension * 2).toFixed(2)}px`);
    state.rig.style.setProperty("--paper-shadow-blur", `${(tension * 4).toFixed(2)}px`);
    state.rig.style.setProperty("--paper-fold-opacity", (0.32 + tension * 0.28).toFixed(3));
    state.rig.style.setProperty("--paper-tilt", `${(-tension * 2).toFixed(2)}deg`);
    state.tether.style.width = `${length.toFixed(2)}px`;
    state.tether.style.transform = `translate3d(${state.anchorX.toFixed(2)}px, ${state.anchorY.toFixed(2)}px, 0) rotate(${angle.toFixed(2)}deg)`;
    state.anchor.style.left = `${state.anchorX.toFixed(2)}px`;
    state.anchor.style.top = `${state.anchorY.toFixed(2)}px`;
  }

  function stopAnimation() {
    if (state.frame) cancelAnimationFrame(state.frame);
    state.frame = 0;
    state.lastFrameTime = 0;
  }

  function settleImmediately() {
    stopAnimation();
    state.offsetX = 0;
    state.offsetY = 0;
    state.velocityX = 0;
    state.velocityY = 0;
    state.rotation = 0;
    state.scale = 1;
    if (state.mascot) state.mascot.classList.remove("is-limit-shaking");
    render();
  }

  /** 半隐式弹簧积分：速度衰减后逐帧回到原点。 */
  function animate(timestamp) {
    if (state.dragging || !state.mascot) {
      stopAnimation();
      return;
    }

    const frameScale = state.lastFrameTime ? clamp((timestamp - state.lastFrameTime) / 16.667, 0.5, 2) : 1;
    state.lastFrameTime = timestamp;
    state.velocityX += -CONFIG.spring * state.offsetX * frameScale;
    state.velocityY += -CONFIG.spring * state.offsetY * frameScale;
    state.velocityX *= Math.pow(CONFIG.damping, frameScale);
    state.velocityY *= Math.pow(CONFIG.damping, frameScale);
    state.offsetX += state.velocityX * frameScale;
    state.offsetY += state.velocityY * frameScale;

    const speedTilt = clamp(state.velocityX * 0.48, -CONFIG.maxRotation, CONFIG.maxRotation);
    state.rotation += (speedTilt - state.rotation) * 0.22;
    state.scale += (1 - state.scale) * 0.2;
    render();

    const settled = Math.abs(state.offsetX) < 0.18 && Math.abs(state.offsetY) < 0.18 && Math.abs(state.velocityX) < 0.1 && Math.abs(state.velocityY) < 0.1 && Math.abs(state.rotation) < 0.12;
    if (settled) {
      settleImmediately();
      startIdle(850);
      return;
    }
    state.frame = requestAnimationFrame(animate);
  }

  function startReturnAnimation() {
    if (reducedMotion.matches) {
      settleImmediately();
      return;
    }
    stopAnimation();
    state.velocityX = clamp(state.velocityX, -24, 24);
    state.velocityY = clamp(state.velocityY, -24, 24);
    state.frame = requestAnimationFrame(animate);
  }

  function handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    stopIdle();
    stopAnimation();
    state.dragging = true;
    state.pointerId = event.pointerId;
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
    state.startOffsetX = state.offsetX;
    state.startOffsetY = state.offsetY;
    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
    state.lastPointerTime = event.timeStamp;
    state.velocityX = 0;
    state.velocityY = 0;
    state.scale = 0.975;
    state.limitShakeTriggered = false;
    clearTimerSet(state.dragEffects);
    state.mascot.classList.remove("is-limit-shaking");
    state.mascot.classList.add("is-dragging");
    performBlink(false, false, true);
    state.mascot.setPointerCapture(event.pointerId);
    render();
  }

  function handlePointerMove(event) {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    const requestedX = state.startOffsetX + event.clientX - state.dragStartX;
    const requestedY = state.startOffsetY + event.clientY - state.dragStartY;
    const requestedDistance = Math.hypot(requestedX, requestedY);
    const maxDistance = isMobile() ? CONFIG.maxDistanceMobile : CONFIG.maxDistanceDesktop;
    const limited = limitDragOffset(requestedX, requestedY);
    const elapsed = Math.max(8, event.timeStamp - state.lastPointerTime);
    const frameFactor = 16.667 / elapsed;
    const pointerVelocityX = (event.clientX - state.lastPointerX) * frameFactor;
    const pointerVelocityY = (event.clientY - state.lastPointerY) * frameFactor;
    state.velocityX = state.velocityX * 0.35 + pointerVelocityX * 0.65;
    state.velocityY = state.velocityY * 0.35 + pointerVelocityY * 0.65;
    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
    state.lastPointerTime = event.timeStamp;
    state.offsetX = limited.x;
    state.offsetY = limited.y;
    state.rotation += (clamp(state.offsetX * 0.035 + state.velocityX * 0.42, -CONFIG.maxRotation, CONFIG.maxRotation) - state.rotation) * 0.38;
    const stretch = Math.hypot(state.offsetX, state.offsetY);
    state.scale = 0.975 + Math.min(stretch / 9000, 0.025);
    if (!state.limitShakeTriggered && requestedDistance >= maxDistance * 0.9 && !reducedMotion.matches) {
      state.limitShakeTriggered = true;
      state.mascot.classList.add("is-limit-shaking");
      queueTimer(state.dragEffects, () => state.mascot && state.mascot.classList.remove("is-limit-shaking"), 390);
    }
    render();
  }

  function handlePointerUp(event) {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    state.dragging = false;
    state.pointerId = null;
    state.mascot.classList.remove("is-dragging");
    state.mascot.classList.remove("is-limit-shaking");
    clearTimerSet(state.dragEffects);
    if (state.mascot.hasPointerCapture(event.pointerId)) state.mascot.releasePointerCapture(event.pointerId);
    startReturnAnimation();
  }

  function handleKeyDown(event) {
    const step = event.shiftKey ? 30 : 12;
    let nextX = state.offsetX;
    let nextY = state.offsetY;
    if (event.key === "ArrowLeft") nextX -= step;
    else if (event.key === "ArrowRight") nextX += step;
    else if (event.key === "ArrowUp") nextY -= step;
    else if (event.key === "ArrowDown") nextY += step;
    else if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      startReturnAnimation();
      return;
    } else return;

    event.preventDefault();
    stopIdle();
    stopAnimation();
    const limited = limitDragOffset(nextX, nextY);
    state.offsetX = limited.x;
    state.offsetY = limited.y;
    state.velocityX = 0;
    state.velocityY = 0;
    state.rotation = clamp(state.offsetX * 0.035, -CONFIG.maxRotation, CONFIG.maxRotation);
    render();
  }

  function handleResize() {
    updateRestPosition();
    render();
  }

  function handleVisibilityChange() {
    if (document.hidden) stopIdle();
    else if (!state.dragging && state.frame === 0 && state.offsetX === 0 && state.offsetY === 0) startIdle(500);
  }

  function handleReducedMotionChange() {
    if (reducedMotion.matches) stopIdle();
    else if (!state.dragging && state.frame === 0) startIdle(500);
  }

  function handleBlinkImageLoad() {
    if (!state.blinkImage) return;
    const decoding = typeof state.blinkImage.decode === "function" ? state.blinkImage.decode() : Promise.resolve();
    decoding.catch(() => {}).finally(() => {
      if (state.blinkImage) state.blinkReady = true;
    });
  }

  function mount() {
    const rig = document.createElement("div");
    rig.className = "drag-mascot-rig";
    rig.innerHTML = `
      <div class="drag-mascot-tether" aria-hidden="true"></div>
      <div class="drag-mascot-anchor" aria-hidden="true"></div>
      <div class="drag-mascot" tabindex="0" role="img" aria-label="被弹力绳固定的看板娘，可以拖动后松手">
        <div class="drag-mascot__idle">
          <div class="drag-mascot__sprite">
            <img class="drag-mascot__image drag-mascot__image--open" src="/images/drag-mascot.png?v=20260816-2" alt="" draggable="false">
            <img class="drag-mascot__image drag-mascot__image--blink" src="/images/drag-mascot-blink.png?v=20260816-1" alt="" draggable="false" decoding="async">
          </div>
        </div>
      </div>`;
    document.body.appendChild(rig);

    state.rig = rig;
    state.mascot = rig.querySelector(".drag-mascot");
    state.sprite = rig.querySelector(".drag-mascot__sprite");
    state.blinkImage = rig.querySelector(".drag-mascot__image--blink");
    state.tether = rig.querySelector(".drag-mascot-tether");
    state.anchor = rig.querySelector(".drag-mascot-anchor");
    updateRestPosition();
    render();

    state.mascot.addEventListener("pointerdown", handlePointerDown);
    state.mascot.addEventListener("pointermove", handlePointerMove);
    state.mascot.addEventListener("pointerup", handlePointerUp);
    state.mascot.addEventListener("pointercancel", handlePointerUp);
    state.mascot.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    reducedMotion.addEventListener("change", handleReducedMotionChange);
    if (state.blinkImage.complete && state.blinkImage.naturalWidth > 0) handleBlinkImageLoad();
    else state.blinkImage.addEventListener("load", handleBlinkImageLoad, { once: true });
    startIdle(1000);
  }

  function destroy() {
    stopIdle();
    stopAnimation();
    clearTimerSet(state.dragEffects);
    window.removeEventListener("resize", handleResize);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    reducedMotion.removeEventListener("change", handleReducedMotionChange);
    if (state.blinkImage) state.blinkImage.removeEventListener("load", handleBlinkImageLoad);
    if (state.mascot) {
      state.mascot.removeEventListener("pointerdown", handlePointerDown);
      state.mascot.removeEventListener("pointermove", handlePointerMove);
      state.mascot.removeEventListener("pointerup", handlePointerUp);
      state.mascot.removeEventListener("pointercancel", handlePointerUp);
      state.mascot.removeEventListener("keydown", handleKeyDown);
    }
    if (state.rig) state.rig.remove();
    state.rig = null;
    state.mascot = null;
    state.sprite = null;
    state.blinkImage = null;
    state.tether = null;
    state.anchor = null;
  }

  window.blogDragMascot = {
    destroy,
    reset: () => {
      settleImmediately();
      startIdle(500);
    },
    blink: () => performBlink(false, false, true)
  };
  mount();
})();
