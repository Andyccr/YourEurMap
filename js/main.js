import { artworkOptions, exportPng, exportSvg, renderArtwork } from "./export-map.js";
import {
  MAP_FORMAT,
  applyOwnership,
  atomsOfCountry,
  clampCamera,
  connectedAtoms,
  countriesFromScenario,
  countsByCountry,
  createGesture,
  createHistory,
  describePaint,
  diffOwnership,
  fitBounds,
  newCountryId,
  ownershipFromScenario,
  prepareAtoms,
  pushHistory,
  redoHistory,
  sanitizeColor,
  sanitizeName,
  searchEntries,
  serializeMap,
  undoHistory,
  visualProvinces,
} from "./model.js";
import { createMapView } from "./render.js";
import { createStorage } from "./storage.js";

const $ = (id) => document.getElementById(id);
const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const state = {
  catalog: null,
  atoms: [],
  scenarioId: null,
  scenario: null,
  ownership: [],
  countries: new Map(),
  brushId: null,
  previousBrushId: null,
  recent: [],
  tool: "move",
  title: "Untitled map",
  layers: { terrain: true, provinceBorders: true, cities: true, provinceNames: false, countryNames: false },
  history: createHistory(),
  selection: null,
  listTab: "countries",
  query: "",
  listLimit: 40,
  loaded: false,
};

let view = null;
let storage = null;
let gesture = null;
let gestureGroups = null;
let paintedKeys = new Set();
let saveTimer = 0;
let modal = null;
let spaceHeld = false;
const pointers = new Map();
let pan = null;
let pinch = null;

const storageApi = createStorage({
  onStatus: (status) => {
    const node = $("status");
    node.textContent = status.message || "";
    node.classList.toggle("error", status.tone === "error");
    if (status.tone !== "error") node.textContent = "";
  },
  onConflict: (remote) => showConflict(remote),
  onRemote: (library) => {
    if (!state.loaded || gesture) return;
    const current = library.autosave;
    if (current) loadMap(current, { recovered: false, quiet: true });
  },
});
storage = storageApi;

async function boot() {
  try {
    state.catalog = await fetchCatalog();
    state.atoms = prepareAtoms(state.catalog);
    view = createMapView($("map"), state.catalog, state.atoms);
    storage.load(state.catalog);
    bind();
    showGate();
    view.resize();
    requestAnimationFrame(() => view.resize());
    window.__europa = {
      state,
      get view() {
        return view;
      },
      undo,
      redo,
      paintProvince,
      endGesture,
      groupsNow,
      renderArtwork,
      artworkOptions,
      viewState,
    };
  } catch (error) {
    showGateError(error);
  }
}

const SITE_ROOT = new URL("../", import.meta.url);

function siteUrl(path) {
  return new URL(path, SITE_ROOT).href;
}

function fetchCatalog() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  return fetch(siteUrl("data/map.json"), { signal: controller.signal })
    .then((response) => {
      if (!response.ok) throw new Error("The atlas file did not load.");
      return response.json();
    })
    .then((data) => {
      if (data.terrain && !/^[a-z]+:/i.test(data.terrain)) data.terrain = siteUrl(data.terrain);
      return data;
    })
    .finally(() => clearTimeout(timer));
}

function showGate() {
  $("gate").hidden = false;
  const body = $("gate-body");
  body.replaceChildren();
  const autosave = storage.library.autosave;
  if (autosave) {
    const resume = document.createElement("button");
    resume.type = "button";
    resume.className = "create-btn";
    resume.textContent = `Continue “${autosave.title || "Untitled map"}” · ${autosave.scenarioId}`;
    resume.addEventListener("click", () => loadMap(autosave));
    body.append(resume);
  }
  const grid = document.createElement("div");
  grid.className = "era-grid";
  for (const scenario of state.catalog.scenarios) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "era-card";
    const title = document.createElement("strong");
    title.textContent = scenario.label;
    const blurb = document.createElement("span");
    blurb.textContent = scenario.blurb;
    button.append(title, blurb);
    button.addEventListener("click", () => beginScenario(scenario.id));
    grid.append(button);
  }
  body.append(grid);
  const note = document.createElement("p");
  note.className = "note";
  note.textContent = state.catalog.disclaimer;
  body.append(note);
}

function showGateError(error) {
  $("gate").hidden = false;
  const body = $("gate-body");
  body.replaceChildren();
  const message = document.createElement("p");
  message.textContent = error?.name === "AbortError"
    ? "The atlas took too long to load."
    : "The atlas could not be loaded. Local saves on this browser are untouched.";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Retry";
  retry.addEventListener("click", () => location.reload());
  body.append(message, retry);
  const autosave = storage.library?.autosave;
  if (autosave) {
    const download = document.createElement("button");
    download.type = "button";
    download.textContent = "Download the saved map";
    download.addEventListener("click", () => downloadJson(autosave, "europa-canvas-recovery.json"));
    body.append(download);
  }
}

function beginScenario(id) {
  if (state.loaded) storage.stashRecovery(serializeMap(viewState()));
  const scenario = state.catalog.scenarios.find((item) => item.id === id);
  state.scenarioId = id;
  state.scenario = scenario;
  state.ownership = ownershipFromScenario(state.catalog, id);
  state.countries = countriesFromScenario(state.catalog, id);
  state.brushId = null;
  state.previousBrushId = null;
  state.recent = [];
  state.title = `${scenario.label} canvas`;
  state.history = createHistory();
  state.selection = null;
  state.loaded = true;
  const memory = storage.library.meta?.brushMemory;
  if (memory?.scenarioId === id && state.countries.has(memory.brushId)) {
    state.brushId = memory.brushId;
    state.tool = "paint";
  } else {
    state.tool = "move";
  }
  enterPlay();
  if (!storage.library.meta?.onboardingDismissed) showOnboarding();
}

