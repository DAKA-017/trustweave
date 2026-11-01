const SESSION_KEY = "trustweave-session";
const WORLD_KEY = "trustweave-world";
const SCENARIOS = ["obvious", "stealth"];

let memorySessionId = null;
let memoryWorld = null;
let pendingWorld = null;

function readStorage(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage can be blocked; the in-memory fallback still scopes this tab.
  }
}

function newSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** A random per-tab identifier, never an identity or a login. */
export function getSessionId() {
  if (typeof window === "undefined") return null;
  if (memorySessionId) return memorySessionId;
  const stored = readStorage(window.sessionStorage, SESSION_KEY);
  const sessionId = stored || newSessionId();
  if (!stored) writeStorage(window.sessionStorage, SESSION_KEY, sessionId);
  memorySessionId = sessionId;
  return sessionId;
}

function worldFromSearch(search) {
  const params = new URLSearchParams(search);
  const readInteger = (key) => {
    const raw = params.get(key);
    if (raw === null || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isInteger(value) ? value : null;
  };
  const world = {};
  const seed = readInteger("seed");
  if (seed !== null && seed > 0) world.seed = seed;
  const size = readInteger("size");
  if (size !== null) world.size = size;
  const campaignSize = readInteger("campaignSize");
  if (campaignSize !== null) world.campaignSize = campaignSize;
  const scenario = params.get("scenario");
  if (SCENARIOS.includes(scenario)) world.scenario = scenario;
  return Object.keys(world).length > 0 ? world : null;
}

/**
 * Seed settings for this visitor's world. URL parameters win so a shared link
 * reproduces the same deterministic world; otherwise the tab's last rebuild is
 * used. The server never shares a writable world between sessions.
 */
export function getWorld() {
  if (typeof window === "undefined") return null;
  // A rebuild updates the URL asynchronously. Until that navigation commits,
  // the previous URL still describes the old world, so prefer the new one.
  if (pendingWorld && window.location.search === pendingWorld.search) {
    return pendingWorld.world;
  }
  pendingWorld = null;
  const fromUrl = worldFromSearch(window.location.search);
  if (fromUrl) {
    memoryWorld = fromUrl;
    writeStorage(window.sessionStorage, WORLD_KEY, JSON.stringify(fromUrl));
    return fromUrl;
  }
  if (memoryWorld) return memoryWorld;
  const raw = readStorage(window.sessionStorage, WORLD_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    memoryWorld = parsed && typeof parsed === "object" ? parsed : null;
    return memoryWorld;
  } catch {
    return null;
  }
}

export function rememberWorld(simulation) {
  if (typeof window === "undefined" || !simulation) return;
  const world = {
    seed: simulation.seed,
    size: simulation.size,
    campaignSize: simulation.campaignSize,
    scenario: simulation.scenario ?? "obvious",
  };
  memoryWorld = world;
  pendingWorld = { world, search: window.location.search };
  writeStorage(window.sessionStorage, WORLD_KEY, JSON.stringify(world));
}

export function worldSearch(simulation) {
  const params = new URLSearchParams();
  params.set("seed", String(simulation.seed));
  params.set("size", String(simulation.size));
  params.set("campaignSize", String(simulation.campaignSize));
  params.set("scenario", simulation.scenario ?? "obvious");
  return params.toString();
}
