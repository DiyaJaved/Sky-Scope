(() => {
"use strict";

// Your WeatherAPI.com key. Visible to anyone who opens the page source,
// so restrict or rotate it if the site goes public.
const API_KEY = "bda944ef8ecb4d16a5e102442263110";
const ENDPOINT = "https://api.weatherapi.com/v1/forecast.json";
const DEFAULT_CITY = "Lahore";

const $ = (id) => document.getElementById(id);
const els = {
  form: $("searchForm"), q: $("q"), locate: $("locate"), recent: $("recent"),
  msg: $("msg"), app: $("app"), city: $("city"), localtime: $("localtime"),
  temp: $("temp"), icon: $("icon"), condText: $("condText"), feels: $("feels"),
  sunrise: $("sunrise"), sunset: $("sunset"),
  hours: $("hours"), days: $("days"), stats: $("stats")
};

let unit = safeGet("unit") || "c";
let lastData = null;

/* ---------- storage helpers (fail quietly) ---------- */
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

/* ---------- helpers ---------- */
const t = (o, base) => Math.round(unit === "c" ? o[base + "_c"] : o[base + "_f"]);
const icon = (url) => url.startsWith("//") ? "https:" + url : url;
const clock = (s) => s.slice(-5);

function themeFor(cur) {
  if (!cur.is_day) return "night";
  const c = cur.condition.code;
  if ([1087, 1273, 1276, 1279, 1282].includes(c)) return "storm";
  if ([1063, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1192, 1195, 1198, 1201, 1240, 1243, 1246].includes(c)) return "rain";
  if ([1066, 1069, 1072, 1114, 1117, 1204, 1207, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1249, 1252, 1255, 1258, 1261, 1264].includes(c)) return "snow";
  if ([1030, 1135, 1147].includes(c)) return "fog";
  if ([1003, 1006, 1009].includes(c)) return "cloud";
  return "sun";
}

function showMessage(text) { els.msg.textContent = text; els.msg.hidden = false; }
function clearMessage() { els.msg.hidden = true; }

/* ---------- data ---------- */
async function load(query) {
  clearMessage();
  els.app.classList.add("loading");
  try {
    const url = `${ENDPOINT}?key=${encodeURIComponent(API_KEY)}&q=${encodeURIComponent(query)}&days=5&aqi=no&alerts=no`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) {
      const code = data.error && data.error.code;
      if (code === 1006) throw new Error(`No city found for "${query}". Check the spelling or try a nearby city.`);
      if (code === 2006 || code === 2007 || code === 2008) throw new Error("The API key was rejected or has hit its limit. Check the key in the script.");
      throw new Error((data.error && data.error.message) || "Weather could not be loaded.");
    }
    lastData = data;
    render();
    remember(data.location.name);
    els.app.hidden = false;
  } catch (err) {
    showMessage(err instanceof TypeError ? "Could not reach the weather service. Check your internet connection and try again." : err.message);
  } finally {
    els.app.classList.remove("loading");
  }
}

/* ---------- rendering ---------- */
function render() {
  if (!lastData) return;
  const { location: loc, current: cur, forecast } = lastData;
  const today = forecast.forecastday[0];
  const sym = unit === "c" ? "°C" : "°F";

  document.body.dataset.theme = themeFor(cur);
  document.title = `${t(cur, "temp")}° ${loc.name} · Weather`;

  els.city.textContent = loc.name;
  const place = [loc.region, loc.country].filter(Boolean).join(", ");
  els.localtime.textContent = `${place} · ${loc.localtime.slice(-5)} local time`;
  els.temp.innerHTML = `${t(cur, "temp")}<sup>${sym}</sup>`;
  els.icon.src = icon(cur.condition.icon);
  els.icon.alt = cur.condition.text;
  els.condText.textContent = cur.condition.text;
  els.feels.textContent = `Feels like ${t(cur, "feelslike")}°`;
  els.sunrise.textContent = today.astro.sunrise;
  els.sunset.textContent = today.astro.sunset;

  // Next 24 hours, starting from the current local hour
  const nowEpoch = loc.localtime_epoch - 3600;
  const hours = forecast.forecastday.flatMap((d) => d.hour).filter((h) => h.time_epoch >= nowEpoch).slice(0, 24);
  els.hours.innerHTML = hours.map((h, i) => `
    <div class="hour">
      <div class="t">${i === 0 ? "Now" : clock(h.time)}</div>
      <img src="${icon(h.condition.icon)}" alt="${h.condition.text}" loading="lazy">
      <div class="v">${t(h, "temp")}°</div>
      <div class="r">${h.chance_of_rain > 0 ? h.chance_of_rain + "% rain" : ""}</div>
    </div>`).join("");

  // 5-day forecast with a shared min/max scale
  const days = forecast.forecastday;
  const lows = days.map((d) => d.day[unit === "c" ? "mintemp_c" : "mintemp_f"]);
  const highs = days.map((d) => d.day[unit === "c" ? "maxtemp_c" : "maxtemp_f"]);
  const min = Math.min(...lows), max = Math.max(...highs), span = (max - min) || 1;
  els.days.innerHTML = days.map((d, i) => {
    const lo = d.day[unit === "c" ? "mintemp_c" : "mintemp_f"];
    const hi = d.day[unit === "c" ? "maxtemp_c" : "maxtemp_f"];
    const date = new Date(d.date + "T12:00:00");
    const label = i === 0 ? "Today" : date.toLocaleDateString(undefined, { weekday: "long" });
    const left = ((lo - min) / span) * 100, width = ((hi - lo) / span) * 100;
    return `
    <li class="day">
      <div class="name">${label}<small>${d.day.condition.text}${d.day.daily_chance_of_rain ? " · " + d.day.daily_chance_of_rain + "% rain" : ""}</small></div>
      <img src="${icon(d.day.condition.icon)}" alt="" loading="lazy">
      <div class="range">
        <span class="lo">${Math.round(lo)}°</span>
        <div class="bar-track"><div class="bar-fill" style="left:${left}%;width:${Math.max(width, 6)}%"></div></div>
        <span>${Math.round(hi)}°</span>
      </div>
    </li>`;
  }).join("");

  // Detail stats
  const wind = unit === "c" ? `${Math.round(cur.wind_kph)} km/h` : `${Math.round(cur.wind_mph)} mph`;
  const vis = unit === "c" ? `${cur.vis_km} km` : `${cur.vis_miles} mi`;
  const stats = [
    ["Humidity", `${cur.humidity}%`],
    ["Wind", `${wind} ${cur.wind_dir}`],
    ["UV index", cur.uv],
    ["Visibility", vis],
    ["Pressure", `${Math.round(cur.pressure_mb)} hPa`],
    ["Cloud cover", `${cur.cloud}%`]
  ];
  els.stats.innerHTML = stats.map(([k, v]) => `<div class="panel stat"><span>${k}</span><b>${v}</b></div>`).join("");
}

/* ---------- recent searches ---------- */
function recents() { try { return JSON.parse(safeGet("recent") || "[]"); } catch { return []; } }
function remember(name) {
  const list = [name, ...recents().filter((c) => c.toLowerCase() !== name.toLowerCase())].slice(0, 5);
  safeSet("recent", JSON.stringify(list));
  safeSet("last", name);
  drawRecents();
}
function drawRecents() {
  els.recent.innerHTML = "";
  recents().forEach((c) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = c;
    b.addEventListener("click", () => load(c));
    els.recent.appendChild(b);
  });
}

/* ---------- events ---------- */
els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = els.q.value.trim();
  if (v) { load(v); els.q.blur(); }
});

els.locate.addEventListener("click", () => {
  if (!navigator.geolocation) return showMessage("Your browser does not support location. Search for a city instead.");
  els.locate.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    (pos) => { els.locate.textContent = "Use my location"; load(`${pos.coords.latitude},${pos.coords.longitude}`); },
    () => { els.locate.textContent = "Use my location"; showMessage("Location access was blocked. Allow it in your browser settings or search for a city."); },
    { timeout: 10000 }
  );
});

document.querySelectorAll(".units button").forEach((b) => {
  b.addEventListener("click", () => {
    unit = b.dataset.unit;
    safeSet("unit", unit);
    syncUnits();
    render();
  });
});
function syncUnits() {
  document.querySelectorAll(".units button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.unit === unit)));
}

/* ---------- start ---------- */
syncUnits();
drawRecents();
load(safeGet("last") || DEFAULT_CITY);
})();
