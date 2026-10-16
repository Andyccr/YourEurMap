import { layoutAnnotations, textWidth } from "./labels.js";
import { visualProvinces } from "./model.js";

const SEA = "#d5e0db";
const MAX_DPR = 2;

function ringPath(rings) {
  const path = new Path2D();
  for (const ring of rings) {
    if (!ring || ring.length < 4) continue;
    path.moveTo(ring[0][0], ring[0][1]);
    for (let i = 1; i < ring.length; i += 1) path.lineTo(ring[i][0], ring[i][1]);
    path.closePath();
  }
  return path;
}

export function createMapView(canvas, catalog, atoms) {
  const { w: mapW, h: mapH } = catalog;
  const layer = canvas.parentElement;
  const overlay = document.getElementById("overlay");
  const labelRoot = document.getElementById("labels");
  const stage = document.getElementById("stage");
  const ctx = canvas.getContext("2d", { alpha: false });
  const octx = overlay.getContext("2d");
  const paths = atoms.map((atom) => ringPath(atom.rings));
  const edges = catalog.edges.map((edge) => ({
    a: edge.a,
    b: edge.b,
    path: new Path2D(edge.d),
    same: atoms[edge.a].gid === atoms[edge.b].gid,
  }));
  const grid = buildGrid(atoms, mapW, mapH);
  const colors = new Array(atoms.length);
  let ownership = catalog.scenarios[0].owners.slice();
  let countries = new Map();
  let camera = { cx: mapW / 2, cy: mapH / 2, w: mapW, h: mapH };
  let rendered = null;
  let live = false;
  let deferBorders = false;
  let layers = { terrain: true, provinceBorders: true, cities: true, provinceNames: false, countryNames: false };
  let placedLabels = [];
  let labelFrame = 0;
  let drawFrame = 0;
  let borderCache = null;
  const box = { left: 0, top: 0, width: 1, height: 1 };
  const terrainImg = new Image();
  if (catalog.terrain) {
    terrainImg.decoding = "async";
    terrainImg.onload = () => { if (!live) draw(); };
    terrainImg.src = catalog.terrain;
  }

  function colorOf(id) {
    return countries.get(id)?.color || "#8d8376";
  }

  function dpr() {
    return Math.min(window.devicePixelRatio || 1, MAX_DPR);
  }

  function refreshBox() {
    const rect = stage.getBoundingClientRect();
    box.left = rect.left;
    box.top = rect.top;
    box.width = rect.width || 1;
    box.height = rect.height || 1;
  }

  function ensureHeight() {
    const ratio = box.height > 1 ? box.height / box.width : mapH / mapW;
    camera.h = camera.w * ratio;
  }

  function mapTransform() {
    const left = camera.cx - camera.w / 2;
    const top = camera.cy - camera.h / 2;
    const sx = box.width / camera.w;
    const sy = box.height / camera.h;
    const ratio = dpr();
    return { left, top, sx, sy, ratio };
  }

  function setMapTransform(context, m) {
    context.setTransform(m.ratio * m.sx, 0, 0, m.ratio * m.sy, -m.left * m.ratio * m.sx, -m.top * m.ratio * m.sy);
  }

  function invalidateBorders() {
    borderCache = null;
  }

  function ensureBorders() {
    if (borderCache) return borderCache;
    const province = new Path2D();
    const national = new Path2D();
    for (let i = 0; i < edges.length; i += 1) {
      const edge = edges[i];
      if (ownership[edge.a] !== ownership[edge.b]) national.addPath(edge.path);
      else if (!edge.same) province.addPath(edge.path);
    }
    borderCache = { province, national };
    return borderCache;
  }

  function sizeCanvases() {
    const ratio = dpr();
    const width = Math.max(1, Math.round(box.width * ratio));
    const height = Math.max(1, Math.round(box.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      overlay.width = width;
      overlay.height = height;
    }
  }

  function draw() {
    refreshBox();
    ensureHeight();
    sizeCanvases();
    const m = mapTransform();
    ctx.setTransform(m.ratio, 0, 0, m.ratio, 0, 0);
    ctx.fillStyle = SEA;
    ctx.fillRect(0, 0, box.width, box.height);
    setMapTransform(ctx, m);
    const showTerrain = layers.terrain !== false && terrainImg.complete && terrainImg.naturalWidth > 0;
    if (showTerrain) ctx.drawImage(terrainImg, 0, 0, mapW, mapH);
    const maxX = m.left + camera.w;
    const maxY = m.top + camera.h;
    ctx.globalAlpha = showTerrain ? 0.88 : 1;
    for (let i = 0; i < atoms.length; i += 1) {
      const bounds = atoms[i].b;
      if (bounds[2] < m.left || bounds[0] > maxX || bounds[3] < m.top || bounds[1] > maxY) continue;
      colors[i] = colorOf(ownership[i]);
      ctx.fillStyle = colors[i];
      ctx.fill(paths[i], "evenodd");
    }
    ctx.globalAlpha = 1;
    if (!deferBorders) {
      const borders = ensureBorders();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (layers.provinceBorders !== false) {
        ctx.strokeStyle = "rgba(36, 28, 20, 0.33)";
        ctx.lineWidth = 0.8 / m.sx;
        ctx.stroke(borders.province);
      }
      ctx.strokeStyle = "#24180f";
      ctx.lineWidth = 2.15 / m.sx;
      ctx.stroke(borders.national);
    }
    rendered = { cx: camera.cx, cy: camera.cy, w: camera.w, h: camera.h };
    layer.style.transform = "";
    drawOverlay();
  }

  function scheduleDraw() {
    if (live || drawFrame) return;
    drawFrame = requestAnimationFrame(() => {
      drawFrame = 0;
      if (!live) draw();
    });
  }

  function stamp(index) {
    const m = mapTransform();
    ctx.save();
    setMapTransform(ctx, m);
    ctx.beginPath();
    ctx.clip(paths[index], "evenodd");
    const showTerrain = layers.terrain !== false && terrainImg.complete && terrainImg.naturalWidth > 0;
    if (showTerrain) ctx.drawImage(terrainImg, 0, 0, mapW, mapH);
    else {
      ctx.fillStyle = SEA;
      ctx.fillRect(atoms[index].b[0], atoms[index].b[1], atoms[index].b[2], atoms[index].b[3]);
    }
    ctx.globalAlpha = showTerrain ? 0.88 : 1;
    ctx.fillStyle = colors[index];
    ctx.fill(paths[index], "evenodd");
    ctx.restore();
  }

  function paintAtoms(indexes) {
    let changed = false;
    for (let n = 0; n < indexes.length; n += 1) {
      const index = indexes[n];
      const next = colorOf(ownership[index]);
      if (colors[index] === next) continue;
      colors[index] = next;
      changed = true;
      if (!live && rendered) stamp(index);
    }
    if (changed) invalidateBorders();
    if (changed && !deferBorders && !live) scheduleDraw();
  }

  function paintAll() {
    for (let i = 0; i < atoms.length; i += 1) colors[i] = colorOf(ownership[i]);
    invalidateBorders();
    if (!live) draw();
  }

  function updateLiveTransform() {
    if (!rendered) {
      draw();
      return;
    }
    ensureHeight();
    const scale = rendered.w / camera.w;
    const left0 = rendered.cx - rendered.w / 2;
    const top0 = rendered.cy - rendered.h / 2;
    const left1 = camera.cx - camera.w / 2;
    const top1 = camera.cy - camera.h / 2;
    const tx = ((left0 - left1) / camera.w) * box.width;
    const ty = ((top0 - top1) / camera.h) * box.height;
    layer.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function drawOverlay() {
    const ratio = dpr();
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    if (!hoverIndexes.length && !selectedIndexes.length) return;
    const m = mapTransform();
    setMapTransform(octx, m);
    octx.lineJoin = "round";
    octx.lineWidth = 2.2 / m.sx;
    octx.strokeStyle = "#f7f1e4";
    for (let i = 0; i < hoverIndexes.length; i += 1) octx.stroke(paths[hoverIndexes[i]]);
    octx.setLineDash([6 / m.sx, 4 / m.sx]);
    octx.lineWidth = 2.4 / m.sx;
    for (let i = 0; i < selectedIndexes.length; i += 1) octx.stroke(paths[selectedIndexes[i]]);
    octx.setLineDash([]);
  }

  let hoverIndexes = [];
  let selectedIndexes = [];

  function obstacles() {
    return [...document.querySelectorAll("[data-obstacle]")].filter((element) => !element.hidden && element.getClientRects().length).map((element) => {
      const rect = element.getBoundingClientRect();
      const origin = stage.getBoundingClientRect();
      return {
        x: rect.left - origin.left - 6,
        y: rect.top - origin.top - 6,
        w: rect.width + 12,
        h: rect.height + 12,
      };
    });
  }

  function toScreen(x, y) {
    const left = camera.cx - camera.w / 2;
    const top = camera.cy - camera.h / 2;
    return {
      x: ((x - left) / camera.w) * box.width,
      y: ((y - top) / camera.h) * box.height,
    };
  }

  function updateLabels() {
    if (!labelRoot || live) return;
    refreshBox();
    ensureHeight();
    if (box.width < 20) return;
    const zoom = camera.w / mapW;
    const items = [];
    if (layers.cities !== false) {
      const rankLimit = zoom > 0.72 ? 0 : zoom > 0.42 ? 1 : zoom > 0.22 ? 2 : 3;
      for (const city of catalog.cities) {
        if (city.r > rankLimit) continue;
        const screen = toScreen(city.x, city.y);
        items.push({
          text: city.n,
          x: screen.x,
          y: screen.y,
          mapX: city.x,
          mapY: city.y,
          w: textWidth(city.n, 12),
          h: 16,
          rank: city.r,
          priority: city.p || 0,
          kind: "city",
        });
      }
    }
    if (layers.countryNames) {
      const groups = new Map();
      ownership.forEach((id, index) => {
        const bounds = atoms[index].b;
        const area = atoms[index].area || 1;
        const group = groups.get(id) || { id, area: 0, x: 0, y: 0 };
        group.area += area;
        group.x += ((bounds[0] + bounds[2]) / 2) * area;
        group.y += ((bounds[1] + bounds[3]) / 2) * area;
        groups.set(id, group);
      });
      for (const group of groups.values()) {
        const country = countries.get(group.id);
        if (!country || group.area < 8000) continue;
        const mapX = group.x / group.area;
        const mapY = group.y / group.area;
        const screen = toScreen(mapX, mapY);
        items.push({
          text: country.name,
          x: screen.x,
          y: screen.y,
          mapX,
          mapY,
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
        const mapX = (province.bbox[0] + province.bbox[2]) / 2;
        const mapY = (province.bbox[1] + province.bbox[3]) / 2;
        const screen = toScreen(mapX, mapY);
        items.push({
          text: province.name,
          x: screen.x,
          y: screen.y,
          mapX,
          mapY,
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
      const screen = toScreen(sea.x, sea.y);
      items.push({
        text: sea.n,
        x: screen.x,
        y: screen.y,
        mapX: sea.x,
        mapY: sea.y,
        w: textWidth(sea.n, 12),
        h: 16,
        rank: 1,
        priority: 1,
        kind: "sea",
      });
    }
    const placed = layoutAnnotations(items, { x: 8, y: 8, w: box.width - 16, h: box.height - 16 }, {
      max: zoom > 0.72 ? 14 : zoom > 0.4 ? 24 : 32,
      gap: 8,
      obstacles: obstacles(),
    });
    const same = placed.length === placedLabels.length && placed.every((item, index) => (
      placedLabels[index].text === item.text && placedLabels[index].kind === item.kind
    ));
    if (!same) {
      labelRoot.replaceChildren();
      placedLabels = placed.map((item) => {
        const node = document.createElement("span");
        node.className = `map-label map-label-${item.kind}`;
        node.textContent = item.text;
        labelRoot.append(node);
        return { node, x: item.mapX, y: item.mapY, text: item.text, kind: item.kind };
      });
    } else {
      for (let i = 0; i < placed.length; i += 1) {
        placedLabels[i].x = placed[i].mapX;
        placedLabels[i].y = placed[i].mapY;
      }
    }
    positionLabels();
  }

  function positionLabels() {
    const left = camera.cx - camera.w / 2;
    const top = camera.cy - camera.h / 2;
    const sx = box.width / camera.w;
    const sy = box.height / (camera.h || 1);
    for (let i = 0; i < placedLabels.length; i += 1) {
      const item = placedLabels[i];
      const px = (item.x - left) * sx;
      const py = (item.y - top) * sy;
      item.node.style.left = `${px}px`;
      item.node.style.top = `${py}px`;
      item.node.style.visibility = px < -40 || py < -20 || px > box.width + 40 || py > box.height + 20 ? "hidden" : "visible";
    }
  }

  function screenToMap(clientX, clientY) {
    const left = camera.cx - camera.w / 2;
    const top = camera.cy - camera.h / 2;
    return {
      x: left + ((clientX - box.left) / box.width) * camera.w,
      y: top + ((clientY - box.top) / box.height) * camera.h,
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

  return {
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
      invalidateBorders();
      if (!live) draw();
      updateLabels();
    },
    paintAll,
    paintAtoms,
    setDeferBorders(value) {
      deferBorders = value;
      if (!value) {
        invalidateBorders();
        if (!live) draw();
      }
    },
    setLive(value) {
      live = value;
      if (!value) {
        layer.style.transform = "";
        draw();
        updateLabels();
      }
    },
    rebuildBorders() {
      invalidateBorders();
      if (!deferBorders && !live) draw();
    },
    setHover(indexes) {
      hoverIndexes = indexes || [];
      if (!live) drawOverlay();
    },
    setSelected(indexes) {
      selectedIndexes = indexes || [];
      if (!live) drawOverlay();
    },
    setCamera(next) {
      camera = { ...camera, ...next };
      ensureHeight();
      if (live) updateLiveTransform();
      else {
        cancelAnimationFrame(drawFrame);
        drawFrame = 0;
        draw();
        if (!labelFrame) labelFrame = requestAnimationFrame(() => {
          labelFrame = 0;
          updateLabels();
        });
      }
    },
    refreshBox,
    resize() {
      live = false;
      layer.style.transform = "";
      refreshBox();
      draw();
      updateLabels();
    },
    settle() {
      live = false;
      layer.style.transform = "";
      invalidateBorders();
      draw();
      updateLabels();
    },
    hitTest,
    screenToMap,
    destroy() {
      cancelAnimationFrame(labelFrame);
      cancelAnimationFrame(drawFrame);
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
  const bounds = atom.b;
  if (x < bounds[0] || x > bounds[2] || y < bounds[1] || y > bounds[3]) return false;
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
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) buckets[row * cols + col].push(index);
    }
  });
  return {
    query(x, y) {
      const col = Math.floor(x / cell);
      const row = Math.floor(y / cell);
      if (col < 0 || row < 0 || col >= cols || row >= rows) return [];
      return buckets[row * cols + col];
    },
  };
}