function loadMap(map, { quiet } = {}) {
  if (state.loaded && !quiet) storage.stashRecovery(serializeMap(viewState()));
  const result = storage.validateMap(map, state.catalog);
  if (!result.ok) {
    toast(result.error);
    return;
  }
  state.scenarioId = result.map.scenarioId;
  state.scenario = state.catalog.scenarios.find((item) => item.id === state.scenarioId);
  state.ownership = result.ownership;
  state.countries = result.countries;
  state.title = result.map.title;
  state.brushId = result.map.brushId;
  state.previousBrushId = result.map.previousBrushId;
  state.layers = { ...state.layers, ...result.map.layers };
  state.history = createHistory();
  state.selection = null;
  state.loaded = true;
  state.tool = state.brushId ? "paint" : "move";
  enterPlay();
  if (result.map.camera) view.setCamera(result.map.camera);
  if (!quiet) toast(`Restored ${state.title}.`);
}

function enterPlay() {
  $("gate").hidden = true;
  view.setOwnership(state.ownership);
  view.setCountries(state.countries);
  view.setLayers(state.layers);
  view.paintAll();
  view.rebuildBorders();
  fitAll();
  $("scenario-label").textContent = `${state.scenario.label} · ${state.title}`;
  setTool(state.tool);
  openDock(window.innerWidth > 860);
  renderBrush();
  renderDetail();
  renderList();
  scheduleSave();
}

function viewState() {
  return {
    catalog: state.catalog,
    atoms: state.atoms,
    scenarioId: state.scenarioId,
    scenario: state.scenario,
    ownership: state.ownership,
    countries: state.countries,
    title: state.title,
    brushId: state.brushId,
    previousBrushId: state.previousBrushId,
    layers: state.layers,
    camera: view.camera,
  };
}

function setTool(tool) {
  state.tool = tool;
  $("map").classList.remove("tool-move", "tool-paint", "tool-pick");
  $("map").classList.add(`tool-${tool}`);
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
  });
}

function setBrush(id, { rememberPrevious = true, closeDock = false } = {}) {
  if (!state.countries.has(id)) return;
  if (rememberPrevious && state.brushId && state.brushId !== id) state.previousBrushId = state.brushId;
  state.brushId = id;
  state.recent = [id, ...state.recent.filter((item) => item !== id)].slice(0, 6);
  setTool("paint");
  renderBrush();
  renderDetail();
  if (closeDock) openDock(false);
  else if (!$("dock").hidden) renderList();
  storage.remember({ brushMemory: { scenarioId: state.scenarioId, brushId: id } });
}

function swapBrush() {
  if (!state.previousBrushId || !state.countries.has(state.previousBrushId)) return;
  const next = state.previousBrushId;
  state.previousBrushId = state.brushId;
  setBrush(next, { rememberPrevious: false });
}

function groupsNow() {
  return visualProvinces(state.atoms, state.ownership);
}

function provinceAt(index, groups = groupsNow()) {
  return groups.atomProvince[index];
}

function zoomLimits() {
  const rect = $("map").getBoundingClientRect();
  const ratio = rect.height / Math.max(rect.width, 1) || 1;
  return {
    minW: state.catalog.w / 28,
    maxW: Math.max(state.catalog.w, state.catalog.h / ratio) * 1.08,
  };
}

function locateBox(bbox) {
  const rect = $("map").getBoundingClientRect();
  const ratio = rect.height / Math.max(rect.width, 1);
  const fitted = fitBounds(bbox, ratio);
  const limits = zoomLimits();
  const camera = clampCamera({ ...fitted, h: fitted.w * ratio }, state.catalog.w, state.catalog.h, limits.minW, limits.maxW);
  view.setCamera(camera);
  view.settle();
}

