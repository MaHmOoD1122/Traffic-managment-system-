/**
 * api.js — all fetch calls to the Flask backend
 * BASE_URL points to localhost:5000 by default.
 * Change it here if you deploy the backend elsewhere.
 */

const API = (() => {
  //const BASE = "http://localhost:5000/api";
  const BASE = "/api";
  async function request(method, path, body) {
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body) opts.body = JSON.stringify(body);

    const res  = await fetch(BASE + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  return {
    // ── Stats ──────────────────────────────────
    getStats: ()                => request("GET",  "/stats"),

    // ── Road ───────────────────────────────────
    getRoad:  ()                => request("GET",  "/road"),
    addCar:   (car)             => request("POST", "/road", car),
    deleteCar:(id)              => request("DELETE",`/road/${id}`),

    // ── Road actions ───────────────────────────
    handleAccidents: ()         => request("POST", "/road/handle-accidents"),
    handleEmergency: ()         => request("POST", "/road/handle-emergency"),

    // ── Other lanes ────────────────────────────
    getExitLane:     ()         => request("GET",  "/exit-lane"),
    clearExitCar:    (id)       => request("DELETE",`/exit-lane/${id}`),
    getAccidentCars: ()         => request("GET",  "/accident-cars"),
    getSideRoad:     ()         => request("GET",  "/side-road"),
    addSideRoad:     (car)      => request("POST", "/side-road", car),

    // ── Search ─────────────────────────────────
    searchByPlate: (plate)      => request("GET",  `/search?plate=${encodeURIComponent(plate)}`),
    searchByName:  (name)       => request("GET",  `/search?name=${encodeURIComponent(name)}`),

    // ── Log ────────────────────────────────────
    getLog: (limit = 60)        => request("GET",  `/log?limit=${limit}`),

    // ── Reset ──────────────────────────────────
    reset:  ()                  => request("DELETE","/reset"),

    // ── Health check ───────────────────────────
    ping: async () => {
      try {
        await fetch(BASE + "/stats", { signal: AbortSignal.timeout(2500) });
        return true;
      } catch {
        return false;
      }
    },
  };
})();
