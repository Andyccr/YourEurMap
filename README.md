# Europa Canvas / 欧罗巴画布

在浏览器里给大欧洲上色的静态沙盘。选一个年份，选一个国家，然后把省份涂成你要的样子。没有军队、外交、经济或关卡。年份只决定开局时谁拥有哪些土地。

A static browser sandbox for painting Greater Europe. Choose a year, choose a country, and recolor provinces. There are no armies, diplomacy, economy, or goals. A year only decides who owns the land at the start.

在线游玩 / Play online: <https://andyccr.com/YourEurMap/>

`https://andyccr.github.io/YourEurMap/` 会跳到这个地址。网站从仓库 `main` 分支的根目录发布，不需要另外打包。

`https://andyccr.github.io/YourEurMap/` redirects there. The site is the root of the `main` branch. There is no separate build.

不要双击 `index.html`。浏览器会拦截本地文件里的模块和地图数据。用上面的网页，或按下面的方式在本机起一个静态服务器。

Do not open `index.html` by double-click. Browsers block modules and map data from a `file://` page. Use the site above, or start a static server as described below.

---

## 中文

### 这是什么

Europa Canvas 是一张可以涂改的大欧洲地图。范围大约是冰岛到乌拉尔、安纳托利亚和高加索。地图用真实海岸线和行政区切成大约 500 个便于点选的省份，而不是把每个现代乡镇都单独摆出来。

六个开局：

| 年份 | 画面上的意思 |
| --- | --- |
| 1492 | 大航海前夕的王冠和城邦 |
| 1650 | 威斯特伐利亚之后，含瑞典波罗的海和奥斯曼治下的匈牙利 |
| 1815 | 维也纳会议后的君主国 |
| 1914 | 大战前夕的民族国家 |
| 1938 | 德奥合并和苏台德之后的战间期 |
| Modern | 一幅固定的近期地图，不是实时政治边界 |

历史归属和省界都是近似的，方便游玩，不是学术复原，也不能当作今天谁控制哪里的依据。

### 在 GitHub Pages 上玩

仓库已经按静态网站准备好，不需要安装、打包或账号。

1. 打开 <https://andyccr.com/YourEurMap/>。
2. 等地图出现。第一次打开要下载约 1.5 MB 的省界和约 600 KB 的地形，之后浏览器会缓存。
3. 选一个年份，或在这台浏览器里已有存档时点继续。
4. 点一个国家，或新建一个国家。选中后立刻可以涂色。

这个地址是项目站点，游戏在 `/YourEurMap/` 下面，不在域名根目录。页面里的脚本、样式、字体、省界和地形都用相对地址，所以子目录可以正常打开。仓库根目录有一个空的 `.nojekyll`，用来告诉 GitHub 不要用 Jekyll 处理这些文件，否则地图数据可能不会被原样发布。

发布设置是 `main` 分支、文件夹 `/ (root)`。把更新合并进 `main` 之后，Pages 会在一两分钟内换成新文件。请保留根目录的 `.nojekyll`，避免 Jekyll 漏掉 `data/` 里的地图。

如果页面一直停在加载，或提示地图没有载入：刷新一次；确认地址以 `/YourEurMap/` 结尾；换一个没有拦截脚本的浏览器。本地存档不会因为地图文件加载失败而被删掉。

### 在自己的电脑上玩

需要 Python 3，不需要安装游戏依赖。

```bash
git clone https://github.com/Andyccr/YourEurMap.git
cd YourEurMap
python3 -m http.server 4173
```

浏览器打开 <http://127.0.0.1:4173>。

如果把仓库放在别的目录名下面，例如 `http://127.0.0.1:8080/YourEurMap/`，同样可以直接玩。服务器必须把目录末尾的斜线处理好；Python 自带的 `http.server` 会做这件事。

### 桌面怎么操作

