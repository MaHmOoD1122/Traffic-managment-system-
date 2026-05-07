/**
 * app.js — main application controller
 * Wires together API calls, UI rendering, and user interactions.
 */

let searchMode = "plate";

// ── Page navigation ─────────────────────────────
function showPage(name, el) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById("page-" + name).classList.add("active");
  if (el) el.classList.add("active");
  else {
    const tab = document.querySelector(`[data-page="${name}"]`);
    if (tab) tab.classList.add("active");
  }

  const loaders = {
    dashboard: refreshAll,
    road:      loadRoadPage,
    search:    loadSearchPage,
    log:       loadLog,
  };
  if (loaders[name]) loaders[name]();
}

// ── Dashboard ────────────────────────────────────
async function refreshAll() {
  try {
    const [stats, road, exit, accidents] = await Promise.all([
      API.getStats(),
      API.getRoad(),
      API.getExitLane(),
      API.getAccidentCars(),
    ]);
    UI.renderStats(stats);
    UI.renderRoadTrack(road);
    UI.renderExitTrack(exit);
    UI.renderCarList("dash-accident-list", accidents);
  } catch (err) {
    UI.toast("Failed to load dashboard: " + err.message, "error");
  }
}

// ── Road page ────────────────────────────────────
async function loadRoadPage() {
  try {
    const [road, exit, accidents] = await Promise.all([
      API.getRoad(),
      API.getExitLane(),
      API.getAccidentCars(),
    ]);
    UI.renderCarList("road-list",     road);
    UI.renderCarList("exit-list",     exit);
    UI.renderCarList("accident-list", accidents);
    UI.renderCountBadge("road-count",     road.length);
    UI.renderCountBadge("exit-count",     exit.length);
    UI.renderCountBadge("accident-count", accidents.length);
  } catch (err) {
    UI.toast("Failed to load road data: " + err.message, "error");
  }
}

async function handleAccidents() {
  try {
    const res = await API.handleAccidents();
    if (!res.moved.length) { UI.toast(res.message, "warning"); return; }
    UI.toast(`${res.moved.length} car(s) moved to accident list.`, "success");
    loadRoadPage();
  } catch (err) {
    UI.toast("Error: " + err.message, "error");
  }
}

async function handleEmergency() {
  try {
    const res = await API.handleEmergency();
    if (!res.moved.length) { UI.toast(res.message, "warning"); return; }
    UI.toast(`${res.moved.length} emergency car(s) moved to exit lane.`, "success");
    loadRoadPage();
  } catch (err) {
    UI.toast("Error: " + err.message, "error");
  }
}

// ── Add car ──────────────────────────────────────
function toggleIt(id) {
  const el = document.getElementById(id);
  el.classList.toggle("on");
  el.setAttribute("aria-checked", el.classList.contains("on").toString());
}

function clearForm() {
  document.getElementById("inp-name").value  = "";
  document.getElementById("inp-plate").value = "";
  ["tog-accident","tog-emergency"].forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove("on");
    el.setAttribute("aria-checked","false");
  });
  const fb = document.getElementById("add-feedback");
  fb.textContent = ""; fb.className = "";
  document.getElementById("recent-list").innerHTML =
    `<div class="no-data"><i class="ti ti-clock" aria-hidden="true"></i>No cars added yet</div>`;
}