function locateCountry(id) {
  const indexes = atomsOfCountry(state.ownership, id);
  if (!indexes.length) {
    toast("That country has no territory to locate.");
    return;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  indexes.forEach((index) => {
    const box = state.atoms[index].b;
    minX = Math.min(minX, box[0]);
    minY = Math.min(minY, box[1]);
    maxX = Math.max(maxX, box[2]);
    maxY = Math.max(maxY, box[3]);
  });
  locateBox([minX, minY, maxX, maxY]);
}

function fitAll() {
  locateBox([0, 0, state.catalog.w, state.catalog.h]);
}

function selectIndex(index) {
  state.selection = index;
  const province = provinceAt(index);
  view.setSelected(province ? province.indexes : [index]);
  renderDetail();
}

function startGesture() {
  gesture = createGesture(state.ownership);
  gestureGroups = groupsNow();
  paintedKeys = new Set();
}

function paintProvince(index) {
  if (!state.brushId) {
    toast("Choose a country to paint with.");
    openDock(true);
    return;
  }
  if (!gesture) startGesture();
  const province = gestureGroups.atomProvince[index];
  if (!province || paintedKeys.has(province.key)) return;
  paintedKeys.add(province.key);
  const changes = [];
  for (const atomIndex of province.indexes) {
    if (state.ownership[atomIndex] === state.brushId) continue;
    state.ownership[atomIndex] = state.brushId;
    changes.push(atomIndex);
  }
  if (changes.length) view.paintAtoms(changes);
  state.selection = index;
  view.setSelected(province.indexes);
}

function fillConnected(index) {
  if (!state.brushId) {
    toast("Choose a country to paint with.");
    openDock(true);
    return;
  }
  const entry = state.history.past.at(-1);
  if (entry?.changes?.some((change) => change.i === index) && Date.now() - (entry.at || 0) < 520) {
    applyOwnership(state.ownership, entry.changes, "undo");
    state.history.past.pop();
    state.history.future.length = 0;
  }
  const before = state.ownership.slice();
  if (before[index] === state.brushId) return;
  const region = connectedAtoms(state.atoms, before, index);
  const groups = groupsNow();
  const names = new Set();
  region.forEach((atomIndex) => {
    names.add(groups.atomProvince[atomIndex]?.name);
    state.ownership[atomIndex] = state.brushId;
  });
  const changes = diffOwnership(before, state.ownership);
  if (!changes.length) return;
  view.paintAtoms(changes.map((change) => change.i));
  view.rebuildBorders();
  const label = names.size > 1 ? `Filled ${names.size} connected provinces` : describePaint(1, [...names][0]);
  pushHistory(state.history, { label, changes, at: Date.now() });
  toast(label, { offerUndo: true });
  state.selection = index;
  view.setSelected([index]);
  scheduleSave();
  renderDetail();
  if (!$("dock").hidden) renderList();
}

function endGesture() {
  if (!gesture) return;
  const current = gesture;
  gesture = null;
  if (current.rolledBack) {
    view.paintAll();
    view.rebuildBorders();
    renderDetail();
    return;
  }
  const changes = diffOwnership(current.snapshot, state.ownership);
  if (!changes.length) return;
  const names = new Set();
  changes.forEach((change) => {
    const province = gestureGroups.atomProvince[change.i];
    if (province) names.add(province.name);
  });
  const label = describePaint(names.size, names.size === 1 ? [...names][0] : "");
  pushHistory(state.history, { label, changes, at: Date.now() });
  toast(label, { offerUndo: true });
  scheduleSave();
  renderList();
  renderBrush();
  renderDetail();
  view.settle();
}

function rollbackGesture() {
  if (!gesture || gesture.rolledBack) return;
  gesture.rollback(state.ownership);
  paintedKeys.clear();
  view.paintAll();
  view.rebuildBorders();
}

function commitAction(label, changes, extra = {}) {
  if (!changes.length && !extra.countriesBefore) return;
  pushHistory(state.history, { label, changes, ...extra });
  toast(label, { offerUndo: true });
  scheduleSave();
  refreshAfterHistory(changes.map((change) => change.i));
}

function undo() {
  const entry = undoHistory(state.history);
  if (!entry) return;
  if (entry.changes) applyOwnership(state.ownership, entry.changes, "undo");
  if (entry.countriesBefore) state.countries = new Map(entry.countriesBefore.map((country) => [country.id, { ...country }]));
  if (entry.brushBefore) {
    state.brushId = entry.brushBefore.id;
    state.previousBrushId = entry.brushBefore.previous;
  }
  toast(`Undid ${entry.label}`);
  refreshAfterHistory(entry.changes?.map((change) => change.i) || []);
  scheduleSave();
}

function redo() {
  const entry = redoHistory(state.history);
  if (!entry) return;
  if (entry.changes) applyOwnership(state.ownership, entry.changes, "redo");
  if (entry.countriesAfter) state.countries = new Map(entry.countriesAfter.map((country) => [country.id, { ...country }]));
  if (entry.brushAfter) {
    state.brushId = entry.brushAfter.id;
    state.previousBrushId = entry.brushAfter.previous;
  }
  toast(`Redid ${entry.label}`);
  refreshAfterHistory(entry.changes?.map((change) => change.i) || []);
  scheduleSave();
}

function refreshAfterHistory(indexes) {
  view.setCountries(state.countries);
  if (indexes.length) view.paintAtoms(indexes);
  else view.paintAll();
  view.rebuildBorders();
  view.settle();
  renderBrush();
  renderList();
  renderDetail();
}

function brushSnapshot() {
  return { id: state.brushId, previous: state.previousBrushId };
}

function assignSelection() {
  if (state.selection == null || !state.brushId) return;
  const province = provinceAt(state.selection);
  if (!province || province.owner === state.brushId) return;
  const before = state.ownership.slice();
  province.indexes.forEach((index) => {
    state.ownership[index] = state.brushId;
  });
  commitAction(describePaint(1, province.name), diffOwnership(before, state.ownership));
}

function paintConnected() {
  if (state.selection == null || !state.brushId) return;
  const province = provinceAt(state.selection);
  if (!province || province.owner === state.brushId) return;
  const region = connectedAtoms(state.atoms, state.ownership, province.indexes[0]);
  const before = state.ownership.slice();
  const beforeGroups = groupsNow();
  region.forEach((index) => {
    state.ownership[index] = state.brushId;
  });
  const names = new Set([...region].map((index) => beforeGroups.atomProvince[index]?.name));
  commitAction(`Painted the connected region (${names.size} provinces)`, diffOwnership(before, state.ownership));
}

function transferOwner() {
  if (state.selection == null || !state.brushId) return;
  const province = provinceAt(state.selection);
  if (!province || province.owner === state.brushId) return;
  const from = state.countries.get(province.owner);
  const to = state.countries.get(state.brushId);
  ask({
    title: "Transfer territory",
    body: `Give every province of ${from?.name || "this country"} to ${to?.name || "the current brush"}?`,
    confirm: "Transfer",
  }).then((yes) => {
    if (!yes) return;
    const before = state.ownership.slice();
    const indexes = atomsOfCountry(before, province.owner);
    indexes.forEach((index) => {
      state.ownership[index] = state.brushId;
    });
    commitAction(`Transferred ${from?.name || "a country"} to ${to?.name || "another country"}`, diffOwnership(before, state.ownership));
  });
}

function createCountry(name, color) {
  const id = newCountryId(state.countries);
  const before = [...state.countries.values()];
  const brushBefore = brushSnapshot();
  state.countries.set(id, { id, name, color, custom: true });
  const after = [...state.countries.values()];
  setBrush(id);
  pushHistory(state.history, {
    label: "Created a country",
    changes: [],
    countriesBefore: before,
    countriesAfter: after,
    brushBefore,
    brushAfter: brushSnapshot(),
  });
  toast("Created a country", { offerUndo: true });
  scheduleSave();
}

function editCountry(id, name, color) {
  const current = state.countries.get(id);
  if (!current) return;
  const before = [...state.countries.values()];
  state.countries.set(id, { ...current, name, color });
  pushHistory(state.history, {
    label: "Edited a country",
    changes: [],
    countriesBefore: before,
    countriesAfter: [...state.countries.values()],
  });
  view.setCountries(state.countries);
  view.paintAll();
  toast("Edited a country", { offerUndo: true });
  renderBrush();
  renderList();
  renderDetail();
  scheduleSave();
}

function scheduleSave() {
  if (!state.loaded || gesture) return;
  storage.noteDirty();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (gesture || storage.paused) return;
    storage.autosave(serializeMap(viewState()));
    storage.remember({ brushMemory: { scenarioId: state.scenarioId, brushId: state.brushId } });
  }, 700);
}

