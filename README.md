# Europa Canvas

A browser atlas for painting Greater Europe. Pick a starting year, choose a country, and recolor provinces. There are no armies, events, or victory conditions — the eras only set who owns what at the start.

The page is static. It runs from a local file server or from GitHub Pages.

## Play

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173`.

GitHub Pages: serve the repository root (`/` of a user site, or `/YourEurMap/` of a project site). Paths in the page are relative, so both work. After this branch is on `main`, enable Pages for the `main` branch and the `/` folder if it is not already on.

## How to paint

1. Choose 1492, 1650, 1815, 1914, 1938, or Modern — or continue the automatic save.
2. Select a country, or create one with a name and color. Painting starts immediately.
3. Click or drag across provinces. One stroke is one undo.
4. Drag to move the map, scroll or pinch to zoom. Hold Space to pan while a paint tool is active.
5. Save into one of six named slots, or export JSON. Export PNG or SVG when the picture is finished.

Right-click, or the Pick tool, takes the country under the cursor without a trip through the list. Locate moves the map and does not change the brush.

Saves stay in this browser. Export JSON to carry a map to another device. The save screen can also export or import the whole library, and a library import can be undone.

Historical ownership and the fixed province shapes are approximate. This is not an authoritative history and not a live political map.

## Checks

```bash
npm install puppeteer-core
node --test tests/*.test.mjs
# with the static server already running:
node tests/browser.mjs
```

`tests/model.test.mjs` covers one-stroke undo, interrupted-stroke rollback, land-connected painting, split ownership inside a designed province, search, rejected imports, SVG escaping, and the built atlas (Alsace in 1914, Marne remaining French, South Tyrol, Skåne, and groups that never cross an ownership change).

On this machine, headless Chrome also:

- loaded the atlas and started 1492
- painted a province with a real click, then with a two-province stroke (about 8 ms of province updates)
- undid that stroke
- searched for Paris without leaving the Countries tab
- opened the save dialog
- drew a 2400×1600 PNG in about 125 ms
- checked portrait (390×844) and landscape (844×390) for horizontal overflow

Those timings are from this environment only.

## Rebuild the atlas

The committed `data/map.json` and `data/terrain.jpg` are what the page loads. Rebuild them only when boundaries or scenarios change.

Natural Earth files are public domain. Download them into ignored folders:

```bash
mkdir -p data-src raster-src
curl -L -o data-src/ne_admin1.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
curl -L -o data-src/ne_places10.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson
curl -L -o /tmp/NE1_50M_SR_W.zip \
  https://naciscdn.org/naturalearth/50m/raster/NE1_50M_SR_W.zip
unzip -q /tmp/NE1_50M_SR_W.zip -d raster-src
python3 -m pip install --user shapely numpy pillow
python3 scripts/build_map.py
```

`scripts/build_map.py` keeps Greater Europe (Iceland through the Urals, Anatolia, and the Caucasus), drops distant islands that would empty the frame, dissolves very fine municipalities, and merges neighbors only when they share an owner in every scenario. Original region names stay searchable. Atom ids prefer Natural Earth `adm1_code` values so saves can keep a finer border if a later build merges those atoms.

## Sources

- Natural Earth 1:10m cultural vectors (admin-1), public domain — coastlines and administrative areas
- Natural Earth 1:10m populated places, public domain — cities and capitals
- Natural Earth I shaded relief, public domain — terrain, cropped and reprojected

Scenario colors and owners are original simplifications for play. See `scripts/owners.py`.

## Limits

- Province borders follow modern administrative units, so some historical frontiers (especially inside Germany) are generalized.
- The Azores, Madeira, the Canaries, and Svalbard are left out so the frame stays on the continent.
- The modern scenario is a fixed atlas, including a conventional treatment of disputed areas such as Crimea. It does not track current control.
- Connected painting follows shared land borders. It does not jump straits or sea gaps.
- Automatic saving uses this browser’s storage. A full library or a blocked store is reported in the status line, with export as the way out.
- Another open tab can pause autosave instead of overwriting newer work. That conflict path is implemented; this run did not drive two live browser profiles against each other.
- Two-finger painting rolls back the first finger. The gesture snapshot is unit-tested; this run did not use a physical phone.
