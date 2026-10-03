/** Greedy, zoom-aware label placement. Items must already be in the same space as bounds. */

export function layoutAnnotations(items, bounds, options = {}) {
  const max = options.max ?? 24;
  const gap = options.gap ?? 4;
  const placed = [];
  const sorted = items.slice().sort((a, b) => (a.rank - b.rank) || (b.priority - a.priority));
  for (const item of sorted) {
    if (placed.length >= max) break;
    const rect = {
      x: item.x - item.w / 2,
      y: item.y - item.h / 2,
      w: item.w,
      h: item.h,
    };
    if (rect.x < bounds.x || rect.y < bounds.y || rect.x + rect.w > bounds.x + bounds.w || rect.y + rect.h > bounds.y + bounds.h) {
      continue;
    }
    if ((options.obstacles || []).some((obstacle) => intersects(rect, obstacle))) continue;
    if (placed.some((other) => intersects(inflate(rect, gap), other))) continue;
    placed.push({ ...item, rect });
  }
  return placed;
}

function inflate(rect, gap) {
  return { x: rect.x - gap, y: rect.y - gap, w: rect.w + gap * 2, h: rect.h + gap * 2 };
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function textWidth(text, fontSize) {
  return Math.max(fontSize, String(text).length * fontSize * 0.62);
}