function renderBrush() {
  const node = $("brush");
  const country = state.countries.get(state.brushId);
  if (!country) {
    node.hidden = false;
    node.replaceChildren();
    const text = document.createElement("span");
    text.textContent = "No country selected";
    node.append(text);
    return;
  }
  node.hidden = false;
  node.replaceChildren();
  const swatch = document.createElement("span");
  swatch.className = "swatch";
  swatch.style.background = country.color;
  const copy = document.createElement("span");
  copy.className = "brush-copy";
  const name = document.createElement("strong");
  name.textContent = country.name;
  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = "Drag to paint. Double-click fills a region.";
  copy.append(name, meta);
  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "Previous";
  previous.disabled = !state.previousBrushId;
  previous.addEventListener("click", swapBrush);
  const locate = document.createElement("button");
  locate.type = "button";
  locate.textContent = "Locate";
  locate.addEventListener("click", () => locateCountry(country.id));
  const countries = document.createElement("button");
  countries.type = "button";
  countries.textContent = "Countries";
  countries.addEventListener("click", () => openDock(true));
  node.append(swatch, copy, previous, locate, countries);
}

function renderList() {
  const root = $("list");
  root.replaceChildren();
  const groups = groupsNow();
  const counts = new Map();
  groups.provinces.forEach((province) => counts.set(province.owner, (counts.get(province.owner) || 0) + 1));
  if (state.query.trim()) {
    const hits = searchEntries(groups.provinces, state.countries, state.query) || { countries: [], provinces: [] };
    const cities = state.catalog.cities.filter((city) => city.n.toLowerCase().includes(state.query.trim().toLowerCase()));
    if (!hits.countries.length && !hits.provinces.length && !cities.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = `No countries, provinces, or cities match “${state.query.trim()}”.`;
      root.append(empty);
      return;
    }
    section(root, "Countries");
    hits.countries.slice(0, state.listLimit).forEach((country) => root.append(countryRow(country, counts)));
    section(root, "Provinces");
    hits.provinces.slice(0, state.listLimit).forEach((province) => root.append(provinceRow(province)));
    if (cities.length) {
      section(root, "Cities");
      cities.slice(0, 12).forEach((city) => root.append(cityRow(city)));
    }
    if (hits.countries.length > state.listLimit || hits.provinces.length > state.listLimit) moreButton(root);
    return;
  }
  if (state.listTab === "provinces") {
    const provinces = groups.provinces.slice().sort((a, b) => a.name.localeCompare(b.name));
    provinces.slice(0, state.listLimit).forEach((province) => root.append(provinceRow(province)));
    if (provinces.length > state.listLimit) moreButton(root);
    return;
  }
  if (state.recent.length) {
    section(root, "Recent brushes");
    state.recent.forEach((id) => {
      const country = state.countries.get(id);
      if (country) root.append(countryRow(country, counts));
    });
  }
  section(root, "Countries");
  const rows = [...state.countries.values()].sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0) || a.name.localeCompare(b.name));
  const active = rows.filter((country) => (counts.get(country.id) || 0) > 0);
  const idle = rows.filter((country) => !(counts.get(country.id) || 0));
  active.slice(0, state.listLimit).forEach((country) => root.append(countryRow(country, counts)));
  if (active.length > state.listLimit) moreButton(root);
  if (idle.length) {
    section(root, "Without territory");
    idle.forEach((country) => root.append(countryRow(country, counts)));
  }
}

function section(root, text) {
  const node = document.createElement("div");
  node.className = "list-section";
  node.textContent = text;
  root.append(node);
}

function moreButton(root) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Show more";
  button.addEventListener("click", () => {
    state.listLimit += 40;
    renderList();
  });
  root.append(button);
}

function countryRow(country, counts) {
  const row = document.createElement("div");
  row.className = `entry${country.id === state.brushId ? " is-active" : ""}`;
  const main = document.createElement("button");
  main.type = "button";
  main.className = "entry-main";
  const swatch = document.createElement("span");
  swatch.className = "swatch";
  swatch.style.background = country.color;
  const copy = document.createElement("span");
  copy.className = "entry-copy";
  const name = document.createElement("strong");
  name.textContent = country.name;
  const meta = document.createElement("span");
  const count = counts.get(country.id) || 0;
  meta.textContent = country.id === state.brushId ? `Painting · ${count} provinces` : `${count} provinces`;
  copy.append(name, meta);
  main.append(swatch, copy);
  main.addEventListener("click", () => setBrush(country.id, { closeDock: true }));
  const locate = iconButton("Locate", () => locateCountry(country.id));
  const edit = iconButton("Edit", () => countryDialog(country));
  row.append(main, locate, edit);
  return row;
}

