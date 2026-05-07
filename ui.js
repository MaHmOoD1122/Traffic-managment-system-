/**
 * ui.js — pure DOM rendering helpers
 * Takes data objects and returns HTML strings or updates specific elements.
 */

const UI = (() => {

  // ── helpers ────────────────────────────────
  function initials(name) {
    return (name || "?")
      .split(" ").map(w => w[0] || "").join("")
      .toUpperCase().slice(0, 2) || "?";
  }

  function avatarClass(car) {
    if (car.is_emergency) return "av-amber";
    if (car.has_accident) return "av-red";
    return "av-blue";
  }

  function itemClass(car) {
    if (car.is_emergency) return "emergency";
    if (car.has_accident) return "accident";
    return "good";
  }

  function badgeHTML(car) {
    const s = car.status || "good";
    if (s === "good")            return `<span class="badge good">Good</span>`;
    if (s === "has an accident") return `<span class="badge accident">Accident</span>`;
    if (s === "is emergency")    return `<span class="badge emergency">Emergency</span>`;
    return "";
  }

  function fmtTime(ts) {
    // ts is unix seconds from SQLite
    const d = new Date(ts * 1000);
    return d.getHours().toString().padStart(2,"0") + ":" +
           d.getMinutes().toString().padStart(2,"0");
  }

  // ── templates ──────────────────────────────
  function carItemHTML(car, locationLabel) {
    const loc = locationLabel
      ? `<span style="color:var(--gray-400)"> · ${locationLabel}</span>` : "";
    return `
      <div class="car-item ${itemClass(car)}">
        <div class="car-avatar ${avatarClass(car)}">${initials(car.owner_name)}</div>
        <div class="car-info">
          <div class="car-name">${car.owner_name}${loc}</div>
          <div class="car-meta">Plate&nbsp;${car.plate_number}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          ${badgeHTML(car)}
          <button class="btn-delete-icon" onclick="handleDeleteCar(${car.id})" title="Delete via BST">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>`;
  }

  function noDataHTML(icon, msg) {
    return `<div class="no-data">
      <i class="ti ti-${icon}" aria-hidden="true"></i>${msg}
    </div>`;
  }

  function statCardHTML(label, value, cls) {
    return `<div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value ${cls}">${value}</div>
    </div>`;
  }

  // ── page renderers ──────────────────────────

  function renderStats(s) {
    document.getElementById("stats-grid").innerHTML =
      statCardHTML("On road",   s.on_road,   "blue")  +
      statCardHTML("Exit lane", s.exit_lane, "")      +
      statCardHTML("Accidents", s.accidents, "red")   +
      statCardHTML("Emergency", s.emergency, "amber");
  }

  function renderRoadTrack(cars) {
    const el = document.getElementById("road-track-vis");
    el.innerHTML = cars.length
      ? cars.map(c =>
          `<div class="road-chip"><i class="ti ti-car" aria-hidden="true"></i>${c.owner_name}</div>`
        ).join("")
      : `<span class="empty-lane">Road is empty</span>`;
  }

  function renderExitTrack(cars) {
    const el = document.getElementById("exit-track-vis");
    el.innerHTML = cars.length
      ? cars.map(c =>
          `<div class="road-chip emerg"><i class="ti ti-ambulance" aria-hidden="true"></i>${c.owner_name}</div>`
        ).join("")
      : `<span class="empty-lane">Exit lane empty</span>`;
  }

  function renderCarList(elId, cars, locationLabel) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = cars.length
      ? cars.map(c => carItemHTML(c, locationLabel)).join("")
      : noDataHTML("circle-check", "Nothing here");
  }

  function renderCountBadge(elId, count) {
    const el = document.getElementById(elId);
    if (el) el.textContent = count;
  }

  function renderBSTStats(allCount) {
    document.getElementById("bst-stats").innerHTML =
      statCardHTML("Plate BST nodes", allCount, "blue") +
      statCardHTML("Name BST nodes",  allCount, "blue") +
      statCardHTML("Searchable lists", 4, "") +
      statCardHTML("Total cars", allCount, "green");
  }

  function renderSearchResult(data) {
    const el = document.getElementById("search-result");
    if (!data.found || !data.results.length) {
      el.innerHTML = `<div class="not-found">
        <i class="ti ti-search-off" aria-hidden="true"></i>${data.message || "Not found"}
      </div>`;
      return;
    }
    el.innerHTML = data.results.map(r => `
      <div class="result-box" style="margin-bottom:8px">
        <h3><i class="ti ti-circle-check" aria-hidden="true"></i> Car found — ${r.location}</h3>
        <div class="result-row-item"><span>Owner name</span><span>${r.owner_name}</span></div>
        <div class="result-row-item"><span>Plate number</span><span>${r.plate_number}</span></div>
        <div class="result-row-item"><span>Location</span><span>${r.location}</span></div>
        <div class="result-row-item"><span>Status</span><span>${r.status}</span></div>
        <div class="result-row-item"><span>Has accident</span><span>${r.has_accident ? "Yes" : "No"}</span></div>
        <div class="result-row-item"><span>Is emergency</span><span>${r.is_emergency ? "Yes" : "No"}</span></div>
      </div>`).join("");
  }

  function renderLog(logs) {
    const el = document.getElementById("log-container");
    if (!logs.length) {
      el.innerHTML = noDataHTML("list", "No activity yet");
      return;
    }
    el.innerHTML = logs.map(l => `
      <div class="log-item">
        <span class="log-time">${fmtTime(l.created_at)}</span>
        <span class="log-dot ${l.log_type}"></span>
        <span class="log-msg">${l.message}</span>
      </div>`).join("");
  }

  // ── Toast ───────────────────────────────────
  function toast(msg, type = "normal") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    const icons = { success:"circle-check", error:"alert-circle", warning:"alert-triangle", normal:"info-circle" };
    el.innerHTML = `<i class="ti ti-${icons[type]||icons.normal}" aria-hidden="true"></i>${msg}`;
    document.getElementById("toast-container").appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ── API status dot ──────────────────────────
  function setApiStatus(online) {
    const dot  = document.getElementById("api-dot");
    const text = document.getElementById("api-status-text");
    dot.className  = "api-dot " + (online ? "online" : "offline");
    text.textContent = online ? "API connected" : "API offline";
  }

  return {
    renderStats, renderRoadTrack, renderExitTrack,
    renderCarList, renderCountBadge, renderBSTStats,
    renderSearchResult, renderLog,
    carItemHTML, noDataHTML, statCardHTML,
    toast, setApiStatus,
    initials,
  };
})();