1. 选年份，或继续已有地图。
2. 在左侧列表点一个国家，或点「Create a country」填写名字和颜色。
3. 在地图上点击一个省，或按住拖过一片省。松手后，这一笔才记入撤销。双击，或按住 Shift 再点，会把陆地相连的一整片同色区域一次涂满。
4. 涂错了就撤销。也可以点提示里的 Undo。
5. 满意后打开 Save，写入六个槽位中的一个，或导出图片。

工具：

| 操作 | 作用 |
| --- | --- |
| Move，`V` | 拖动地图 |
| Paint，`B` | 用当前国家涂色 |
| Pick，`I` | 吸取光标下的国家，并开始用它涂色 |
| 右键 | 同样是吸取国家 |
| 按住空格 | 暂时改成拖动，松开后回到原来的工具 |
| `W` | 换回上一个国家 |
| `F` | 把地图移到当前国家，不改变画笔 |
| `/` | 打开搜索并聚焦 |
| `Ctrl` 或 `Cmd` + `Z` | 撤销 |
| `Ctrl` 或 `Cmd` + `Shift` + `Z` | 重做 |
| `Ctrl` 或 `Cmd` + `S` | 打开存档 |
| `Esc` | 关掉当前弹窗、手机上的列表，或省份详情 |

在输入框里打字，或有对话框打开时，这些快捷键不会抢走输入。正在输入时按空格仍然是空格，不会拖动地图。

搜索可以找国家、省份、首都、城市，以及被合并掉的原始地区名。点国家会把它设成画笔。点「Locate」或搜索结果里的省份、城市，只移动地图。清空搜索会回到你原来选的「Countries / Provinces」标签，不会偷偷改标签。

省份详情里可以看到：省份名、原始地名、当前主人、行政中心或大约的游戏中心、是否由多块原区合并。可以把它涂成当前国家、吸取它的主人、涂满陆地相连的同色区域，或在确认后把该主人的全部土地转给当前画笔。已经属于当前国家时，重复的按钮会停用。

相连涂色只沿共同的陆地边界走，不会跨过海峡或海洋。

### 手机怎么操作

手机不是把桌面缩小。底部有 Move、Paint、Pick、Countries、Save。当前国家一直显示在工具栏上方。国家列表从底部抽屉打开，有关闭按钮，点外面的暗处也会关掉。缩放按钮在地图一角。竖屏和横屏都可以用，页面本身不横向滚动。

一根手指按当前工具涂色或拖动。两根手指则拖动和缩放；第二根手指按下时，第一根手指已经涂上、但还没松手的那一笔会撤回，避免误涂。手指被系统打断、指针丢失或离开页面时，未完成的一笔也不会留下半截。旋转屏幕会保持原来的地理中心和缩放比例。

### 存档

所有存档都在这台浏览器的本地存储里，换电脑、换浏览器或清站点数据都会消失。要带走作品，用 JSON 导出。

- 涂色停下大约不到一秒后会自动保存。手指还按着的时候不会把半笔写进去。
- 自动保存旁边保留上一份成功的副本。
- 新开一局或读入另一张图之前，会先把当前图放进恢复副本。
- Save 里有六个槽位。覆盖已有槽位前会再问一次。
- 可以导出、导入单张地图，也可以导出、导入整个存档库。导入整个库之前会留下上一份库，存档界面里可以撤销这次替换。
- 导入会先检查，不合法就不改当前地图。不支持的版本、坏掉的国家、指向不存在的省份、过大的文件都会被拒绝。
- 如果整库读不出来，会尽量留下原始文本，并尝试上一份完好的检查点。
- 存储满了或浏览器禁止写入时，状态栏会说明，并仍然可以导出 JSON。
- 另一个标签页写了更新的进度时，这一页会暂停自动覆盖。你可以导出本页、载入最新的，或明确选择留下本页。不会悄悄用旧标签覆盖新进度。

### 导出图片