function provinceRow(province) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "entry-main";
  const swatch = document.createElement("span");
  swatch.className = "swatch";
  swatch.style.background = state.countries.get(province.owner)?.color || "#888";
  const copy = document.createElement("span");
  copy.className = "entry-copy";
  const name = document.createElement("strong");
  name.textContent = province.name;
  const meta = document.createElement("span");
  meta.textContent = state.countries.get(province.owner)?.name || "Unknown";
  copy.append(name, meta);
  button.append(swatch, copy);
  button.addEventListener("click", () => {
    locateBox(province.bbox);
    state.selection = province.indexes[0];
    view.setSelected(province.indexes);
    renderDetail();
  });
  return button;
}

function cityRow(city) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "entry-main";
  const copy = document.createElement("span");
  copy.className = "entry-copy";
  const name = document.createElement("strong");
  name.textContent = city.n;
  const meta = document.createElement("span");
  meta.textContent = "City";
  copy.append(name, meta);
  button.append(copy);
  button.addEventListener("click", () => {
    locateBox([city.x - 80, city.y - 80, city.x + 80, city.y + 80]);
    if (Number.isInteger(city.a)) selectIndex(city.a);
  });
  return button;
}

function iconButton(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function renderDetail() {
  const node = $("detail");
  if (state.selection == null) {
    node.hidden = true;
    node.replaceChildren();
    return;
  }
  const province = provinceAt(state.selection);
  if (!province) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  node.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = province.name;
  const local = document.createElement("p");
  local.className = "meta";
  local.textContent = province.local && province.local !== province.name ? `Original geographic name: ${province.local}` : province.name;
  const owner = state.countries.get(province.owner);
  const ownerLine = document.createElement("p");
  ownerLine.textContent = `Owner: ${owner?.name || "Unknown"}`;
  const capital = document.createElement("p");
  const verified = province.capital?.v === 1;
  capital.textContent = verified
    ? `Administrative capital: ${province.capital.n}`
    : `Approximate game center: ${province.capital?.n || "Game center"}`;
  node.append(title, local, ownerLine, capital);
  if (province.combined) {
    const combined = document.createElement("p");
    combined.textContent = `Combines ${province.indexes.length} original regions: ${province.aka.slice(0, 8).join(", ") || province.name}.`;
    node.append(combined);
  }
  const same = province.owner === state.brushId;
  const actions = document.createElement("div");
  actions.className = "detail-actions";
  actions.append(
    actionButton("Assign to current country", assignSelection, same || !state.brushId),
    actionButton("Pick its current owner", () => setBrush(province.owner), same),
    actionButton("Paint connected region", paintConnected, same || !state.brushId),
    actionButton("Transfer owner's territory", transferOwner, same || !state.brushId),
  );
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => {
    state.selection = null;
    view.setSelected([]);
    renderDetail();
  });
  actions.append(close);
  node.append(actions);
}

function actionButton(label, action, disabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = Boolean(disabled);
  button.addEventListener("click", action);
  return button;
}

function openDock(open) {
  $("dock").hidden = !open;
  $("dock-backdrop").hidden = !open || window.innerWidth > 860;
  document.body.classList.toggle("dock-open", open && window.innerWidth > 860);
  if (open) {
    state.listLimit = 40;
    renderList();
    if (window.innerWidth <= 860) $("search").focus();
  }
}

function toast(message, { offerUndo = false } = {}) {
  const node = document.createElement("div");
  node.className = "toast";
  const text = document.createElement("span");
  text.textContent = message;
  node.append(text);
  if (offerUndo) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Undo";
    button.addEventListener("click", () => {
      node.remove();
      undo();
    });
    node.append(button);
  }
  $("toasts").replaceChildren(node);
  setTimeout(() => node.remove(), offerUndo ? 5000 : 2800);
}

function showConflict(remote) {
  const banner = $("conflict");
  banner.hidden = false;
  banner.replaceChildren();
  const text = document.createElement("span");
  text.textContent = "Another tab saved newer progress. Autosave is paused.";
  const keep = document.createElement("button");
  keep.type = "button";
  keep.textContent = "Keep this tab";
  keep.addEventListener("click", () => {
    const local = storage.library;
    local.autosave = serializeMap(viewState());
    storage.keepLocal(local);
    banner.hidden = true;
    toast("Kept this tab’s map.");
  });
  const load = document.createElement("button");
  load.type = "button";
  load.textContent = "Load latest";
  load.addEventListener("click", () => {
    storage.adopt(remote);
    if (remote.autosave) loadMap(remote.autosave, { quiet: true });
    banner.hidden = true;
  });
  const exp = document.createElement("button");
  exp.type = "button";
  exp.textContent = "Export this tab";
  exp.addEventListener("click", () => downloadJson(serializeMap(viewState()), "europa-canvas-local.json"));
  banner.append(text, exp, load, keep);
}

function closeModal() {
  $("modal-root").replaceChildren();
  modal = null;
}

function ask({ title, body, confirm }) {
  return new Promise((resolve) => {
    const box = dialogShell(title);
    const text = document.createElement("p");
    text.textContent = body;
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      closeModal();
      resolve(false);
    });
    const ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = confirm;
    ok.addEventListener("click", () => {
      closeModal();
      resolve(true);
    });
    actions.append(cancel, ok);
    box.append(text, actions);
    ok.focus();
  });
}

function dialogShell(title) {
  closeModal();
  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "backdrop";
  backdrop.setAttribute("aria-label", "Close dialog");
  backdrop.addEventListener("click", closeModal);
  const box = document.createElement("div");
  box.className = "modal";
  box.tabIndex = -1;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  const heading = document.createElement("h3");
  heading.textContent = title;
  box.append(heading);
  $("modal-root").append(backdrop, box);
  modal = box;
  box.addEventListener("keydown", trapTab);
  return box;
}

