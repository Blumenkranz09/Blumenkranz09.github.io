/**
 * 首页本地时间与天气卡片。
 * 定位按天缓存、天气短时缓存；接口失败时逐级回退到 IP 和默认城市。
 */
(function () {
  "use strict";

  const CONFIG = {
    fallback: {
      city: "杭州",
      latitude: 30.2741,
      longitude: 120.1551,
      timezone: "Asia/Shanghai"
    },
    locationCacheMs: 24 * 60 * 60 * 1000,
    weatherCacheMs: 12 * 60 * 1000,
    geolocationTimeoutMs: 8000,
    requestTimeoutMs: 8000
  };

  const CACHE_KEY = "blog-weather-clock:v1";
  const previousInstance = window.blogWeatherClock;
  if (previousInstance && typeof previousInstance.destroy === "function") {
    previousInstance.destroy();
  }

  const state = {
    card: null,
    clockTimer: 0,
    controllers: new Set(),
    refreshId: 0,
    location: { ...CONFIG.fallback },
    weather: null
  };

  const weatherMap = [
    { codes: [0], label: "晴", dayIcon: "fa-sun", nightIcon: "fa-moon" },
    { codes: [1, 2], label: "多云", dayIcon: "fa-cloud-sun", nightIcon: "fa-cloud-moon" },
    { codes: [3], label: "阴", dayIcon: "fa-cloud", nightIcon: "fa-cloud" },
    { codes: [45, 48], label: "雾", dayIcon: "fa-smog", nightIcon: "fa-smog" },
    { codes: [51, 53, 55, 56, 57], label: "毛毛雨", dayIcon: "fa-cloud-rain", nightIcon: "fa-cloud-rain" },
    { codes: [61, 63, 65, 66, 67], label: "雨", dayIcon: "fa-cloud-rain", nightIcon: "fa-cloud-rain" },
    { codes: [71, 73, 75, 77], label: "雪", dayIcon: "fa-snowflake", nightIcon: "fa-snowflake" },
    { codes: [80, 81, 82], label: "阵雨", dayIcon: "fa-cloud-showers-heavy", nightIcon: "fa-cloud-showers-heavy" },
    { codes: [85, 86], label: "阵雪", dayIcon: "fa-snowflake", nightIcon: "fa-snowflake" },
    { codes: [95, 96, 99], label: "雷雨", dayIcon: "fa-cloud-bolt", nightIcon: "fa-cloud-bolt" }
  ];

  function readCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
    } catch (_) {
      return {};
    }
  }

  function writeCache(value) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(value));
    } catch (_) {}
  }

  function requestJson(url) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
    state.controllers.add(controller);

    return fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).finally(() => {
      window.clearTimeout(timer);
      state.controllers.delete(controller);
    });
  }

  /** 中止仍在进行的接口请求，防止重复定位产生旧响应覆盖新响应。 */
  function abortRequests() {
    state.controllers.forEach((controller) => controller.abort());
    state.controllers.clear();
  }

  function getBrowserCoordinates() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is unavailable"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }),
        reject,
        {
          enableHighAccuracy: false,
          maximumAge: 0,
          timeout: CONFIG.geolocationTimeoutMs
        }
      );
    });
  }

  function normalizeCity(data) {
    return data.city || data.locality || data.principalSubdivision || data.countryName || "当前位置";
  }

  async function reverseGeocode(coordinates) {
    const params = new URLSearchParams({ localityLanguage: "zh" });
    if (coordinates) {
      params.set("latitude", String(coordinates.latitude));
      params.set("longitude", String(coordinates.longitude));
    }

    const data = await requestJson(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`);
    return {
      city: normalizeCity(data),
      latitude: Number(coordinates ? coordinates.latitude : data.latitude),
      longitude: Number(coordinates ? coordinates.longitude : data.longitude),
      timezone: (data.timeZone && data.timeZone.ianaTimeId) || data.timezone || CONFIG.fallback.timezone,
      source: coordinates ? "device" : "ip",
      locatedAt: Date.now()
    };
  }

  async function detectLocation() {
    try {
      const coordinates = await getBrowserCoordinates();
      try {
        return await reverseGeocode(coordinates);
      } catch (_) {
        return {
          city: "当前位置",
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || CONFIG.fallback.timezone,
          source: "device",
          locatedAt: Date.now()
        };
      }
    } catch (_) {
      try {
        return await reverseGeocode();
      } catch (_) {
        return { ...CONFIG.fallback, source: "fallback", locatedAt: Date.now() };
      }
    }
  }

  async function getWeather(location) {
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: "temperature_2m,weather_code,wind_direction_10m,is_day,precipitation,rain,showers,cloud_cover",
      timezone: "auto"
    });
    const data = await requestJson(`https://api.open-meteo.com/v1/forecast?${params}`);
    const current = data.current || {};

    return {
      temperature: Math.round(Number(current.temperature_2m)),
      weatherCode: Number(current.weather_code),
      windDirection: Number(current.wind_direction_10m),
      isDay: Number(current.is_day) !== 0,
      precipitation: Number(current.precipitation),
      rain: Number(current.rain),
      showers: Number(current.showers),
      cloudCover: Number(current.cloud_cover),
      latitude: location.latitude,
      longitude: location.longitude,
      fetchedAt: Date.now(),
      timezone: data.timezone || location.timezone
    };
  }

  function weatherDescription(weather) {
    const { weatherCode: code, isDay } = weather;
    const precipitationValues = [weather.precipitation, weather.rain, weather.showers]
      .filter(Number.isFinite);
    const precipitation = precipitationValues.length ? Math.max(...precipitationValues) : null;

    // 模型偶尔会给出“毛毛雨”代码但降水量为零；此时以云量作为更符合日常认知的描述。
    if ([51, 53, 55, 56, 57].includes(code) && precipitation !== null && precipitation < 0.1) {
      const overcast = Number.isFinite(weather.cloudCover) && weather.cloudCover >= 85;
      return {
        label: overcast ? "阴" : "多云",
        icon: overcast ? "fa-cloud" : (isDay ? "fa-cloud-sun" : "fa-cloud-moon")
      };
    }

    const item = weatherMap.find((entry) => entry.codes.includes(code)) || {
      label: "天气",
      dayIcon: "fa-cloud",
      nightIcon: "fa-cloud"
    };
    return { label: item.label, icon: isDay ? item.dayIcon : item.nightIcon };
  }

  function windLabel(degrees) {
    if (!Number.isFinite(degrees)) return "风向未知";
    const directions = ["北风", "东北风", "东风", "东南风", "南风", "西南风", "西风", "西北风"];
    return directions[Math.round(degrees / 45) % 8];
  }

  function getDateParts(date, timezone) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
    return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  }

  function updateClock() {
    if (!state.card || !state.card.isConnected) return;
    let parts;
    try {
      parts = getDateParts(new Date(), state.location.timezone || CONFIG.fallback.timezone);
    } catch (_) {
      parts = getDateParts(new Date(), CONFIG.fallback.timezone);
    }

    state.card.querySelector("[data-clock-date]").innerHTML = `${parts.year}-${parts.month}-${parts.day}<span class="weather-clock-card__weekday"> · ${parts.weekday.toUpperCase()}</span>`;
    const time = state.card.querySelector("[data-clock-time]");
    time.dateTime = `${parts.hour}:${parts.minute}:${parts.second}`;
    time.setAttribute("aria-label", `${parts.hour} 时 ${parts.minute} 分 ${parts.second} 秒`);
    time.innerHTML = `${parts.hour}:${parts.minute}<span class="weather-clock-card__time-seconds">:${parts.second}</span>`;
    state.card.querySelector("[data-clock-period]").textContent = Number(parts.hour) < 12 ? "AM" : "PM";
  }

  function renderWeather() {
    if (!state.card) return;
    const city = state.card.querySelector("[data-clock-city]");
    city.textContent = state.location.city;
    city.title = state.location.source === "device" ? "精确定位 · 点击重新定位" : state.location.source === "ip" ? "IP 粗略定位 · 点击重新定位" : "默认城市 · 点击重新定位";

    if (!state.weather) {
      const icon = state.card.querySelector("[data-clock-icon]");
      icon.className = "fa-solid fa-cloud";
      state.card.querySelector("[data-clock-condition]").textContent = "天气";
      state.card.querySelector("[data-clock-temperature]").textContent = "--°";
      state.card.querySelector("[data-clock-wind]").textContent = "风向未知";
      state.card.querySelector("[data-clock-wind-icon]").style.setProperty("--wind-arrow-rotation", "0deg");
      state.card.title = "天气数据暂不可用";
      return;
    }
    const description = weatherDescription(state.weather);
    const icon = state.card.querySelector("[data-clock-icon]");
    icon.className = `fa-solid ${description.icon}`;
    state.card.querySelector("[data-clock-condition]").textContent = description.label;
    state.card.querySelector("[data-clock-temperature]").textContent = Number.isFinite(state.weather.temperature) ? `${state.weather.temperature}°` : "--°";
    state.card.querySelector("[data-clock-wind]").textContent = windLabel(state.weather.windDirection);
    state.card.querySelector("[data-clock-wind-icon]").style.setProperty("--wind-arrow-rotation", `${(state.weather.windDirection || 0) - 45}deg`);
    const details = [
      `WMO ${state.weather.weatherCode}`,
      Number.isFinite(state.weather.precipitation) ? `降水 ${state.weather.precipitation} mm` : "",
      Number.isFinite(state.weather.cloudCover) ? `云量 ${state.weather.cloudCover}%` : ""
    ].filter(Boolean).join(" · ");
    state.card.title = `天气更新于 ${new Date(state.weather.fetchedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}${details ? ` · ${details}` : ""}`;
  }

  function createCard() {
    const card = document.createElement("section");
    card.className = "weather-clock-card";
    card.setAttribute("aria-label", "当地时间与天气");
    card.dataset.loading = "true";
    card.innerHTML = `
      <div class="weather-clock-card__top">
        <span class="weather-clock-card__date" data-clock-date>---- -- -- ---</span>
        <span class="weather-clock-card__weather">
          <i class="fa-solid fa-cloud" data-clock-icon aria-hidden="true"></i>
          <span class="weather-clock-card__condition" data-clock-condition>天气</span>
          <span data-clock-temperature>--°</span>
        </span>
      </div>
      <time class="weather-clock-card__time" data-clock-time>--:--<span class="weather-clock-card__time-seconds">:--</span></time>
      <div class="weather-clock-card__bottom">
        <span class="weather-clock-card__wind">
          <i class="fa-solid fa-location-arrow" data-clock-wind-icon aria-hidden="true"></i>
          <span data-clock-wind>风向未知</span>
        </span>
        <button class="weather-clock-card__city" type="button" data-clock-city title="点击重新定位">定位中…</button>
        <span class="weather-clock-card__period" data-clock-period>AM</span>
      </div>`;
    return card;
  }

  function mountCard() {
    const sidebar = document.querySelector(".home-sidebar-container .sticky-container");
    if (!sidebar) return false;

    const oldCard = sidebar.querySelector(".weather-clock-card");
    if (oldCard) oldCard.remove();
    state.card = createCard();
    const profileCard = sidebar.querySelector(".sidebar-content");
    if (profileCard) profileCard.insertAdjacentElement("afterend", state.card);
    else sidebar.appendChild(state.card);

    state.card.querySelector("[data-clock-city]").addEventListener("click", () => refresh(true));
    updateClock();
    state.clockTimer = window.setInterval(updateClock, 1000);
    return true;
  }

  async function refresh(forceLocation) {
    if (!state.card) return;
    if (forceLocation) abortRequests();
    const currentRefresh = ++state.refreshId;
    state.card.dataset.loading = "true";
    state.card.setAttribute("aria-busy", "true");
    const cache = forceLocation ? {} : readCache();
    const now = Date.now();
    const hasFreshLocation = cache.location && now - cache.location.locatedAt < CONFIG.locationCacheMs;

    const location = hasFreshLocation ? cache.location : await detectLocation();
    if (currentRefresh !== state.refreshId || !state.card) return;
    state.location = location;

    const weatherMatchesLocation = cache.weather &&
      Math.abs(cache.weather.latitude - state.location.latitude) < 0.01 &&
      Math.abs(cache.weather.longitude - state.location.longitude) < 0.01;
    const hasClassificationData = weatherMatchesLocation &&
      Number.isFinite(cache.weather.precipitation) &&
      Number.isFinite(cache.weather.cloudCover);
    const hasFreshWeather = hasClassificationData && now - cache.weather.fetchedAt < CONFIG.weatherCacheMs && hasFreshLocation;
    // 切换城市时先清空旧城市天气，避免定位期间显示不匹配的数据。
    state.weather = weatherMatchesLocation ? cache.weather : null;
    renderWeather();
    updateClock();

    if (hasFreshWeather) {
      state.weather = cache.weather;
    } else {
      try {
        const weather = await getWeather(state.location);
        if (currentRefresh !== state.refreshId || !state.card) return;
        state.weather = weather;
        if (weather.timezone) state.location.timezone = weather.timezone;
      } catch (_) {
        if (currentRefresh !== state.refreshId || !state.card) return;
        state.weather = weatherMatchesLocation ? cache.weather : null;
      }
    }

    if (currentRefresh !== state.refreshId || !state.card) return;
    writeCache({ location: state.location, weather: state.weather });
    renderWeather();
    updateClock();
    state.card.dataset.loading = "false";
    state.card.setAttribute("aria-busy", "false");
  }

  function destroy() {
    state.refreshId += 1;
    window.clearInterval(state.clockTimer);
    abortRequests();
    if (state.card) state.card.remove();
    state.card = null;
  }

  window.blogWeatherClock = { destroy, refresh: () => refresh(true) };
  if (mountCard()) refresh(false);
})();
