import { layoutAnnotations, textWidth } from "./labels.js";
import { countsByCountry, escapeXml, visualProvinces } from "./model.js";

const SIZES = {
  "2400x1600": [2400, 1600],
  "3600x2400": [3600, 2400],
};

export function exportSize(id) {
  return SIZES[id] || SIZES["2400x1600"];
}

export async function renderArtwork(options) {
  const [width, height] = exportSize(options.size);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const layout = computeLayout(options, width, height);
  drawArtwork(ctx, layout, options, await loadTerrain(options.terrain));
  return { canvas, layout };
}

export async function exportPng(options) {
  const { canvas } = await renderArtwork(options);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not create the PNG.");
  downloadBlob(blob, fileName(options, "png"));
}

export function exportSvg(options) {
  const [width, height] = exportSize(options.size);
  const layout = computeLayout(options, width, height);
  const svg = buildSvg(layout, options);
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), fileName(options, "svg"));
}

function fileName(options, ext) {
  const slug = (options.title || "europa-canvas").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "europa-canvas";
  return `${slug}-${options.scenarioId}.${ext}`;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function computeLayout(options, width, height) {
  const legendWidth = options.legend ? Math.round(width * 0.23) : Math.round(width * 0.04);
  const pad = Math.round(width * 0.028);
  const titleH = Math.round(height * 0.07);
  const footerH = Math.round(height * 0.055);
  const box = {
    x: pad,
    y: titleH,
    w: width - pad * 2 - legendWidth,
    h: height - titleH - footerH,
  };
  const scale = Math.min(box.w / options.mapW, box.h / options.mapH);
  const mapW = options.mapW * scale;
  const mapH = options.mapH * scale;
  return {
    width,
    height,
    pad,
    titleH,
    footerH,
    legendWidth,
    scale,
    mapX: box.x + (box.w - mapW) / 2,
    mapY: box.y + (box.h - mapH) / 2,
    mapW,
    mapH,
  };
}

function loadTerrain(src) {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth ? image : null);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawArtwork(ctx, layout, options, terrain) {
  ctx.fillStyle = "#efe4cc";
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = "#d7e0db";
  ctx.fillRect(layout.mapX, layout.mapY, layout.mapW, layout.mapH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.mapX, layout.mapY, layout.mapW, layout.mapH);
  ctx.clip();
  ctx.translate(layout.mapX, layout.mapY);
  ctx.scale(layout.scale, layout.scale);
  if (terrain && options.layers.terrain !== false) {
    ctx.save();
    ctx.beginPath();
    traceLand(ctx, options.atoms);
    ctx.clip("evenodd");
    ctx.drawImage(terrain, 0, 0, options.mapW, options.mapH);
    ctx.restore();
  }
  for (let i = 0; i < options.atoms.length; i += 1) {
    const color = options.countries.get(options.ownership[i])?.color || "#8d8376";
    ctx.beginPath();
    traceRings(ctx, options.atoms[i].rings);
    ctx.fillStyle = color;
    ctx.globalAlpha = terrain ? 0.78 : 0.94;
    ctx.fill("evenodd");
    ctx.globalAlpha = 1;
  }
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(48, 36, 24, 0.28)";
  ctx.lineWidth = 1.1 / layout.scale;
  for (const edge of options.edges) {
    if (options.ownership[edge.a] === options.ownership[edge.b]) {
      ctx.stroke(new Path2D(edge.d));
    }
  }
  ctx.strokeStyle = "rgba(32, 24, 18, 0.88)";
  ctx.lineWidth = 2.4 / layout.scale;
  for (const edge of options.edges) {
    if (options.ownership[edge.a] !== options.ownership[edge.b]) ctx.stroke(new Path2D(edge.d));
  }
  ctx.restore();
  drawFrameText(ctx, layout, options);
  if (options.countryNames || options.cities) drawMapLabels(ctx, layout, options);
  if (options.legend) drawLegend(ctx, layout, options);
}

function traceRings(ctx, rings) {
  for (const ring of rings) {
    ring.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point[0], point[1]);
      else ctx.lineTo(point[0], point[1]);
    });
    ctx.closePath();
  }
}

function traceLand(ctx, atoms) {
  for (const atom of atoms) traceRings(ctx, atom.rings);
}