function trapTab(event) {
  if (event.key !== "Tab" || !modal) return;
  const nodes = [...modal.querySelectorAll("button, input, select, textarea")].filter((element) => !element.disabled);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function countryDialog(existing) {
  const box = dialogShell(existing ? "Edit country" : "Create a country");
  const name = document.createElement("input");
  name.type = "text";
  name.maxLength = 40;
  name.value = existing?.name || "";
  name.setAttribute("aria-label", "Country name");
  const color = document.createElement("input");
  color.type = "color";
  color.value = existing?.color || "#4f6f8a";
  color.setAttribute("aria-label", "Country color");
  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", closeModal);
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = existing ? "Save changes" : "Paint with this country";
  save.addEventListener("click", () => {
    const cleanName = sanitizeName(name.value);
    const cleanColor = sanitizeColor(color.value);
    if (!cleanName || !cleanColor) return;
    closeModal();
    if (existing) editCountry(existing.id, cleanName, cleanColor);
    else createCountry(cleanName, cleanColor);
  });
  box.append(name, color, actions);
  actions.append(cancel, save);
  name.focus();
}

function showOnboarding() {
  const box = dialogShell("A short guide");
  const steps = [
    "Choose a country, or create one. That country becomes your brush.",
    "Click or drag to paint. Double-click, or Shift-click, fills a connected region. Each stroke is one undo.",
    "Drag to move the atlas. Scroll or pinch to zoom. Hold Space to pan while painting.",
    "Maps save in this browser. Export JSON to move them, or export a PNG or SVG.",
  ];
  steps.forEach((step) => {
    const p = document.createElement("p");
    p.textContent = step;
    box.append(p);
  });
  const label = document.createElement("label");
  label.className = "check";
  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = true;
  label.append(check, document.createTextNode("Don’t show this again"));
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Start painting";
  close.addEventListener("click", () => {
    if (check.checked) storage.remember({ onboardingDismissed: true });
    closeModal();
  });
  box.append(label, close);
  close.focus();
}

function saveDialog() {
  const box = dialogShell("Save this map");
  const name = document.createElement("input");
  name.type = "text";
  name.value = state.title;
  name.maxLength = 80;
  name.setAttribute("aria-label", "Map title");
  name.addEventListener("change", () => {
    state.title = sanitizeName(name.value, 80) || state.title;
    $("scenario-label").textContent = `${state.scenario.label} · ${state.title}`;
    scheduleSave();
  });
  box.append(name);
  const note = document.createElement("p");
  note.className = "note";
  note.textContent = "Saves stay in this browser. Export JSON if you want the map on another device. Six named slots are kept separately from the automatic save.";
  box.append(note);
  storage.library.slots.forEach((slot, index) => {
    const row = document.createElement("div");
    row.className = "choice";
    const label = document.createElement("span");
    label.textContent = slot ? `${slot.title} · ${slot.scenarioId}` : `Empty slot ${index + 1}`;
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = slot ? "Overwrite" : "Save here";
    save.addEventListener("click", async () => {
      if (slot) {
        const yes = await ask({ title: "Overwrite slot", body: `Replace “${slot.title}”?`, confirm: "Overwrite" });
        if (!yes) return;
      }
      state.title = sanitizeName(name.value, 80) || state.title;
      storage.saveSlot(index, serializeMap(viewState()));
      toast(`Saved to slot ${index + 1}.`);
      saveDialog();
    });
    const load = document.createElement("button");
    load.type = "button";
    load.textContent = "Load";
    load.disabled = !slot;
    load.addEventListener("click", () => {
      closeModal();
      loadMap(slot);
    });
    row.append(label, load, save);
    box.append(row);
  });
  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  actions.append(
    actionButton("Export this map", () => downloadJson(serializeMap(viewState()), "europa-canvas-map.json"), false),
    actionButton("Export save library", () => downloadJson(storage.library, "europa-canvas-library.json"), false),
    actionButton("Import a map", () => pickJson((data) => importMap(data)), false),
    actionButton("Import a library", () => pickJson((data) => importLibrary(data)), false),
  );
  if (storage.library.recovery) {
    actions.append(actionButton("Restore recovery copy", () => {
      closeModal();
      loadMap(storage.library.recovery);
    }, false));
  }
  if (storage.library.libraryBackup) {
    actions.append(actionButton("Undo library import", () => {
      storage.restoreLibraryBackup();
      toast("Restored the previous save library.");
      closeModal();
    }, false));
  }
  box.append(actions);
}

function exportDialog() {
  const box = dialogShell("Export artwork");
  const title = document.createElement("input");
  title.type = "text";
  title.value = state.title;
  title.maxLength = 80;
  title.setAttribute("aria-label", "Artwork title");
  const size = document.createElement("select");
  size.setAttribute("aria-label", "Export size");
  ["2400x1600", "3600x2400"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value.replace("x", " × ");
    size.append(option);
  });
  const names = check("Country names", false);
  const cities = check("Major cities", true);
  const legend = check("Territory legend", true);
  const note = document.createElement("p");
  note.className = "note";
  note.textContent = "Exports draw the full atlas, not only the labels currently on screen. Scenario and data attribution are always included.";
  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  const png = document.createElement("button");
  png.type = "button";
  png.textContent = "Download PNG";
  const svg = document.createElement("button");
  svg.type = "button";
  svg.textContent = "Download SVG";
  const options = () => ({
    ...artworkOptions(viewState()),
    title: sanitizeName(title.value, 80) || "Europa Canvas",
    size: size.value,
    countryNames: names.querySelector("input").checked,
    cities: cities.querySelector("input").checked,
    legend: legend.querySelector("input").checked,
  });
  png.addEventListener("click", () => exportPng(options()).catch(() => toast("The image export failed. Try again.")));
  svg.addEventListener("click", () => exportSvg(options()));
  actions.append(svg, png);
  box.append(title, size, names, cities, legend, note, actions);
}