Save 旁边的菜单可以导出 PNG 或 SVG。可选 2400×1600 或 3600×2400，可以写标题，并选择国家名、主要城市和图例。年份和地理数据出处总会印在图上。导出用的是整张地图自己的标注，不是你当前屏幕上刚好看见的那几个名字。

SVG 里的标题和国名会转义，避免名字里的符号把文件弄坏。地形若无法嵌进图片，导出会改成干净的设色图，游戏本身仍然可用。

### 地图是怎么来的

玩家不需要做这一步。仓库里的 `data/map.json` 和 `data/terrain.jpg` 就是网页要读的文件。

数据来自公有领域的 Natural Earth：

- 1:1000 万行政区，提供海岸线和地区形状
- 1:1000 万居民点，提供城市和首都
- Natural Earth I 晕渲，裁切后投到欧洲，作为淡地形

只有在六个开局里主人都相同、并且彼此接壤的小区，才会并成一个游戏省。这样合并不会抹掉某一年的国界。原来的地区名仍可搜索。存档按这些原始小块记录归属；如果以后的版本把两块再并在一起，旧存档里不同的归属仍然可以分开显示。

每个省在详情里都有名字，以及一个行政中心或大约的游戏中心。行政中心来自数据里的首都或首府；对不上时会标明是大约位置。地图上不会同时标出每一个中心。

亚速尔、马德拉、加那利群岛和斯瓦尔巴没有放进画面，否则地图会被大片海洋拉开。德国内部很多历史边界被现代的州界简化了。现代图对有争议的地方采用固定画法，例如克里米亚按乌克兰的常规地图册画法，不表示实时控制。

重新生成地图时，先准备被 git 忽略的源文件，再运行脚本。需要 Python 3，以及 `shapely`、`numpy`、`pillow`。

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

归属规则写在 `scripts/owners.py`，几何和合并写在 `scripts/build_map.py`。

### 文件

| 路径 | 作用 |
| --- | --- |
| `index.html` | 页面 |
| `css/app.css` | 桌面和手机样式 |
| `js/main.js` | 操作、界面和流程 |
| `js/model.js` | 涂色、撤销、搜索、存档校验 |
| `js/render.js` | 地图绘制 |
| `js/storage.js` | 浏览器存档和多标签 |
| `js/export-map.js` | PNG 和 SVG |
| `data/map.json` | 省份、邻接、开局归属 |
| `data/terrain.jpg` | 地形 |
| `.nojekyll` | 让 GitHub Pages 按原文件发布 |

### 检查

逻辑测试不需要浏览器：

```bash
node --test tests/model.test.mjs
```

它检查一笔涂色的撤销、中断后回滚、只沿陆地相连、旧存档拆开合并省、搜索、拒绝坏档、SVG 转义，以及成品地图里的几个历史边界。

浏览器检查需要先开着上面的静态服务器，并安装 `puppeteer-core`：

```bash
npm install puppeteer-core
node tests/browser.mjs
```

### 限制

- 省界是现代行政区，不是当年的条约线。
- 存档不能跨设备，除非你自己导出 JSON。
- 这一版在开发机的无头 Chrome 里看过桌面、竖屏和横屏。没有在真机上逐款验收，也不把某一次测到的耗时写成所有设备的帧率。

---

## English

### What this is

Europa Canvas is a paintable map of Greater Europe, from Iceland to the Urals, including Anatolia and the Caucasus. Real coastlines and administrative areas are grouped into about 500 provinces that are practical to select. Every modern municipality is not its own piece.

The six starts:

| Year | What the map shows |
| --- | --- |
| 1492 | Crowns and city-states on the eve of the ocean |
| 1650 | After Westphalia, including a Swedish Baltic and Ottoman Hungary |
| 1815 | The monarchies of the Vienna settlement |
| 1914 | Nation-states in the last summer before the Great War |
| 1938 | The late interwar map, after Anschluss and the Sudetenland |
| Modern | A fixed recent atlas, not a live political feed |