function drawFrameText(ctx, layout, options) {
  ctx.fillStyle = "#241c14";
  ctx.font = `600 ${Math.round(layout.height * 0.034)}px Literata, Palatino, serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(options.title || "Europa Canvas", layout.pad, layout.titleH * 0.48);
  ctx.font = `400 ${Math.round(layout.height * 0.018)}px "Source Sans 3", sans-serif`;
  ctx.fillStyle = "#5c5146";
  const scenario = options.scenarioLabel || options.scenarioId;
  ctx.textAlign = "right";
  ctx.fillText(scenario, layout.width - layout.pad, layout.titleH * 0.48);
  ctx.textAlign = "left";
  ctx.font = `400 ${Math.round(layout.height * 0.014)}px "Source Sans 3", sans-serif`;
  const footer = `${options.scenarioBlurb || ""}  ${options.attribution || ""}`.trim();
  wrapText(ctx, footer, layout.pad, layout.height - layout.footerH + 8, layout.width - layout.pad * 2, Math.round(layout.height * 0.016));
}

function drawMapLabels(ctx, layout, options) {
  const items = [];
  if (options.cities) {
    for (const city of options.citiesData || []) {
      if (city.r > 0) continue;
      items.push({
        text: city.n,
        x: layout.mapX + city.x * layout.scale,
        y: layout.mapY + city.y * layout.scale,
        w: textWidth(city.n, 13),
        h: 16,
        rank: city.r,
        priority: city.p || 0,
        kind: "city",
      });
    }
  }
  if (options.countryNames) {
    const groups = new Map();
    options.ownership.forEach((id, index) => {
      const atom = options.atoms[index];
      const area = atom.area || 1;
      const group = groups.get(id) || { id, area: 0, x: 0, y: 0 };
      group.area += area;
      group.x += atom.cx * area;
      group.y += atom.cy * area;
      groups.set(id, group);
    });
    for (const group of groups.values()) {
      const country = options.countries.get(group.id);
      if (!country) continue;
      items.push({
        text: country.name,
        x: layout.mapX + (group.x / group.area) * layout.scale,
        y: layout.mapY + (group.y / group.area) * layout.scale,
        w: textWidth(country.name, 15),
        h: 18,
        rank: 0,
        priority: group.area,
        kind: "country",
      });
    }
  }
  const placed = layoutAnnotations(items, {
    x: layout.mapX + 8,
    y: layout.mapY + 8,
    w: layout.mapW - 16,
    h: layout.mapH - 16,
  }, { max: 28, gap: 10 });
  for (const item of placed) {
    ctx.font = item.kind === "country"
      ? "600 15px Literata, Palatino, serif"
      : "600 12px \"Source Sans 3\", sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(244, 236, 220, 0.85)";
    ctx.strokeText(item.text, item.x, item.y);
    ctx.fillStyle = item.kind === "sea" ? "#3f534e" : "#241c14";
    ctx.fillText(item.text, item.x, item.y);
  }
}

function drawLegend(ctx, layout, options) {
  const counts = countsByCountry(options.ownership);
  const rows = [...options.countries.values()]
    .map((country) => ({ ...country, count: counts.get(country.id) || 0 }))
    .filter((country) => country.count > 0)
    .sort((a, b) => b.count - a.count);
  const shown = rows.slice(0, 42);
  const hidden = rows.length - shown.length;
  const x = layout.width - layout.pad - layout.legendWidth + 12;
  let y = layout.titleH + 8;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#241c14";
  ctx.font = "600 16px Literata, Palatino, serif";
  ctx.fillText("Territories", x, y + 8);
  y += 28;
  const rowH = Math.max(16, Math.min(22, (layout.mapH - 36) / (shown.length + 1)));
  ctx.font = `${Math.max(11, rowH * 0.62)}px "Source Sans 3", sans-serif`;
  for (const country of shown) {
    ctx.fillStyle = country.color;
    ctx.fillRect(x, y, 12, 12);
    ctx.strokeStyle = "rgba(36,28,20,0.45)";
    ctx.strokeRect(x, y, 12, 12);
    ctx.fillStyle = "#241c14";
    ctx.fillText(country.name, x + 18, y + 7);
    y += rowH;
    if (y > layout.height - layout.footerH - 8) break;
  }
  if (hidden > 0) {
    ctx.fillStyle = "#5c5146";
    ctx.fillText(`+ ${hidden} smaller`, x, y + 6);
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = "";
  let cursor = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
      if (cursor > y + lineHeight * 2) return;
    } else line = next;
  }
  if (line) ctx.fillText(line, x, cursor);
}

export function buildSvg(layout, options) {
  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`);
  parts.push(`<rect width="100%" height="100%" fill="#efe4cc"/>`);
  parts.push(`<g transform="translate(${layout.mapX.toFixed(1)} ${layout.mapY.toFixed(1)}) scale(${layout.scale.toFixed(5)})">`);
  parts.push(`<rect width="${options.mapW}" height="${options.mapH}" fill="#d7e0db"/>`);
  for (let i = 0; i < options.atoms.length; i += 1) {
    const color = options.countries.get(options.ownership[i])?.color || "#8d8376";
    const d = options.atoms[i].rings.map((ring) => `M${ring.map((point) => point.join(" ")).join("L")}Z`).join("");
    parts.push(`<path d="${d}" fill="${color}" fill-rule="evenodd"/>`);
  }
  const national = [];
  const province = [];
  for (const edge of options.edges) {
    (options.ownership[edge.a] === options.ownership[edge.b] ? province : national).push(edge.d);
  }
  parts.push(`<path d="${province.join("")}" fill="none" stroke="rgba(48,36,24,0.28)" stroke-width="${(1.1 / layout.scale).toFixed(2)}" stroke-linejoin="round"/>`);
  parts.push(`<path d="${national.join("")}" fill="none" stroke="#241c14" stroke-width="${(2.4 / layout.scale).toFixed(2)}" stroke-linejoin="round"/>`);
  parts.push(`</g>`);
  parts.push(`<text x="${layout.pad}" y="${Math.round(layout.titleH * 0.55)}" font-family="Palatino, Georgia, serif" font-size="${Math.round(layout.height * 0.034)}" fill="#241c14">${escapeXml(options.title || "Europa Canvas")}</text>`);
  parts.push(`<text x="${layout.width - layout.pad}" y="${Math.round(layout.titleH * 0.55)}" text-anchor="end" font-family="sans-serif" font-size="${Math.round(layout.height * 0.018)}" fill="#5c5146">${escapeXml(options.scenarioLabel || "")}</text>`);
  parts.push(`<text x="${layout.pad}" y="${layout.height - Math.round(layout.footerH * 0.45)}" font-family="sans-serif" font-size="${Math.round(layout.height * 0.014)}" fill="#5c5146">${escapeXml(options.attribution || "")}</text>`);
  if (options.legend) {
    const counts = countsByCountry(options.ownership);
    const rows = [...options.countries.values()].filter((country) => counts.get(country.id)).sort((a, b) => counts.get(b.id) - counts.get(a.id)).slice(0, 36);
    const x = layout.width - layout.pad - layout.legendWidth + 12;
    parts.push(`<text x="${x}" y="${layout.titleH + 18}" font-family="Palatino, Georgia, serif" font-size="16" fill="#241c14">Territories</text>`);
    rows.forEach((country, index) => {
      const y = layout.titleH + 36 + index * 18;
      parts.push(`<rect x="${x}" y="${y}" width="12" height="12" fill="${country.color}" stroke="#241c14"/>`);
      parts.push(`<text x="${x + 18}" y="${y + 11}" font-family="sans-serif" font-size="12" fill="#241c14">${escapeXml(country.name)}</text>`);
    });
  }
  parts.push(`</svg>`);
  return parts.join("");
}

export function artworkOptions(state) {
  const { provinces } = visualProvinces(state.atoms, state.ownership);
  return {
    atoms: state.atoms,
    edges: state.catalog.edges,
    ownership: state.ownership,
    countries: state.countries,
    mapW: state.catalog.w,
    mapH: state.catalog.h,
    terrain: state.catalog.terrain,
    citiesData: state.catalog.cities,
    scenarioId: state.scenarioId,
    scenarioLabel: state.scenario?.label,
    scenarioBlurb: state.scenario?.blurb,
    attribution: state.catalog.attribution,
    layers: state.layers,
    provinces,
  };
}