async function addCar() {
  const name  = document.getElementById("inp-name").value.trim();
  const plate = document.getElementById("inp-plate").value.trim();
  const acc   = document.getElementById("tog-accident").classList.contains("on");
  const emer  = document.getElementById("tog-emergency").classList.contains("on");
  const fb    = document.getElementById("add-feedback");

  if (!name || !plate) {
    fb.textContent = "Please enter both owner name and plate number.";
    fb.className   = "error";
    return;
  }

  try {
    const res = await API.addCar({
      owner_name:   name,
      plate_number: parseInt(plate),
      has_accident: acc,
      is_emergency: emer,
    });

    fb.textContent = `✓ ${res.message}`;
    fb.className   = "success";

    const fakeCar = {
      owner_name:   name,
      plate_number: parseInt(plate),
      has_accident: acc,
      is_emergency: emer,
      status:       res.status,
    };
    document.getElementById("recent-list").innerHTML = UI.carItemHTML(fakeCar);
    UI.toast(`Car '${name}' added to road.`, "success");

    // clear form fields only (keep recent visible)
    document.getElementById("inp-name").value  = "";
    document.getElementById("inp-plate").value = "";
    ["tog-accident","tog-emergency"].forEach(id => {
      const el = document.getElementById(id);
      el.classList.remove("on");
      el.setAttribute("aria-checked","false");
    });
  } catch (err) {
    fb.textContent = err.message;
    fb.className   = "error";
    UI.toast("Add failed: " + err.message, "error");
  }
}

async function handleDeleteCar(id) {
  if (!confirm("Are you sure you want to delete this car using BST logic?")) return;

  try {
    const res = await API.deleteCar(id);
    UI.toast(res.message, "success");
    
    // تحديث الصفحة اللي أنت واقف عليها حالياً
    const activePage = document.querySelector('.page.active').id;
    if (activePage === 'page-dashboard') refreshAll();
    if (activePage === 'page-road') loadRoadPage();
    if (activePage === 'page-add') {
       // لو في صفحة الإضافة، بنصفر القائمة اللي تحت بس
       document.getElementById("recent-list").innerHTML = 
         `<div class="no-data"><i class="ti ti-clock"></i>Car removed</div>`;
    }
  } catch (err) {
    UI.toast("Delete failed: " + err.message, "error");
  }
}
// ── Search ───────────────────────────────────────
function setSearchTab(mode) {
  searchMode = mode;
  document.getElementById("stab-plate").classList.toggle("active", mode === "plate");
  document.getElementById("stab-name").classList.toggle("active",  mode === "name");
  document.getElementById("search-input").placeholder =
    mode === "plate" ? "Enter plate number…" : "Enter owner name…";
  document.getElementById("search-result").innerHTML = "";
}

async function loadSearchPage() {
  try {
    const all   = await Promise.all([
      API.getRoad(), API.getExitLane(), API.getAccidentCars(), API.getSideRoad()
    ]);
    const total = all.reduce((s, a) => s + a.length, 0);
    UI.renderBSTStats(total);
  } catch { /* ignore */ }
}

async function doSearch() {
  const val = document.getElementById("search-input").value.trim();
  const el  = document.getElementById("search-result");
  if (!val) {
    el.innerHTML = `<div class="not-found">
      <i class="ti ti-search" aria-hidden="true"></i>Enter a value to search.
    </div>`;
    return;
  }

  el.innerHTML = `<div class="not-found"><i class="ti ti-loader" aria-hidden="true"></i>Searching…</div>`;

  try {
    const res = searchMode === "plate"
      ? await API.searchByPlate(val)
      : await API.searchByName(val);
    UI.renderSearchResult(res);
  } catch (err) {
    el.innerHTML = `<div class="not-found">
      <i class="ti ti-alert-circle" aria-hidden="true"></i>${err.message}
    </div>`;
  }
}

// ── Log ──────────────────────────────────────────
async function loadLog() {
  try {
    const logs = await API.getLog(80);
    UI.renderLog(logs);
  } catch (err) {
    UI.toast("Failed to load log: " + err.message, "error");
  }
}

// ── API health check ─────────────────────────────
async function checkAPIStatus() {
  const ok = await API.ping();
  UI.setApiStatus(ok);
  return ok;
}

// ── Boot ─────────────────────────────────────────
(async () => {
  const ok = await checkAPIStatus();
  if (ok) {
    refreshAll();
  } else {
    UI.toast("Backend not reachable — run: python backend/app.py", "error");
    UI.setApiStatus(false);
  }

  // re-check every 30 seconds
  setInterval(checkAPIStatus, 30000);
})();