Ownership and province shapes are approximate. They are for play. They are not a scholarly reconstruction, and they are not a source for who controls what today.

### Play on GitHub Pages

The repository is the website. Nothing has to be installed, built, or signed in to play.

1. Open <https://andyccr.com/YourEurMap/>.
2. Wait for the map. The first visit downloads about 1.5 MB of provinces and about 600 KB of terrain. The browser can cache them after that.
3. Choose a year, or continue a map already stored in this browser.
4. Choose a country, or create one. Painting starts as soon as the country is selected.

The address is a project site. The game lives under `/YourEurMap/`, not at the bare domain root. Scripts, styles, fonts, provinces, and terrain use relative URLs, so that folder works. An empty `.nojekyll` file in the repository root tells GitHub Pages to publish the files as they are. Without it, Jekyll can drop or rewrite the map data.

The Pages source is the `main` branch and the `/ (root)` folder. After a change is merged into `main`, Pages picks it up within a minute or two. Keep the root `.nojekyll` file so Jekyll does not skip the map in `data/`.

If the page stays on the loading gate, refresh once, make sure the address ends in `/YourEurMap/`, and try a browser that is not blocking scripts. A failed map download does not delete saves already stored in the browser.

### Play on your own computer

Python 3 is enough. The game has no install step.

```bash
git clone https://github.com/Andyccr/YourEurMap.git
cd YourEurMap
python3 -m http.server 4173
```

Open <http://127.0.0.1:4173>.

A copy served from a subfolder, such as `http://127.0.0.1:8080/YourEurMap/`, also works. The server should redirect a directory URL so that it ends with a slash. Python’s `http.server` does that.

### Desktop

1. Choose a year, or continue an existing map.
2. Pick a country in the list, or choose Create a country and set a name and color.
3. Click a province, or drag across several. The stroke becomes one undo when you release. Double-click, or Shift-click, fills the whole land-connected region of one color.
4. Undo a mistake, including from the toast.
5. Open Save, keep a named slot, or export a picture.

| Action | Effect |
| --- | --- |
| Move, `V` | Drag the map |
| Paint, `B` | Paint with the current country |
| Pick, `I` | Take the country under the cursor and paint with it |
| Right-click | Pick, same as the Pick tool |
| Hold Space | Pan until the key is released |
| `W` | Switch back to the previous country |
| `F` | Frame the current country without changing the brush |
| `/` | Open search and focus it |
| `Ctrl` or `Cmd` + `Z` | Undo |
| `Ctrl` or `Cmd` + `Shift` + `Z` | Redo |
| `Ctrl` or `Cmd` + `S` | Open saves |
| `Esc` | Close the dialog, the phone list, or the province card |

Shortcuts stay out of the way while you type, and while a dialog is open. Space types a space in a text field instead of panning.

Search finds countries, provinces, capitals, cities, and the original names of regions that were merged. Choosing a country makes it the brush. Locate, and the province or city results, only move the map. Clearing the query returns to the Countries or Provinces tab you had open.

A province card shows its name, the original geographic name, the owner, an administrative capital or an approximate game center, and whether several source regions were combined. From there you can paint it with the current country, pick its owner, paint the land-connected region of that owner, or transfer that owner’s entire territory after a confirmation. Actions that would change nothing are disabled.

Connected painting follows shared land borders. It does not cross a strait or a sea.

### Phone

The phone layout is not a shrunk desktop. Move, Paint, Pick, Countries, and Save stay on a bottom bar. The current country stays visible above that bar. The country list is a bottom drawer with a close button and a dimmed backdrop. Zoom controls sit on the map. Portrait and landscape both fit, and the page does not scroll sideways.

One finger follows the current tool. Two fingers pan and zoom. When the second finger lands, paint from the first finger that has not been released is rolled back. A cancelled touch, a lost pointer, or leaving the page does not keep a half-finished stroke. Rotating the phone keeps the same geographic center and zoom.