function check(label, checked) {
  const row = document.createElement("label");
  row.className = "check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  row.append(input, document.createTextNode(label));
  return row;
}

function layersPopover() {
  if (modal) {
    closeModal();
    return;
  }
  const box = dialogShell("Map layers");
  const fields = [
    ["terrain", "Terrain shading"],
    ["provinceBorders", "Province borders"],
    ["cities", "Cities"],
    ["provinceNames", "Province names"],
    ["countryNames", "Country names"],
  ];
  fields.forEach(([key, label]) => {
    const row = check(label, state.layers[key] !== false && Boolean(state.layers[key] || key === "terrain" || key === "provinceBorders" || key === "cities"));
    row.querySelector("input").checked = Boolean(state.layers[key]);
    row.querySelector("input").addEventListener("change", (event) => {
      state.layers[key] = event.target.checked;
      view.setLayers(state.layers);
      scheduleSave();
    });
    box.append(row);
  });
}

function menuDialog() {
  const box = dialogShell("Menu");
  const actions = document.createElement("div");
  actions.className = "detail-actions";
  actions.append(
    actionButton("New map", () => {
      closeModal();
      showGate();
    }, false),
    actionButton("Saves", () => saveDialog(), false),
    actionButton("Export artwork", () => exportDialog(), false),
    actionButton("Keyboard shortcuts", () => shortcutDialog(), false),
    actionButton("About this atlas", () => aboutDialog(), false),
  );
  box.append(actions);
}

function shortcutDialog() {
  const box = dialogShell("Shortcuts");
  const lines = [
    "V move, B paint, I pick a country from the map",
    "Drag paints while the paint tool is active. Hold Space to pan.",
    "Right-click picks the country under the cursor.",
    "W previous brush, F locate the current country, / search",
    "Ctrl or Cmd Z undo, Ctrl or Cmd Shift Z redo, Ctrl or Cmd S save",
    "Escape closes the panel in front.",
  ];
  lines.forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    box.append(p);
  });
}

function aboutDialog() {
  const box = dialogShell("About this atlas");
  const p = document.createElement("p");
  p.textContent = state.catalog.disclaimer;
  const a = document.createElement("p");
  a.className = "note";
  a.textContent = state.catalog.attribution;
  box.append(p, a);
}

function importMap(data) {
  const result = storage.validateMap(data, state.catalog);
  if (!result.ok) {
    toast(result.error);
    return;
  }
  if (state.loaded) storage.stashRecovery(serializeMap(viewState()));
  loadMap(result.map);
}

function importLibrary(data) {
  if (JSON.stringify(data).length > 8_000_000) {
    toast("That library is too large.");
    return;
  }
  const result = storage.validateLibrary(data, state.catalog);
  if (!result.ok) {
    toast(result.error);
    return;
  }
  storage.replaceLibrary(result.library);
  toast("Imported the save library. You can undo this from the save menu.");
  if (result.library.autosave) loadMap(result.library.autosave, { quiet: true });
}

function pickJson(done) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 8_000_000) {
      toast("That file is too large.");
      return;
    }
    try {
      done(JSON.parse(await file.text()));
    } catch {
      toast("That file could not be read as JSON.");
    }
  });
  input.click();
}

function downloadJson(value, name) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bind() {
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });
  $("undo").addEventListener("click", undo);
  $("redo").addEventListener("click", redo);
  $("open-search").addEventListener("click", () => {
    openDock(true);
    $("search").focus();
  });
  $("open-layers").addEventListener("click", layersPopover);
  $("open-save").addEventListener("click", () => state.loaded && saveDialog());
  $("open-menu").addEventListener("click", menuDialog);
  $("mobile-countries").addEventListener("click", () => openDock($("dock").hidden));
  $("mobile-save").addEventListener("click", () => state.loaded && saveDialog());
  $("close-dock").addEventListener("click", () => openDock(false));
  $("dock-backdrop").addEventListener("click", () => openDock(false));
  $("create-country").addEventListener("click", () => countryDialog(null));
  $("clear-search").addEventListener("click", () => {
    state.query = "";
    $("search").value = "";
    state.listLimit = 40;
    renderList();
    $("search").focus();
  });
  $("search").addEventListener("input", () => {
    state.query = $("search").value;
    state.listLimit = 40;
    renderList();
  });
  $("tab-countries").addEventListener("click", () => {
    state.listTab = "countries";
    $("tab-countries").setAttribute("aria-selected", "true");
    $("tab-provinces").setAttribute("aria-selected", "false");
    renderList();
  });
  $("tab-provinces").addEventListener("click", () => {
    state.listTab = "provinces";
    $("tab-provinces").setAttribute("aria-selected", "true");
    $("tab-countries").setAttribute("aria-selected", "false");
    renderList();
  });
  $("zoom-in").addEventListener("click", () => zoomAtCenter(0.8));
  $("zoom-out").addEventListener("click", () => zoomAtCenter(1.25));
  $("zoom-fit").addEventListener("click", fitAll);
  const svg = $("map");
  svg.addEventListener("contextmenu", (event) => event.preventDefault());
  svg.addEventListener("wheel", onWheel, { passive: false });
  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerCancel);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("blur", () => {
    rollbackGesture();
    endGesture();
    pointers.clear();
  });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  const observer = new ResizeObserver(() => {
    if (!view) return;
    const camera = { ...view.camera };
    view.resize();
    view.setCamera(camera);
  });
  observer.observe($("stage"));
}

let wheelFrame = 0;
let wheelState = null;
let settleTimer = 0;

