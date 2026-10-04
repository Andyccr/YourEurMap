/** Gameplay rules that do not touch the DOM or the network. */

export const MAP_FORMAT = "europa-canvas-map";
export const LIBRARY_FORMAT = "europa-canvas-library";
export const MAP_VERSION = 1;
export const LIBRARY_VERSION = 1;
export const HISTORY_LIMIT = 80;

export const LIMITS = {
  mapChars: 1_500_000,
  libraryChars: 8_000_000,
  name: 40,
  title: 80,
};

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ID_RE = /^[a-z][a-z0-9_-]{0,24}$/;

export function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  }[ch]));
}

export function sanitizeName(value, max = LIMITS.name) {
  const cleaned = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return cleaned;
}

export function sanitizeColor(value) {
  const text = String(value ?? "").trim();
  return COLOR_RE.test(text) ? text.toLowerCase() : null;
}

export function createHistory(limit = HISTORY_LIMIT) {
  return { past: [], future: [], limit };
}

export function pushHistory(history, entry) {
  history.past.push(entry);
  if (history.past.length > history.limit) history.past.shift();
  history.future.length = 0;
  return history;
}

export function undoHistory(history) {
  const entry = history.past.pop();
  if (!entry) return null;
  history.future.push(entry);
  return entry;
}

export function redoHistory(history) {
  const entry = history.future.pop();
  if (!entry) return null;
  history.past.push(entry);
  return entry;
}

export function applyOwnership(ownership, changes, direction) {
  const key = direction === "undo" ? "from" : "to";
  for (const change of changes) ownership[change.i] = change[key];
}

export function diffOwnership(before, after) {
  const changes = [];
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] !== after[i]) changes.push({ i, from: before[i], to: after[i] });
  }
  return changes;
}

export function createGesture(ownership) {
  const snapshot = ownership.slice();
  return {
    snapshot,
    rolledBack: false,
    rollback(target) {
      for (let i = 0; i < snapshot.length; i += 1) target[i] = snapshot[i];
      this.rolledBack = true;
    },
  };
}

/** Connected same-owner atoms across shared land borders. */
export function connectedAtoms(atoms, ownership, startIndex) {
  const owner = ownership[startIndex];
  const seen = new Set();
  const stack = [startIndex];
  while (stack.length) {
    const index = stack.pop();
    if (seen.has(index) || ownership[index] !== owner) continue;
    seen.add(index);
    const neighbors = atoms[index].nb || [];
    for (const next of neighbors) stack.push(next);
  }
  return seen;
}

/**
 * Visual provinces. Atoms that share a designed group and an owner
 * stay together. A save that splits owners inside a group keeps the
 * finer pieces, including disconnected leftovers.
 */
export function visualProvinces(atoms, ownership) {
  const byGroup = new Map();
  atoms.forEach((atom, index) => {
    const list = byGroup.get(atom.gid) || [];
    list.push(index);
    byGroup.set(atom.gid, list);
  });
  const provinces = [];
  const atomProvince = new Array(atoms.length);
  for (const [gid, indexes] of byGroup) {
    const owners = new Set(indexes.map((index) => ownership[index]));
    if (owners.size === 1) {
      const province = makeProvince(atoms, ownership, gid, indexes, `${gid}`);
      provinces.push(province);
      indexes.forEach((index) => {
        atomProvince[index] = province;
      });
      continue;
    }
    const remaining = new Set(indexes);
    while (remaining.size) {
      const seed = remaining.values().next().value;
      const owner = ownership[seed];
      const stack = [seed];
      const part = [];
      remaining.delete(seed);
      while (stack.length) {
        const index = stack.pop();
        part.push(index);
        for (const next of atoms[index].nb || []) {
          if (!remaining.has(next) || ownership[next] !== owner) continue;
          remaining.delete(next);
          stack.push(next);
        }
      }
      const province = makeProvince(atoms, ownership, gid, part, `${gid}|${owner}|${seed}`);
      provinces.push(province);
      part.forEach((index) => {
        atomProvince[index] = province;
      });
    }
  }
  return { provinces, atomProvince };
}

function makeProvince(atoms, ownership, gid, indexes, key) {
  const first = atoms[indexes[0]];
  const uniformDesigned = indexes.length === (first.gidCount || indexes.length);
  let name = uniformDesigned ? first.groupName || first.n : indexes.map((index) => atoms[index].n).slice(0, 3).join("–");
  if (!uniformDesigned && indexes.length === 1) name = first.n;
  const aka = [];
  indexes.forEach((index) => {
    const atom = atoms[index];
    if (atom.n && atom.n !== name) aka.push(atom.n);
    (atom.aka || []).forEach((alias) => aka.push(alias));
  });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let area = 0;
  indexes.forEach((index) => {
    const box = atoms[index].b;
    minX = Math.min(minX, box[0]);
    minY = Math.min(minY, box[1]);
    maxX = Math.max(maxX, box[2]);
    maxY = Math.max(maxY, box[3]);
    area += atoms[index].area || 0;
  });
  const capital = uniformDesigned && first.groupCap ? first.groupCap : first.cap;
  return {
    key,
    gid,
    indexes,
    owner: ownership[indexes[0]],
    name,
    local: first.groupLocal || first.l || first.n,
    aka: [...new Set(aka)],
    combined: indexes.length > 1,
    designedIntact: uniformDesigned,
    bbox: [minX, minY, maxX, maxY],
    area,
    capital,
    search: `${name} ${first.l || ""} ${aka.join(" ")} ${capital?.n || ""}`.toLowerCase(),
  };
}

