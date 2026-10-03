import puppeteer from "puppeteer-core";

const base = process.env.EUROPA_URL || "http://127.0.0.1:4173";
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});

const failures = [];
function check(name, ok, detail = "") {
  console.log(`${ok ? "ok" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

async function settle(page) {
  await page.waitForFunction(() => window.__europa?.state?.catalog, { timeout: 20000 });
}

const desktop = await browser.newPage();
desktop.on("pageerror", (error) => failures.push(`pageerror ${error.message}`));
await desktop.setViewport({ width: 1280, height: 800 });
await desktop.goto(base, { waitUntil: "networkidle0" });
await settle(desktop);
check("gate visible", await desktop.$eval("#gate h2", (node) => node.textContent.includes("Europa Canvas")));
await desktop.click(".era-card");
await desktop.waitForFunction(() => window.__europa.state.loaded);
await desktop.evaluate(() => {
  [...document.querySelectorAll("button")].find((button) => button.textContent === "Start painting")?.click();
});
await desktop.click(".entry-main");
await desktop.waitForFunction(() => window.__europa.state.brushId);
const click = await desktop.evaluate(() => {
  const { state, view } = window.__europa;
  const rect = document.getElementById("map").getBoundingClientRect();
  const camera = view.camera;
  const left = camera.cx - camera.w / 2;
  const top = camera.cy - camera.h / 2;
  for (let index = 0; index < state.atoms.length; index += 1) {
    if (state.ownership[index] === state.brushId) continue;
    const atom = state.atoms[index];
    const point = atom.rings[0][Math.min(4, atom.rings[0].length - 1)];
    const x = rect.left + ((point[0] - left) / camera.w) * rect.width;
    const y = rect.top + ((point[1] - top) / camera.h) * rect.height;
    const hit = view.hitTest(x, y);
    if (hit >= 0 && state.ownership[hit] !== state.brushId && x > rect.left + rect.width * 0.42 && y > rect.top + 80 && y < rect.bottom - 70) {
      return { x, y, index: hit };
    }
  }
  return null;
});
check("found a visible province", Boolean(click));
if (click) {
  await desktop.mouse.click(click.x, click.y);
  const painted = await desktop.evaluate((index) => window.__europa.state.ownership[index] === window.__europa.state.brushId, click.index);
  check("map click paints a province", painted);
}
const stroke = await desktop.evaluate(() => {
  const { state } = window.__europa;
  const before = state.ownership.slice();
  const index = before.findIndex((id) => id !== state.brushId);
  const started = performance.now();
  window.__europa.paintProvince(index);
  const neighbor = state.atoms[index].nb?.[0];
  if (neighbor != null) window.__europa.paintProvince(neighbor);
  const elapsed = performance.now() - started;
  window.__europa.endGesture();
  return {
    changed: state.ownership[index] === state.brushId,
    elapsed,
    history: state.history.past.at(-1)?.label || "",
    restoredReady: before[index],
    now: state.ownership[index],
  };
});
check("paint changes ownership", stroke.changed, stroke.history);
check("paint gesture is quick", stroke.elapsed < 80, `${stroke.elapsed.toFixed(1)}ms`);
await desktop.click("#undo");
const undone = await desktop.evaluate(() => {
  const { state } = window.__europa;
  return state.history.past.length === 0 || state.history.future.length > 0;
});
check("undo control", undone);

const artwork = await desktop.evaluate(async () => {
  const options = window.__europa.artworkOptions(window.__europa.viewState());
  options.title = 'Tom & "Jerry"';
  options.size = "2400x1600";
  options.legend = true;
  options.cities = true;
  options.countryNames = false;
  const started = performance.now();
  const { canvas } = await window.__europa.renderArtwork(options);
  return { w: canvas.width, h: canvas.height, ms: performance.now() - started, url: canvas.toDataURL("image/jpeg", 0.72) };
});
check("png export size", artwork.w === 2400 && artwork.h === 1600, `${artwork.w}x${artwork.h} in ${artwork.ms.toFixed(0)}ms`);
const { writeFileSync } = await import("node:fs");
writeFileSync("/tmp/europa-export.jpg", Buffer.from(artwork.url.split(",")[1], "base64"));

await desktop.type("#search", "Paris");
const searchText = await desktop.$eval("#list", (node) => node.innerText);
check("search lists Paris", /Paris/i.test(searchText));
check("search keeps country tab selected", await desktop.$eval("#tab-countries", (node) => node.getAttribute("aria-selected") === "true"));
await desktop.click("#clear-search");

await desktop.click("#open-save");
check("save dialog", await desktop.$eval(".modal h3", (node) => /save/i.test(node.textContent)));
await desktop.keyboard.press("Escape");

const shot = "/tmp/europa-desktop.png";
await desktop.screenshot({ path: shot });
console.log("screenshot", shot);

const mobile = await browser.newPage();
await mobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await mobile.goto(base, { waitUntil: "networkidle0" });
await settle(mobile);
await mobile.click(".era-card");
await mobile.waitForSelector("#mobilebar", { visible: true });
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check("portrait has no horizontal overflow", overflow);
await mobile.screenshot({ path: "/tmp/europa-mobile.png" });

await mobile.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
const landscape = await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check("landscape has no horizontal overflow", landscape);
await mobile.screenshot({ path: "/tmp/europa-landscape.png" });

await browser.close();
if (failures.length) {
  console.error(failures);
  process.exit(1);
}