function onWheel(event) {
  event.preventDefault();
  const factor = event.deltaY > 0 ? 1.09 : 0.92;
  if (!wheelState) {
    wheelState = { x: event.clientX, y: event.clientY, factor: 1 };
    wheelFrame = requestAnimationFrame(flushWheel);
  }
  wheelState.factor *= factor;
  wheelState.x = event.clientX;
  wheelState.y = event.clientY;
}

function flushWheel() {
  wheelFrame = 0;
  if (!wheelState) return;
  const next = wheelState;
  wheelState = null;
  zoomAt(next.x, next.y, next.factor);
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => view.settle(), 140);
}

function zoomAtCenter(factor) {
  const rect = $("map").getBoundingClientRect();
  zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
}

function zoomAt(clientX, clientY, factor) {
  view.refreshBox();
  const before = view.screenToMap(clientX, clientY);
  const rect = $("map").getBoundingClientRect();
  const ratio = rect.height / Math.max(rect.width, 1);
  const limits = zoomLimits();
  const nextW = clampCamera({ ...view.camera, w: view.camera.w * factor, h: view.camera.w * factor * ratio }, state.catalog.w, state.catalog.h, limits.minW, limits.maxW).w;
  const left = before.x - ((clientX - rect.left) / rect.width) * nextW;
  const top = before.y - ((clientY - rect.top) / rect.height) * (nextW * ratio);
  view.setCamera({ cx: left + nextW / 2, cy: top + (nextW * ratio) / 2, w: nextW });
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => view.settle(), 140);
}

let pointerFrame = 0;

function onPointerDown(event) {
  if (!state.loaded) return;
  view.refreshBox();
  try { $("map").setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size >= 2) {
    rollbackGesture();
    const [a, b] = [...pointers.values()];
    pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      w: view.camera.w,
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      map: view.screenToMap((a.x + b.x) / 2, (a.y + b.y) / 2),
    };
    pan = null;
    gesture = gesture && !gesture.rolledBack ? gesture : null;
    return;
  }
  const index = view.hitTest(event.clientX, event.clientY);
  if (event.button === 2 || (state.tool === "pick" && !spaceHeld)) {
    if (index >= 0) {
      selectIndex(index);
      setBrush(state.ownership[index]);
    }
    return;
  }
  if (state.tool === "paint" && !spaceHeld && event.button === 0 && index >= 0 && (event.detail === 2 || event.shiftKey)) {
    fillConnected(index);
    return;
  }
  if (state.tool === "paint" && !spaceHeld && event.button === 0) {
    if (index >= 0) paintProvince(index);
    return;
  }
  pan = { x: event.clientX, y: event.clientY, cx: view.camera.cx, cy: view.camera.cy };
  $("map").classList.add("is-dragging");
}

function onPointerMove(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (!pointerFrame) pointerFrame = requestAnimationFrame(flushPointer);
}

function flushPointer() {
  pointerFrame = 0;
  if (!pointers.size) return;
  if (pointers.size >= 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const rect = $("map").getBoundingClientRect();
    const ratio = rect.height / Math.max(rect.width, 1);
    const limits = zoomLimits();
    const nextW = clampCamera(
      { w: pinch.w * (pinch.dist / dist) },
      state.catalog.w,
      state.catalog.h,
      limits.minW,
      limits.maxW,
    ).w;
    const relX = (midX - rect.left) / rect.width;
    const relY = (midY - rect.top) / rect.height;
    view.refreshBox();
    view.setCamera({
      w: nextW,
      cx: pinch.map.x - (relX - 0.5) * nextW,
      cy: pinch.map.y - (relY - 0.5) * nextW * ratio,
    });
    return;
  }
  if (gesture && state.tool === "paint" && !spaceHeld) {
    const point = [...pointers.values()].at(-1);
    const index = point ? view.hitTest(point.x, point.y) : -1;
    if (index >= 0) paintProvince(index);
    view.setHover(index >= 0 ? [index] : []);
    return;
  }
  if (pan) {
    const point = [...pointers.values()][0];
    const rect = $("map").getBoundingClientRect();
    const dx = ((point.x - pan.x) / rect.width) * view.camera.w;
    const dy = ((point.y - pan.y) / rect.height) * (view.camera.h || view.camera.w);
    view.setCamera({ cx: pan.cx - dx, cy: pan.cy - dy, w: view.camera.w });
  }
}

function onPointerUp(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) {
    pan = null;
    $("map").classList.remove("is-dragging");
    endGesture();
    view.setHover([]);
    view.settle();
  }
}

function onPointerCancel(event) {
  pointers.delete(event.pointerId);
  rollbackGesture();
  pinch = null;
  pan = null;
  endGesture();
}

function onKeyDown(event) {
  if (event.key === "Escape") {
    if (modal) closeModal();
    else if (!$("dock").hidden && window.innerWidth <= 860) openDock(false);
    else if (state.selection != null) {
      state.selection = null;
      view.setSelected([]);
      renderDetail();
    }
    return;
  }
  if (TYPING.has(event.target?.tagName) || event.target?.isContentEditable || modal) return;
  if (event.key === " " && event.target?.tagName === "BUTTON") return;
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && key === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && key === "s") {
    event.preventDefault();
    if (state.loaded) saveDialog();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === " ") {
    event.preventDefault();
    spaceHeld = true;
    $("map").classList.add("tool-space");
    return;
  }
  if (key === "v") setTool("move");
  else if (key === "b") setTool("paint");
  else if (key === "i") setTool("pick");
  else if (key === "w") swapBrush();
  else if (key === "f" && state.brushId) locateCountry(state.brushId);
  else if (event.key === "/") {
    event.preventDefault();
    openDock(true);
    $("search").focus();
  }
}

function onKeyUp(event) {
  if (event.key === " ") {
    spaceHeld = false;
    $("map").classList.remove("tool-space");
  }
}

boot();

export { MAP_FORMAT };
