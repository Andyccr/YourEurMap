import { layoutAnnotations, textWidth } from "./labels.js";
import { visualProvinces } from "./model.js";

function ringsToPath(rings) {
  let path = "";
  for (const ring of rings) {
    if (!ring || ring.length < 4) continue;
    path += `M${ring[0][0]} ${ring[0][1]}`;
    for (let i = 1; i < ring.length; i += 1) path += `L${ring[i][0]} ${ring[i][1]}`;
    path += "Z";
  }
  return path;
}

export function createMapView(svg, catalog, atoms) {
  const { w: mapW, h: mapH } = catalog;
  svg.setAttribute("viewBox", `0 0 ${mapW} ${mapH}`);
  svg.innerHTML = "";
  const ns = "http://www.w3.org/2000/svg";
  const sea = document.createElementNS(ns, "rect");
  sea.setAttribute("class", "sea");
  sea.setAttribute("x", "0");
  sea.setAttribute("y", "0");
  sea.setAttribute("width", String(mapW));
  sea.setAttribute("height", String(mapH));
  svg.append(sea);

  const defs = document.createElementNS(ns, "defs");
  const mask = document.createElementNS(ns, "mask");
  mask.id = "land-mask";
  const maskShade = document.createElementNS(ns, "rect");
  maskShade.setAttribute("width", String(mapW));
  maskShade.setAttribute("height", String(mapH));
  maskShade.setAttribute("fill", "black");
  const maskLand = document.createElementNS(ns, "g");
  maskLand.id = "mask-land";
  mask.append(maskShade, maskLand);
  defs.append(mask);
  svg.append(defs);

  const terrain = document.createElementNS(ns, "image");
  terrain.id = "terrain";
  terrain.setAttribute("x", "0");
  terrain.setAttribute("y", "0");
  terrain.setAttribute("width", String(mapW));
  terrain.setAttribute("height", String(mapH));
  terrain.setAttribute("preserveAspectRatio", "none");
  terrain.setAttribute("mask", "url(#land-mask)");
  if (catalog.terrain) terrain.setAttribute("href", catalog.terrain);
  svg.append(terrain);

  const atomLayer = document.createElementNS(ns, "g");
  atomLayer.id = "atoms";
  svg.append(atomLayer);
  const provinceBorders = document.createElementNS(ns, "path");
  provinceBorders.id = "province-borders";
  const nationalBorders = document.createElementNS(ns, "path");
  nationalBorders.id = "national-borders";
  const hover = document.createElementNS(ns, "path");
  hover.id = "hover-ring";
  const selected = document.createElementNS(ns, "path");
  selected.id = "selected-ring";
  svg.append(provinceBorders, nationalBorders, hover, selected);

  const paths = atoms.map((atom) => ringsToPath(atom.rings));
  const elements = paths.map((d, index) => {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill-rule", "evenodd");
    path.dataset.index = String(index);
    path.classList.add("atom");
    atomLayer.append(path);
    const maskPath = document.createElementNS(ns, "path");
    maskPath.setAttribute("d", d);
    maskPath.setAttribute("fill", "white");
    maskLand.append(maskPath);
    return path;
  });

  const grid = buildGrid(atoms, mapW, mapH);
  let ownership = catalog.scenarios[0].owners.slice();
  let countries = new Map();
  let camera = { cx: mapW / 2, cy: mapH / 2, w: mapW };
  let layers = { terrain: true, provinceBorders: true, cities: true, provinceNames: false, countryNames: false };
  let labelFrame = 0;
  let borderFrame = 0;
  let cullFrame = 0;
  const labelRoot = document.getElementById("labels");

  function colorOf(id) {
    return countries.get(id)?.color || "#8d8376";
  }

  function paintAtom(index) {
    const color = colorOf(ownership[index]);
    const element = elements[index];
    element.setAttribute("fill", color);
    element.style.stroke = color;
  }

  function paintAll() {
    for (let i = 0; i < elements.length; i += 1) paintAtom(i);
  }

  function rebuildBorders() {
    const { atomProvince } = visualProvinces(atoms, ownership);
    let province = "";
    let national = "";
    for (const edge of catalog.edges) {
      if (ownership[edge.a] !== ownership[edge.b]) national += edge.d;
      else if (atomProvince[edge.a]?.key !== atomProvince[edge.b]?.key) province += edge.d;
    }
    provinceBorders.setAttribute("d", province);
    nationalBorders.setAttribute("d", national);
  }

  function scheduleBorders() {
    cancelAnimationFrame(borderFrame);
    borderFrame = requestAnimationFrame(rebuildBorders);
  }

  function setHover(indexes) {
    hover.setAttribute("d", indexes?.length ? indexes.map((index) => paths[index]).join("") : "");
  }

  function setSelected(indexes) {
    selected.setAttribute("d", indexes?.length ? indexes.map((index) => paths[index]).join("") : "");
  }

  function applyCamera() {
    const rect = svg.getBoundingClientRect();
    const ratio = rect.height > 0 ? rect.height / rect.width : mapH / mapW;
    camera.h = camera.w * ratio;
    const x = camera.cx - camera.w / 2;
    const y = camera.cy - camera.h / 2;
    svg.setAttribute("viewBox", `${x} ${y} ${camera.w} ${camera.h}`);
  }

  function cull() {
    const margin = camera.w * 0.08;
    const minX = camera.cx - camera.w / 2 - margin;
    const maxX = camera.cx + camera.w / 2 + margin;
    const minY = camera.cy - camera.h / 2 - margin;
    const maxY = camera.cy + camera.h / 2 + margin;
    const zoomed = camera.w < mapW * 0.72;
    for (let i = 0; i < atoms.length; i += 1) {
      const box = atoms[i].b;
      const visible = !zoomed || (box[2] >= minX && box[0] <= maxX && box[3] >= minY && box[1] <= maxY);
      elements[i].style.display = visible ? "" : "none";
    }
  }

  function scheduleCull() {
    cancelAnimationFrame(cullFrame);
    cullFrame = requestAnimationFrame(cull);
  }

  function obstacles() {
    return [...document.querySelectorAll("[data-obstacle]")].filter((element) => !element.hidden && element.getClientRects().length).map((element) => {
      const rect = element.getBoundingClientRect();
      const stage = svg.getBoundingClientRect();
      return {
        x: rect.left - stage.left - 6,
        y: rect.top - stage.top - 6,
        w: rect.width + 12,
        h: rect.height + 12,
      };
    });
  }

  function updateLabels() {
    if (!labelRoot) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width < 20) return;
    const zoom = camera.w / mapW;
    const items = [];
    if (layers.cities !== false) {
      const rankLimit = zoom > 0.72 ? 0 : zoom > 0.42 ? 1 : zoom > 0.22 ? 2 : 3;
      const max = zoom > 0.72 ? 12 : zoom > 0.42 ? 24 : 36;
      for (const city of catalog.cities) {
        if (city.r > rankLimit) continue;
        const screen = toScreen(city.x, city.y, rect);
        items.push({
          text: city.n,
          x: screen.x,
          y: screen.y,
          w: textWidth(city.n, 12),
          h: 16,
          rank: city.r,
          priority: city.p || 0,
          kind: "city",
          max,
        });
      }
    }
    if (layers.countryNames) {
      const groups = new Map();
      ownership.forEach((id, index) => {
        const box = atoms[index].b;
        const group = groups.get(id) || { id, area: 0, x: 0, y: 0 };
        const area = atoms[index].area || 1;
        group.area += area;
        group.x += ((box[0] + box[2]) / 2) * area;
        group.y += ((box[1] + box[3]) / 2) * area;
        groups.set(id, group);
      });
      for (const group of groups.values()) {
        const country = countries.get(group.id);
        if (!country || group.area < 8000) continue;
        const screen = toScreen(group.x / group.area, group.y / group.area, rect);
        items.push({
          text: country.name,
          x: screen.x,
          y: screen.y,
          w: textWidth(country.name, 13),
          h: 18,
          rank: group.area > 80000 ? 0 : 1,
          priority: group.area,
          kind: "country",
        });
      }
    }
    if (layers.provinceNames && zoom < 0.45) {
      const { provinces } = visualProvinces(atoms, ownership);
      for (const province of provinces) {
        const screen = toScreen((province.bbox[0] + province.bbox[2]) / 2, (province.bbox[1] + province.bbox[3]) / 2, rect);
        items.push({
          text: province.name,
          x: screen.x,
          y: screen.y,
          w: textWidth(province.name, 11),
          h: 14,
          rank: 2,
          priority: province.area,
          kind: "province",
        });
      }
    }
    for (const sea of catalog.seas || []) {
      if (zoom > 0.55) continue;
      const screen = toScreen(sea.x, sea.y, rect);
      items.push({
        text: sea.n,
        x: screen.x,
        y: screen.y,
        w: textWidth(sea.n, 12),
        h: 16,
        rank: 1,
        priority: 1,
        kind: "sea",
      });
    }
    const bounds = { x: 8, y: 8, w: rect.width - 16, h: rect.height - 16 };
    const placed = layoutAnnotations(items, bounds, {
      max: zoom > 0.72 ? 16 : zoom > 0.4 ? 28 : 40,
      gap: 8,
      obstacles: obstacles(),
    });
    labelRoot.replaceChildren();
    for (const item of placed) {
      const node = document.createElement("span");
      node.className = `map-label map-label-${item.kind}`;
      node.textContent = item.text;
      node.style.left = `${item.x}px`;
      node.style.top = `${item.y}px`;
      labelRoot.append(node);
    }
  }

  function scheduleLabels() {
    cancelAnimationFrame(labelFrame);
    labelFrame = requestAnimationFrame(updateLabels);
  }

  function toScreen(x, y, rect = svg.getBoundingClientRect()) {
    const left = camera.cx - camera.w / 2;
    const top = camera.cy - camera.h / 2;
    return {
      x: ((x - left) / camera.w) * rect.width,
      y: ((y - top) / camera.h) * rect.height,
    };
  }

  function screenToMap(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const left = camera.cx - camera.w / 2;
    const top = camera.cy - camera.h / 2;
    return {
      x: left + ((clientX - rect.left) / rect.width) * camera.w,
      y: top + ((clientY - rect.top) / rect.height) * camera.h,
    };
  }

  function hitTest(clientX, clientY) {
    const point = screenToMap(clientX, clientY);
    const candidates = grid.query(point.x, point.y);
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const index = candidates[i];
      if (pointInAtom(point.x, point.y, atoms[index])) return index;
    }
    return -1;
  }

  terrain.style.display = layers.terrain ? "" : "none";

  return {
    elements,
    get camera() {
      return camera;
    },
    setOwnership(next) {
      ownership = next;
    },
    setCountries(next) {
      countries = next;
    },
    setLayers(next) {
      layers = next;
      terrain.style.display = layers.terrain ? "" : "none";
      provinceBorders.style.display = layers.provinceBorders ? "" : "none";
      scheduleLabels();
    },
    paintAll,
    paintAtoms(indexes) {
      for (const index of indexes) paintAtom(index);
      scheduleBorders();
    },
    rebuildBorders,
    setHover,
    setSelected,
    setCamera(next) {
      camera = { ...camera, ...next };
      applyCamera();
    },
    resize() {
      applyCamera();
      scheduleCull();
      scheduleLabels();
    },
    settle() {
      scheduleCull();
      scheduleLabels();
      scheduleBorders();
    },
    hitTest,
    screenToMap,
    destroy() {
      cancelAnimationFrame(labelFrame);
      cancelAnimationFrame(borderFrame);
      cancelAnimationFrame(cullFrame);
    },
  };
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInAtom(x, y, atom) {
  const box = atom.b;
  if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) return false;
  let inside = false;
  for (const ring of atom.rings) {
    if (pointInRing(x, y, ring)) inside = !inside;
  }
  return inside;
}

function buildGrid(atoms, mapW, mapH) {
  const cell = 64;
  const cols = Math.ceil(mapW / cell);
  const rows = Math.ceil(mapH / cell);
  const buckets = Array.from({ length: cols * rows }, () => []);
  atoms.forEach((atom, index) => {
    const [minX, minY, maxX, maxY] = atom.b;
    const c0 = Math.max(0, Math.floor(minX / cell));
    const c1 = Math.min(cols - 1, Math.floor(maxX / cell));
    const r0 = Math.max(0, Math.floor(minY / cell));
    const r1 = Math.min(rows - 1, Math.floor(maxY / cell));
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) buckets[r * cols + c].push(index);
    }
  });
  return {
    query(x, y) {
      const c = Math.floor(x / cell);
      const r = Math.floor(y / cell);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return [];
      return buckets[r * cols + c];
    },
  };
}
