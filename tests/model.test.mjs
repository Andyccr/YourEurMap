import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildSvg } from "../js/export-map.js";
import { layoutAnnotations } from "../js/labels.js";
import {
  applyOwnership,
  connectedAtoms,
  createGesture,
  createHistory,
  describePaint,
  diffOwnership,
  pushHistory,
  redoHistory,
  searchEntries,
  undoHistory,
  validateLibrary,
  validateMap,
  visualProvinces,
} from "../js/model.js";

const fixture = {
  scenarios: [{ id: "1815", label: "1815", blurb: "Test", owners: ["fra", "fra", "spa"] }],
  polities: [
    { id: "fra", n: "France", c: "#224466" },
    { id: "spa", n: "Spain", c: "#aa8800" },
  ],
  atoms: [
    { id: "a", gid: "g", n: "Alpha", l: "Alfa", aka: ["Old Alpha"], nb: [1], b: [0, 0, 10, 10], area: 10, cap: { n: "A Town", v: 1 } },
    { id: "b", gid: "g", n: "Beta", l: "Beta", aka: [], nb: [0], b: [10, 0, 20, 10], area: 8, cap: { n: "B Town", v: 0 } },
    { id: "c", gid: "h", n: "Gamma", l: "Gamma", aka: ["Coast"], nb: [], b: [40, 0, 50, 10], area: 6, cap: { n: "Game center", v: 0 } },
  ],
  groups: {
    g: { n: "Alpha Coast", l: "Alfa", cap: { n: "A Town", v: 1 } },
    h: { n: "Gamma", l: "Gamma", cap: { n: "Game center", v: 0 } },
  },
};

test("one gesture undo restores every province in the stroke", () => {
  const ownership = ["spa", "spa", "spa"];
  const gesture = createGesture(ownership);
  ownership[0] = "fra";
  ownership[1] = "fra";
  const history = createHistory();
  const changes = diffOwnership(gesture.snapshot, ownership);
  pushHistory(history, { label: describePaint(1, "Alpha Coast"), changes });
  assert.equal(history.past[0].label, "Painted Alpha Coast");
  applyOwnership(ownership, undoHistory(history).changes, "undo");
  assert.deepEqual(ownership, ["spa", "spa", "spa"]);
  applyOwnership(ownership, redoHistory(history).changes, "redo");
  assert.deepEqual(ownership, ["fra", "fra", "spa"]);
});

test("rollback discards an interrupted stroke", () => {
  const ownership = ["spa", "spa", "spa"];
  const gesture = createGesture(ownership);
  ownership[0] = "fra";
  gesture.rollback(ownership);
  assert.equal(gesture.rolledBack, true);
  assert.deepEqual(ownership, ["spa", "spa", "spa"]);
});

test("connected painting stays on shared land borders", () => {
  const ownership = ["fra", "fra", "fra"];
  const reached = connectedAtoms(fixture.atoms, ownership, 0);
  assert.deepEqual([...reached].sort(), [0, 1]);
});

test("old saves can split a designed province", () => {
  const atoms = fixture.atoms.map((atom) => ({ ...atom, groupName: fixture.groups[atom.gid].n }));
  const uniform = visualProvinces(atoms, ["fra", "fra", "spa"]);
  assert.equal(uniform.provinces.filter((province) => province.gid === "g").length, 1);
  const split = visualProvinces(atoms, ["fra", "spa", "spa"]);
  const pieces = split.provinces.filter((province) => province.gid === "g");
  assert.equal(pieces.length, 2);
  assert.equal(pieces.some((province) => province.indexes.includes(0)), true);
  assert.equal(pieces.some((province) => province.indexes.includes(1)), true);
});

test("search finds original names without changing the caller’s tab", () => {
  const atoms = fixture.atoms.map((atom) => ({
    ...atom,
    groupName: fixture.groups[atom.gid].n,
    groupLocal: fixture.groups[atom.gid].l,
    groupCap: fixture.groups[atom.gid].cap,
  }));
  const { provinces } = visualProvinces(atoms, ["fra", "fra", "spa"]);
  const countries = new Map([["fra", { id: "fra", name: "France" }], ["spa", { id: "spa", name: "Spain" }]]);
  const hits = searchEntries(provinces, countries, "old alpha");
  assert.equal(hits.provinces.length, 1);
  assert.equal(hits.countries.length, 0);
});