### Saves

Saves live in this browser only. Another computer, another browser, or clearing site data removes them. Export JSON if you want a copy you can carry.

- The map is written automatically shortly after a stroke ends. An unfinished stroke is not written.
- The previous successful autosave is kept beside the current one.
- Starting a new scenario or loading another map first stores a recovery copy.
- Save offers six slots and asks before overwriting one.
- You can export and import one map, or the whole library. Importing a library keeps the previous library so the replacement can be undone from the save screen.
- An import is checked before it touches the current map. Unsupported versions, broken countries, unknown provinces, and oversized files are rejected.
- If the stored library cannot be read, the raw text is kept when possible and the last good checkpoint is tried.
- If storage is full or the browser refuses to write, the status line says so and export still works.
- If another tab has saved newer work, this tab stops overwriting it. You can export this tab, load the latest library, or explicitly keep this tab. An older tab does not silently replace newer progress.

### Picture export

The menu can export PNG or SVG at 2400×1600 or 3600×2400. You can set a title and choose country names, major cities, and a legend. The year and the geographic attribution are always printed. Labels are laid out for the whole map, not copied from whatever the camera happens to show.

Names in the SVG are escaped, so a title with symbols does not break the file. If the terrain image cannot be embedded, the export falls back to a clean political map. The game itself still runs.

### Where the map comes from

Players do not need this step. `data/map.json` and `data/terrain.jpg` are the files the page loads.

The sources are public-domain Natural Earth data:

- 1:10 million administrative areas, for coastlines and regions
- 1:10 million populated places, for cities and capitals
- Natural Earth I shaded relief, cropped and reprojected onto Europe

Small neighboring areas are merged only when they share an owner in every scenario and actually touch on land. A merge does not erase a border that matters in one of the years. The original region names stay searchable. Saves store ownership on those source pieces. If a later version merges two pieces, an old save that gave them different owners can still show the split.

Every province has a name in its card, plus either an administrative capital or an approximate game center. Capitals come from the place data. When the point is only a stand-in, the card says so. The map does not label every center at once.

The Azores, Madeira, the Canaries, and Svalbard are left out so the Atlantic does not shrink the continent. Many historical borders inside Germany are simplified to modern states. The modern scenario uses a fixed atlas convention for disputed places, including Crimea drawn with Ukraine. That is not a live report of control.

To rebuild the data, download the ignored source files and run the script. You need Python 3 plus `shapely`, `numpy`, and `pillow`.

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

Ownership rules are in `scripts/owners.py`. Geometry and merging are in `scripts/build_map.py`.

### Files

| Path | Role |
| --- | --- |
| `index.html` | Page |
| `css/app.css` | Desktop and phone layout |
| `js/main.js` | Input, interface, and flow |
| `js/model.js` | Painting, undo, search, and save checks |
| `js/render.js` | Map drawing |
| `js/storage.js` | Browser saves and multiple tabs |
| `js/export-map.js` | PNG and SVG |
| `data/map.json` | Provinces, neighbors, and starting owners |
| `data/terrain.jpg` | Terrain |
| `.nojekyll` | Publish GitHub Pages without Jekyll |

### Checks

Logic tests do not need a browser:

```bash
node --test tests/model.test.mjs
```

They cover one-stroke undo, rollback of an interrupted stroke, land-only connections, an old save splitting a merged province, search, rejected imports, SVG escaping, and a few historical borders in the shipped atlas.

The browser check needs the static server above and `puppeteer-core`:

```bash
npm install puppeteer-core
node tests/browser.mjs
```

### Limits

- Province borders are modern administrative units, not the treaty lines of each year.
- Saves do not travel with you unless you export JSON.
- Desktop, portrait, and landscape were exercised in headless Chrome on the machine that built this page. That is not a pass across physical phones, and one measured timing is not a frame rate for every device.
