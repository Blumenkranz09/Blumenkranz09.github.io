/**
 * 首页本地时间与天气卡片。
 * 最后一次有效天气会立即显示并在后台刷新；接口失败不会清空已有数据。
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
    locationCacheMs: 4 * 60 * 60 * 1000,
    weatherCacheMs: 5 * 60 * 1000,
    geolocationTimeoutMs: 10000,
    requestTimeoutMs: 8000,
    retryDelayMs: 800
  };

  const CACHE_KEY = "blog-weather-clock:v1";
  const previousInstance = window.blogWeatherClock;
  if (previousInstance && typeof previousInstance.destroy === "function") {
    previousInstance.destroy();
  }

  const state = {
    card: null,
    clockTimer: 0,
    weatherTimer: 0,
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

  function finiteNumber(value, min = -Infinity, max = Infinity) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  }

  function isValidLocation(location) {
    return Boolean(location) &&
      finiteNumber(location.latitude, -90, 90) !== null &&
      finiteNumber(location.longitude, -180, 180) !== null;
  }

  function isValidWeather(weather) {
    return Boolean(weather) &&
      finiteNumber(weather.temperature, -90, 65) !== null &&
      finiteNumber(weather.fetchedAt, 1) !== null;
  }

  function sameLocation(weather, location) {
    return isValidWeather(weather) && isValidLocation(location) &&
      Math.abs(Number(weather.latitude) - Number(location.latitude)) < 0.01 &&
      Math.abs(Number(weather.longitude) - Number(location.longitude)) < 0.01;
  }

  function readCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
    } catch (_) {
      return {};
    }
  }

  function writeCache(location, weather) {
    // 只保存完整成功结果，禁止失败请求用 null 覆盖最后一次有效数据。
    if (!isValidLocation(location) || !sameLocation(weather, location)) return;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ location, weather }));
    } catch (_) {}
  }

  function requestJson(url) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
    state.controllers.add(controller);

    return fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" }
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).finally(() => {
      window.clearTimeout(timer);
      state.controllers.delete(controller);
    });
  }

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function withRetry(request) {
    try {
      return await request();
    } catch (error) {
      if (error && error.name === "AbortError") throw error;
      await delay(CONFIG.retryDelayMs);
      return request();
    }
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
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        }),
        reject,
        {
          enableHighAccuracy: true,
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
    const latitude = finiteNumber(coordinates ? coordinates.latitude : data.latitude, -90, 90);
    const longitude = finiteNumber(coordinates ? coordinates.longitude : data.longitude, -180, 180);
    if (latitude === null || longitude === null) throw new Error("Invalid geocoding coordinates");
    return {
      city: normalizeCity(data),
      latitude,
      longitude,
      accuracy: coordinates ? finiteNumber(coordinates.accuracy, 0) : null,
      timezone: (data.timeZone && data.timeZone.ianaTimeId) || data.timezone || CONFIG.fallback.timezone,
      source: coordinates ? "device" : "ip",
      locatedAt: Date.now()
    };
  }

  async function detectLocation(lastLocation) {
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
      // 定位暂时失败时优先沿用上一次设备坐标，避免跳回默认城市。
      if (isValidLocation(lastLocation) && String(lastLocation.source || "").startsWith("device")) {
        return { ...lastLocation, source: "device-cache" };
      }
      try {
        return await reverseGeocode();
      } catch (_) {
        return { ...CONFIG.fallback, source: "fallback", locatedAt: Date.now() };
      }
    }
  }

  function nearestHourlyTemperature(data, currentTime) {
    const times = data && data.hourly && Array.isArray(data.hourly.time) ? data.hourly.time : [];
    const values = data && data.hourly && Array.isArray(data.hourly.temperature_2m) ? data.hourly.temperature_2m : [];
    if (!times.length || times.length !== values.length) return null;
    const target = Date.parse(currentTime || "");
    let result = null;
    let distance = Infinity;
    times.forEach((time, index) => {
      const value = finiteNumber(values[index], -90, 65);
      const timestamp = Date.parse(time);
      if (value === null || !Number.isFinite(timestamp)) return;
      const nextDistance = Number.isFinite(target) ? Math.abs(timestamp - target) : index;
      if (nextDistance < distance) {
        result = value;
        distance = nextDistance;
      }
    });
    return result;
  }

  async function getOpenMeteoWeather(location) {
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: "temperature_2m,weather_code,wind_direction_10m,is_day,precipitation,rain,showers,cloud_cover",
      hourly: "temperature_2m",
      forecast_days: "1",
      timezone: "auto"
    });
    const data = await withRetry(() => requestJson(`https://api.open-meteo.com/v1/forecast?${params}`));
    const current = data.current || {};
    const currentTemperature = finiteNumber(current.temperature_2m, -90, 65);
    const temperature = currentTemperature !== null
      ? currentTemperature
      : nearestHourlyTemperature(data, current.time);
    const weatherCode = finiteNumber(current.weather_code, 0, 99);
    if (temperature === null || weatherCode === null) {
      throw new Error("Open-Meteo returned incomplete weather data");
    }

    return {
      provider: "open-meteo",
      temperature: Math.round(temperature),
      weatherCode,
      windDirection: finiteNumber(current.wind_direction_10m, 0, 360),
      isDay: finiteNumber(current.is_day, 0, 1) !== 0,
      precipitation: finiteNumber(current.precipitation, 0),
      rain: finiteNumber(current.rain, 0),
      showers: finiteNumber(current.showers, 0),
      cloudCover: finiteNumber(current.cloud_cover, 0, 100),
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      fetchedAt: Date.now(),
      observedAt: current.time || null,
      timezone: data.timezone || location.timezone
    };
  }

  async function getWeather(location) {
    return getOpenMeteoWeather(location);
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

    if (!isValidWeather(state.weather)) {
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
    state.card.querySelector("[data-clock-temperature]").textContent = `${Math.round(state.weather.temperature)}°`;
    state.card.querySelector("[data-clock-wind]").textContent = windLabel(state.weather.windDirection);
    state.card.querySelector("[data-clock-wind-icon]").style.setProperty("--wind-arrow-rotation", `${(state.weather.windDirection || 0) - 45}deg`);
    const stale = Date.now() - state.weather.fetchedAt > CONFIG.weatherCacheMs;
    const details = [
      "Open-Meteo",
      stale ? "缓存数据" : "实时数据",
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
    // 卡片长时间停留在首页时也定期刷新，不让温度停在首次加载值。
    state.weatherTimer = window.setInterval(() => refresh(false), CONFIG.weatherCacheMs);
    return true;
  }

  async function refresh(forceLocation) {
    if (!state.card) return;
    if (forceLocation) abortRequests();
    const currentRefresh = ++state.refreshId;
    const cache = readCache();
    const now = Date.now();
    const cachedPairIsValid = isValidLocation(cache.location) && sameLocation(cache.weather, cache.location);

    // 先恢复最后一次有效数据；点击重新定位也不会把温度清空。
    if (!isValidWeather(state.weather) && cachedPairIsValid) {
      state.location = cache.location;
      state.weather = cache.weather;
    }
    renderWeather();
    updateClock();
    state.card.dataset.loading = "true";
    state.card.setAttribute("aria-busy", "true");

    try {
      const hasFreshLocation = cachedPairIsValid && now - Number(cache.location.locatedAt || 0) < CONFIG.locationCacheMs;
      const location = !forceLocation && hasFreshLocation
        ? cache.location
        : await detectLocation(cachedPairIsValid ? cache.location : null);
      if (currentRefresh !== state.refreshId || !state.card) return;

      const hasFreshWeather = !forceLocation && cachedPairIsValid && sameLocation(cache.weather, location) &&
        now - Number(cache.weather.fetchedAt) < CONFIG.weatherCacheMs;
      if (hasFreshWeather) {
        state.location = cache.location;
        state.weather = cache.weather;
      } else {
        const weather = await getWeather(location);
        if (currentRefresh !== state.refreshId || !state.card) return;
        if (!isValidWeather(weather) || !sameLocation(weather, location)) {
          throw new Error("Invalid weather response");
        }
        // 城市和天气同时提交，避免定位过程中出现城市与天气错配。
        state.location = { ...location, timezone: weather.timezone || location.timezone };
        state.weather = weather;
        writeCache(state.location, state.weather);
      }
    } catch (_) {
      if (currentRefresh !== state.refreshId || !state.card) return;
      // 保持当前/缓存的成功结果；失败时绝不写入空缓存。
      if (!isValidWeather(state.weather) && cachedPairIsValid) {
        state.location = cache.location;
        state.weather = cache.weather;
      }
    } finally {
      if (currentRefresh === state.refreshId && state.card) {
        renderWeather();
        updateClock();
        state.card.dataset.loading = "false";
        state.card.setAttribute("aria-busy", "false");
      }
    }
  }

  function destroy() {
    state.refreshId += 1;
    window.clearInterval(state.clockTimer);
    window.clearInterval(state.weatherTimer);
    abortRequests();
    if (state.card) state.card.remove();
    state.card = null;
  }

  window.blogWeatherClock = { destroy, refresh: () => refresh(true) };
  if (mountCard()) refresh(false);
})();