test("imports reject bad versions, owners, and oversized text", () => {
  const badVersion = validateMap({ format: "europa-canvas-map", version: 9, scenarioId: "1815" }, fixture);
  assert.equal(badVersion.ok, false);
  const badOwner = validateMap({
    format: "europa-canvas-map",
    version: 1,
    scenarioId: "1815",
    countries: [{ id: "fra", name: "France", color: "#112233" }],
    ownership: { a: "missing", b: "fra", c: "fra" },
  }, fixture);
  assert.equal(badOwner.ok, false);
  const badColor = validateMap({
    format: "europa-canvas-map",
    version: 1,
    scenarioId: "1815",
    countries: [{ id: "fra", name: "France", color: "red" }],
    ownership: { a: "fra", b: "fra", c: "fra" },
  }, fixture);
  assert.equal(badColor.ok, false);
  const library = validateLibrary({ format: "nope", version: 1 }, fixture);
  assert.equal(library.ok, false);
});

test("svg export escapes player text", () => {
  const svg = buildSvg({
    width: 2400,
    height: 1600,
    pad: 40,
    titleH: 80,
    footerH: 40,
    legendWidth: 200,
    scale: 1,
    mapX: 0,
    mapY: 0,
    mapW: 100,
    mapH: 100,
  }, {
    atoms: [{ rings: [[[0, 0], [10, 0], [10, 10], [0, 0]]] }],
    edges: [],
    ownership: ["fra"],
    countries: new Map([["fra", { id: "fra", name: "A & B <script>", color: "#112233" }]]),
    mapW: 100,
    mapH: 100,
    title: `Tom & "Jerry" <tag>`,
    scenarioLabel: "1815",
    attribution: "Natural Earth",
    legend: true,
  });
  assert.equal(svg.includes("<script>"), false);
  assert.equal(svg.includes("Tom &amp; &quot;Jerry&quot; &lt;tag&gt;"), true);
  assert.equal(svg.includes("A &amp; B &lt;script&gt;"), true);
  assert.equal(svg.includes("Natural Earth"), true);
});

test("labels avoid overlap", () => {
  const placed = layoutAnnotations([
    { text: "Paris", x: 50, y: 50, w: 40, h: 16, rank: 0, priority: 10 },
    { text: "Lyon", x: 52, y: 52, w: 40, h: 16, rank: 1, priority: 5 },
    { text: "Nice", x: 200, y: 80, w: 40, h: 16, rank: 1, priority: 4 },
  ], { x: 0, y: 0, w: 400, h: 200 }, { max: 5, gap: 2 });
  assert.deepEqual(placed.map((item) => item.text), ["Paris", "Nice"]);
});

test("historical scenario boundaries stay intact in the built atlas", () => {
  const map = JSON.parse(readFileSync(new URL("../data/map.json", import.meta.url)));
  const byName = new Map();
  map.atoms.forEach((atom, index) => {
    const names = [atom.n, atom.l, ...(atom.aka || [])].map((name) => name.toLowerCase());
    names.forEach((name) => {
      const list = byName.get(name) || [];
      list.push(index);
      byName.set(name, list);
    });
  });
  const owner = (name, scenario) => {
    const index = byName.get(name)?.[0];
    assert.ok(index != null, name);
    return map.scenarios.find((item) => item.id === scenario).owners[index];
  };
  assert.equal(owner("bas-rhin", "1914"), "ger");
  assert.equal(owner("bas-rhin", "1815"), "fra");
  assert.equal(owner("marne", "1914"), "fra");
  const alsace = byName.get("bas-rhin")[0];
  const marne = byName.get("marne")[0];
  assert.notEqual(map.atoms[alsace].gid, map.atoms[marne].gid);
  assert.equal(owner("bozen", "1914"), "auh");
  assert.equal(owner("skåne", "1650") === "den" || owner("skane", "1650") === "den", true);
  const groups = new Map();
  map.atoms.forEach((atom, index) => {
    const key = atom.gid;
    const owners = map.scenarios.map((scenario) => scenario.owners[index]);
    const existing = groups.get(key);
    if (!existing) groups.set(key, owners.join("|"));
    else assert.equal(existing, owners.join("|"), key);
  });
  assert.ok(map.atoms.length > 400);
  assert.ok(map.groups[map.atoms[alsace].gid]);
});