export function describePaint(provinceCount, singleName) {
  if (provinceCount <= 0) return "No provinces changed";
  if (provinceCount === 1 && singleName) return `Painted ${singleName}`;
  return `Painted ${provinceCount} provinces`;
}

export function provinceCountForChanges(atomProvince, changes) {
  const keys = new Set();
  for (const change of changes) {
    const province = atomProvince[change.i];
    if (province) keys.add(province.key);
  }
  return keys.size;
}

export function detectStorageConflict({ dirty, baseRevision, remoteRevision }) {
  if (remoteRevision == null || remoteRevision === baseRevision) return false;
  return Boolean(dirty) || remoteRevision > baseRevision;
}

export function shouldAdoptRemote({ dirty, paused }) {
  return !dirty && !paused;
}

export function newCountryId(existing) {
  let id = "";
  do {
    id = `c${Math.random().toString(36).slice(2, 8)}`;
  } while (existing.has(id) || !ID_RE.test(id));
  return id;
}

export function countriesFromScenario(catalog, scenarioId, extras = []) {
  const scenario = catalog.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error("Unknown scenario");
  const used = new Set(scenario.owners);
  const countries = new Map();
  for (const polity of catalog.polities) {
    if (!used.has(polity.id)) continue;
    countries.set(polity.id, {
      id: polity.id,
      name: polity.n,
      color: polity.c,
      custom: false,
    });
  }
  for (const extra of extras) {
    if (extra?.id && !countries.has(extra.id)) countries.set(extra.id, { ...extra });
  }
  return countries;
}

export function ownershipFromScenario(catalog, scenarioId) {
  const scenario = catalog.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error("Unknown scenario");
  return scenario.owners.slice();
}

export function validateMap(payload, catalog) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "That file is not a Europa Canvas map." };
  }
  if (payload.format !== MAP_FORMAT) {
    return { ok: false, error: "Unsupported file format." };
  }
  if (payload.version !== MAP_VERSION) {
    return { ok: false, error: "Unsupported map version." };
  }
  const scenario = catalog.scenarios.find((item) => item.id === payload.scenarioId);
  if (!scenario) return { ok: false, error: "Unknown starting scenario." };
  if (!Array.isArray(payload.countries) || payload.countries.length > 400) {
    return { ok: false, error: "Country data is malformed." };
  }
  const countries = new Map();
  for (const country of payload.countries) {
    if (!country || typeof country !== "object") {
      return { ok: false, error: "Country data is malformed." };
    }
    const id = String(country.id || "");
    const name = sanitizeName(country.name);
    const color = sanitizeColor(country.color);
    if (!ID_RE.test(id) || !name || !color || countries.has(id)) {
      return { ok: false, error: "Country data is malformed." };
    }
    countries.set(id, { id, name, color, custom: Boolean(country.custom) });
  }
  if (!payload.ownership || typeof payload.ownership !== "object" || Array.isArray(payload.ownership)) {
    return { ok: false, error: "Ownership data is malformed." };
  }
  const known = new Set(catalog.atoms.map((atom) => atom.id));
  const ownership = scenario.owners.slice();
  const seen = new Set();
  for (const [atomId, countryId] of Object.entries(payload.ownership)) {
    if (!known.has(atomId)) {
      return { ok: false, error: "The file refers to provinces this map does not contain." };
    }
    if (!countries.has(countryId)) {
      return { ok: false, error: "Ownership refers to a missing country." };
    }
    const index = catalog.atoms.findIndex((atom) => atom.id === atomId);
    ownership[index] = countryId;
    seen.add(atomId);
  }
  if (seen.size < catalog.atoms.length * 0.8) {
    return { ok: false, error: "Ownership data is incomplete." };
  }
  const title = sanitizeName(payload.title || "Untitled map", LIMITS.title) || "Untitled map";
  return {
    ok: true,
    map: {
      format: MAP_FORMAT,
      version: MAP_VERSION,
      scenarioId: scenario.id,
      title,
      updatedAt: payload.updatedAt || new Date().toISOString(),
      countries: [...countries.values()],
      ownership: Object.fromEntries(catalog.atoms.map((atom, index) => [atom.id, ownership[index]])),
      camera: sanitizeCamera(payload.camera),
      brushId: countries.has(payload.brushId) ? payload.brushId : null,
      previousBrushId: countries.has(payload.previousBrushId) ? payload.previousBrushId : null,
      layers: sanitizeLayers(payload.layers),
    },
    ownership,
    countries,
  };
}

export function validateLibrary(payload, catalog) {
  if (!payload || payload.format !== LIBRARY_FORMAT) {
    return { ok: false, error: "Unsupported library format." };
  }
  if (payload.version !== LIBRARY_VERSION) {
    return { ok: false, error: "Unsupported library version." };
  }
  const slots = Array.isArray(payload.slots) ? payload.slots.slice(0, 6) : [];
  while (slots.length < 6) slots.push(null);
  const check = (value, label) => {
    if (value == null) return { ok: true, map: null };
    const result = validateMap(value, catalog);
    if (!result.ok) return { ok: false, error: `${label}: ${result.error}` };
    return { ok: true, map: result.map };
  };
  const autosave = check(payload.autosave, "Autosave");
  if (!autosave.ok) return autosave;
  const previous = check(payload.previousAutosave, "Checkpoint");
  if (!previous.ok) return previous;
  const recovery = check(payload.recovery, "Recovery");
  if (!recovery.ok) return recovery;
  const cleanSlots = [];
  for (let i = 0; i < 6; i += 1) {
    const slot = check(slots[i], `Slot ${i + 1}`);
    if (!slot.ok) return slot;
    cleanSlots.push(slot.map);
  }
  return {
    ok: true,
    library: {
      format: LIBRARY_FORMAT,
      version: LIBRARY_VERSION,
      revision: Number.isFinite(payload.revision) ? payload.revision : 0,
      updatedAt: payload.updatedAt || new Date().toISOString(),
      autosave: autosave.map,
      previousAutosave: previous.map,
      recovery: recovery.map,
      slots: cleanSlots,
      libraryBackup: null,
      meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
    },
  };
}

function sanitizeCamera(camera) {
  if (!camera || typeof camera !== "object") return null;
  const cx = Number(camera.cx);
  const cy = Number(camera.cy);
  const w = Number(camera.w);
  if (![cx, cy, w].every(Number.isFinite)) return null;
  return { cx, cy, w };
}

function sanitizeLayers(layers) {
  const source = layers && typeof layers === "object" ? layers : {};
  return {
    terrain: source.terrain !== false,
    provinceBorders: source.provinceBorders !== false,
    cities: source.cities !== false,
    provinceNames: Boolean(source.provinceNames),
    countryNames: Boolean(source.countryNames),
  };
}

export function serializeMap(state) {
  const ownership = {};
  state.catalog.atoms.forEach((atom, index) => {
    ownership[atom.id] = state.ownership[index];
  });
  return {
    format: MAP_FORMAT,
    version: MAP_VERSION,
    scenarioId: state.scenarioId,
    title: state.title,
    updatedAt: new Date().toISOString(),
    countries: [...state.countries.values()],
    ownership,
    camera: state.camera,
    brushId: state.brushId,
    previousBrushId: state.previousBrushId,
    layers: state.layers,
  };
}

export function searchEntries(provinces, countries, query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const countryHits = [];
  for (const country of countries.values()) {
    if (country.name.toLowerCase().includes(q)) countryHits.push(country);
  }
  const provinceHits = provinces.filter((province) => province.search.includes(q));
  return { countries: countryHits, provinces: provinceHits };
}

export function fitBounds(bbox, viewportRatio, padding = 0.14) {
  const [minX, minY, maxX, maxY] = bbox;
  const width = Math.max(24, maxX - minX);
  const height = Math.max(24, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const paddedW = width * (1 + padding);
  const paddedH = height * (1 + padding);
  const w = Math.max(paddedW, paddedH / Math.max(viewportRatio, 0.2));
  return { cx, cy, w };
}

export function clampCamera(camera, mapW, mapH, minW, maxW) {
  const w = Math.min(maxW, Math.max(minW, camera.w));
  const h = camera.h || w;
  const cx = Math.min(mapW + w * 0.35, Math.max(-w * 0.35, camera.cx));
  const cy = Math.min(mapH + h * 0.35, Math.max(-h * 0.35, camera.cy));
  return { cx, cy, w };
}

export function countsByCountry(ownership) {
  const counts = new Map();
  for (const id of ownership) counts.set(id, (counts.get(id) || 0) + 1);
  return counts;
}

export function atomsOfCountry(ownership, countryId) {
  const indexes = [];
  ownership.forEach((id, index) => {
    if (id === countryId) indexes.push(index);
  });
  return indexes;
}

export function prepareAtoms(catalog) {
  const groupById = catalog.groups || {};
  const counts = new Map();
  for (const atom of catalog.atoms) counts.set(atom.gid, (counts.get(atom.gid) || 0) + 1);
  return catalog.atoms.map((atom) => {
    const group = groupById[atom.gid] || {};
    return {
      ...atom,
      gidCount: counts.get(atom.gid) || 1,
      groupName: group.n || atom.n,
      groupLocal: group.l || atom.l,
      groupCap: group.cap || null,
    };
  });
}
