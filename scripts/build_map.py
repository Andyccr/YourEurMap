#!/usr/bin/env python3
"""Build the Greater Europe game map used by Europa Canvas.

Reads Natural Earth cultural vectors and shaded relief from /tmp/europadata
(see README for download steps and licenses) and writes:

  data/map.json
  data/terrain.jpg
  data/build-report.json

The script is deterministic aside from filesystem paths. Game atom ids prefer
Natural Earth adm1_code values so saves stay stable across rebuilds.
"""

from __future__ import annotations

import json
import math
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance
from shapely import make_valid
from shapely.geometry import GeometryCollection, MultiPolygon, Point, Polygon, mapping, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from owners import (  # noqa: E402
    COUNTRIES,
    SCENARIOS,
    YEARS,
    cluster_for,
    english_name,
    friendly_cluster,
    norm,
    owners_for,
)

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(__import__("os").environ.get("EUROPA_DATA", str(ROOT / "data-src")))
SRC_ADMIN = DATA_DIR / "ne_admin1.geojson"
SRC_PLACES = DATA_DIR / "ne_places10.geojson"
if not SRC_PLACES.exists():
    SRC_PLACES = DATA_DIR / "ne_places.geojson"
SRC_TIF = Path(
    __import__("os").environ.get(
        "EUROPA_RELIEF",
        str(ROOT / "raster-src" / "NE1_50M_SR_W" / "NE1_50M_SR_W.tif"),
    )
)
OUT_JSON = ROOT / "data" / "map.json"
OUT_TERRAIN = ROOT / "data" / "terrain.jpg"
OUT_REPORT = ROOT / "data" / "build-report.json"

# Lambert conformal conic, sphere, centered on Europe.
PHI1 = math.radians(42.0)
PHI2 = math.radians(62.0)
PHI0 = math.radians(52.0)
LAM0 = math.radians(15.0)
EARTH_R = 6_371_000.0

MAP_W = 2400
PAD = 48

ALLOW_ISO = {
    "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CY", "CZ", "DK", "EE",
    "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "XK", "LV", "LI", "LT",
    "LU", "MT", "MD", "MC", "ME", "NL", "MK", "NO", "PL", "PT", "RO", "RU",
    "SM", "RS", "SK", "SI", "ES", "SE", "CH", "TR", "UA", "GB", "VA", "AM",
    "AZ", "GE", "IE", "FO", "GI", "IM", "JE", "GG", "UA",
}
ALLOW_ADMIN = {
    "Albania", "Andorra", "Austria", "Belarus", "Belgium",
    "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Cyprus", "Czech Republic",
    "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary",
    "Iceland", "Ireland", "Italy", "Kosovo", "Latvia", "Liechtenstein",
    "Lithuania", "Luxembourg", "Malta", "Moldova", "Monaco", "Montenegro",
    "Netherlands", "Macedonia", "North Macedonia", "Norway", "Poland",
    "Portugal", "Romania", "Russia", "San Marino", "Republic of Serbia",
    "Serbia", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland",
    "Turkey", "Ukraine", "United Kingdom", "Vatican", "Armenia", "Azerbaijan",
    "Georgia", "Faroe Islands", "Gibraltar", "Isle of Man", "Jersey",
    "Guernsey", "Northern Cyprus",
}
EXCLUDE_NAME_BITS = (
    "svalbard", "bouvet", "guyane", "guadeloupe", "martinique", "mayotte",
    "reunion", "réunion", "azores", "madeira", "saba", "eustatius",
    "greenland", "novaya", "franz josef", "canary", "tenerife", "las palmas",
)

DISSOLVE_ADMINS = {"United Kingdom", "Latvia", "Azerbaijan", "Kosovo"}

ABSORB_MAX = 14_000
RESULT_MAX = 36_000
CROSS_CLUSTER_MAX = 450

SEAS = [
    ("Atlantic Ocean", -14.0, 50.0),
    ("North Sea", 3.0, 56.5),
    ("Norwegian Sea", 2.0, 66.0),
    ("Baltic Sea", 19.0, 58.0),
    ("Gulf of Bothnia", 20.5, 62.5),
    ("English Channel", -1.5, 50.0),
    ("Bay of Biscay", -5.0, 45.2),
    ("Mediterranean Sea", 16.0, 37.2),
    ("Tyrrhenian Sea", 11.5, 40.0),
    ("Adriatic Sea", 16.2, 42.6),
    ("Ionian Sea", 18.8, 37.8),
    ("Aegean Sea", 25.2, 38.2),
    ("Black Sea", 33.5, 43.4),
    ("Sea of Azov", 36.4, 46.0),
    ("Barents Sea", 37.0, 70.0),
]


def log(message: str) -> None:
    print(message, flush=True)


def area_km2(geom) -> float:
    if geom is None or geom.is_empty:
        return 0.0
    centroid = geom.centroid
    lat = centroid.y if not centroid.is_empty else 50.0
    scale_x = 111.32 * math.cos(math.radians(lat))
    scale_y = 110.54

    def _xy(x, y, z=None):
        return (x * scale_x, y * scale_y)

    try:
        return abs(transform(_xy, geom).area)
    except Exception:
        return 0.0


def as_polygonal(geom):
    if geom is None or geom.is_empty:
        return None
    geom = make_valid(geom)
    if isinstance(geom, GeometryCollection) or geom.geom_type == "GeometryCollection":
        parts = [g for g in geom.geoms if g.geom_type in {"Polygon", "MultiPolygon"}]
        if not parts:
            return None
        geom = unary_union(parts)
        geom = make_valid(geom)
    if geom.geom_type not in {"Polygon", "MultiPolygon"} or geom.is_empty:
        return None
    return geom


def drop_slivers(geom, minimum=15.0):
    geom = as_polygonal(geom)
    if geom is None:
        return None
    if geom.geom_type == "Polygon":
        return geom if area_km2(geom) >= minimum else geom
    kept = [part for part in geom.geoms if area_km2(part) >= minimum]
    if not kept:
        kept = [max(geom.geoms, key=area_km2)]
    if len(kept) == 1:
        return kept[0]
    return unary_union(kept)


def lcc_constants():
    if abs(PHI1 - PHI2) < 1e-9:
        n = math.sin(PHI1)
    else:
        n = (
            math.log(math.cos(PHI1) / math.cos(PHI2))
            / math.log(
                math.tan(math.pi / 4 + PHI2 / 2)
                / math.tan(math.pi / 4 + PHI1 / 2)
            )
        )
    f = (math.cos(PHI1) * (math.tan(math.pi / 4 + PHI1 / 2) ** n)) / n
    rho0 = EARTH_R * f / (math.tan(math.pi / 4 + PHI0 / 2) ** n)
    return n, f, rho0


N_LCC, F_LCC, RHO0 = lcc_constants()


def forward_lcc(lon, lat):
    lam = math.radians(lon)
    phi = math.radians(lat)
    rho = EARTH_R * F_LCC / (math.tan(math.pi / 4 + phi / 2) ** N_LCC)
    theta = N_LCC * (lam - LAM0)
    x = rho * math.sin(theta)
    y = RHO0 - rho * math.cos(theta)
    return x, y


def inverse_lcc(x, y):
    """Inverse LCC. Accepts scalars or numpy arrays."""
    dy = RHO0 - y
    if isinstance(x, np.ndarray) or isinstance(y, np.ndarray):
        rho = np.copysign(np.hypot(x, dy), N_LCC)
        theta = np.arctan2(x, dy)
        lam = LAM0 + theta / N_LCC
        phi = 2 * np.arctan((EARTH_R * F_LCC / np.maximum(rho, 1e-6)) ** (1 / N_LCC)) - math.pi / 2
        return np.degrees(lam), np.degrees(phi)
    rho = math.copysign(math.hypot(x, dy), N_LCC)
    theta = math.atan2(x, dy)
    lam = LAM0 + theta / N_LCC
    phi = 2 * math.atan((EARTH_R * F_LCC / rho) ** (1 / N_LCC)) - math.pi / 2
    return math.degrees(lam), math.degrees(phi)


def excluded(props, geom) -> bool:
    name = norm(props.get("name"))
    admin = props.get("admin") or ""
    iso = props.get("iso_a2") or ""
    if any(bit in name for bit in EXCLUDE_NAME_BITS):
        return True
    if admin in {"Greenland", "Cayman Islands", "Montserrat"}:
        return True
    point = geom.representative_point()
    lon, lat = point.x, point.y
    if not (-26 <= lon <= 61 and 34.2 <= lat <= 71.6):
        return True
    if admin == "Russia" or iso == "RU":
        if lon > 60 or lat < 41.0:
            return True
    if iso == "KZ" or admin == "Kazakhstan":
        return True
    if iso not in ALLOW_ISO and admin not in ALLOW_ADMIN:
        return True
    return False


def source_id(props, fallback: str) -> str:
    code = props.get("adm1_code")
    if code and code != "-99":
        return str(code)
    if props.get("ne_id"):
        return f"NE-{props['ne_id']}"
    return fallback


def iter_polygons(geom):
    geom = as_polygonal(geom)
    if geom is None:
        return
    if geom.geom_type == "Polygon":
        yield geom
    else:
        for part in geom.geoms:
            if part.geom_type == "Polygon" and not part.is_empty:
                yield part


def load_admin_features():
    log("Loading admin-1…")
    data = json.loads(SRC_ADMIN.read_text())
    grouped = defaultdict(list)
    seen = set()
    for feature in data["features"]:
        props = feature["properties"]
        try:
            geom = shape(feature["geometry"])
        except Exception:
            continue
        geom = as_polygonal(geom)
        if geom is None:
            continue
        if excluded(props, geom):
            continue
        code = props.get("adm1_code")
        if code and code in seen:
            continue
        if code:
            seen.add(code)
        grouped[props.get("admin") or "Unknown"].append((props, geom))
    log(f"  countries in frame: {len(grouped)}")
    return grouped


def choose_layer(admin, feats):
    if len(feats) < 2:
        return feats
    types = defaultdict(list)
    for props, geom in feats:
        types[props.get("type_en") or props.get("type") or "Unknown"].append((props, geom))
    if len(types) < 2:
        return feats
    try:
        union = unary_union([geom for _, geom in feats])
        union_area = max(area_km2(union), 1.0)
    except Exception:
        return feats
    full = []
    for label, items in types.items():
        covered = sum(area_km2(geom) for _, geom in items)
        if covered > 0.72 * union_area:
            full.append((label, len(items), items))
    if len(full) < 2:
        return feats

    def score(item):
        _label, count, _items = item
        if 8 <= count <= 40:
            return (0, abs(count - 16))
        if count < 8:
            return (1, 8 - count)
        return (2, count)

    full.sort(key=score)
    chosen = full[0]
    log(f"  {admin}: overlapping layers, using {chosen[0]!r} ({chosen[1]})")
    return chosen[2]


def dissolve_regions(admin, feats):
    buckets = defaultdict(list)
    for props, geom in feats:
        region = props.get("region") or props.get("name") or admin
        buckets[region].append((props, geom))
    dissolved = []
    for region, items in buckets.items():
        geom = as_polygonal(unary_union([geom for _, geom in items]))
        if geom is None:
            continue
        base = dict(items[0][0])
        base["name"] = region
        base["region"] = region
        base["_sources"] = [
            {"id": source_id(props, f"{admin}-{index}"), "name": props.get("name") or region}
            for index, (props, _geom) in enumerate(items)
        ]
        base["_dissolved"] = True
        slug = norm(region).replace(" ", "-")
        iso = base.get("iso_a2") or admin[:2].upper()
        base["adm1_code"] = f"{iso}-r-{slug}"
        dissolved.append((base, geom))
    log(f"  dissolved {admin}: {len(feats)} → {len(dissolved)}")
    return dissolved


def clip_cyprus(grouped):
    north_parts = [geom for _props, geom in grouped.get("Northern Cyprus", [])]
    if not north_parts or "Cyprus" not in grouped:
        return
    north = unary_union(north_parts)
    clipped = []
    for props, geom in grouped["Cyprus"]:
        try:
            northern = as_polygonal(geom.intersection(north))
            southern = as_polygonal(geom.difference(north))
        except Exception:
            clipped.append((props, geom))
            continue
        pieces = [("south", southern), ("north", northern)]
        kept = []
        for side, piece in pieces:
            if piece is None:
                continue
            if area_km2(piece) < 80:
                continue
            copy = dict(props)
            copy["_side"] = side
            copy["adm1_code"] = f"{props.get('adm1_code')}-{side[0]}"
            copy["_sources"] = [{"id": props.get("adm1_code"), "name": props.get("name") or "Cyprus"}]
            kept.append((copy, piece))
        if not kept:
            clipped.append((props, geom))
        else:
            clipped.extend(kept)
    grouped["Cyprus"] = clipped
    grouped.pop("Northern Cyprus", None)
    log(f"  Cyprus clipped into {len(clipped)} pieces")


def absorb_enclaves(atoms):
    """Fold tiny same-owner enclaves and hole-fillers into their host atom."""
    atoms.sort(key=lambda atom: atom["area"])
    removed = set()
    for index, small in enumerate(atoms):
        if small["area"] >= 700 or small["pin"]:
            continue
        point = small["geom"].representative_point()
        host = None
        host_score = 0.0
        for other in atoms:
            if other is small or other["id"] in removed:
                continue
            if other["owners"] != small["owners"]:
                continue
            if other["area"] < small["area"] * 2:
                continue
            try:
                if other["geom"].buffer(0.08).contains(point):
                    overlap = other["geom"].intersection(small["geom"]).area
                    score = overlap + (10 if other["geom"].envelope.contains(point) else 0)
                    if score >= host_score:
                        host = other
                        host_score = score
            except Exception:
                continue
        if host is None:
            continue
        try:
            host["geom"] = as_polygonal(unary_union([host["geom"], small["geom"]]))
        except Exception:
            continue
        if host["geom"] is None:
            continue
        host["area"] = area_km2(host["geom"])
        host["aka"].append(small["name"])
        host["sources"].extend(small["sources"])
        removed.add(small["id"])
    kept = [atom for atom in atoms if atom["id"] not in removed]
    log(f"  absorbed enclaves: {len(removed)}")
    return kept


def build_atoms(grouped):
    atoms = []
    for admin, feats in grouped.items():
        feats = choose_layer(admin, feats)
        if admin in DISSOLVE_ADMINS:
            feats = dissolve_regions(admin, feats)
        for props, geom in feats:
            geom = drop_slivers(geom)
            geom = as_polygonal(geom)
            if geom is None:
                continue
            owners = owners_for(props)
            for owner in owners:
                if owner not in COUNTRIES:
                    raise SystemExit(f"Unknown polity {owner} for {admin} / {props.get('name')}")
            area = area_km2(geom)
            if area < 20:
                continue
            name = props.get("name") or admin
            local = props.get("name_local") or name
            display = english_name(name, cluster=props.get("region"))
            sources = props.get("_sources") or [
                {"id": source_id(props, name), "name": name}
            ]
            atom_id = source_id(props, f"{admin}-{norm(name)}")
            cluster = cluster_for(props)
            pin = bool(props.get("_dissolved")) or norm(name) in {
                "berlin", "bremen", "hamburg", "wien", "prague", "brussels",
                "luxembourg", "andorra", "monaco", "san marino", "vatican",
                "gibraltar", "malta", "liechtenstein", "ceuta", "melilla",
            }
            atoms.append({
                "id": atom_id,
                "admin": admin,
                "name": name,
                "display": display,
                "local": local or name,
                "owners": owners,
                "cluster": cluster,
                "geom": geom,
                "area": area,
                "pin": pin,
                "aka": [item["name"] for item in sources if item.get("name") and item["name"] != name],
                "sources": sources,
                "iso": props.get("iso_a2") or "",
            })
    # Unique ids
    seen = {}
    for atom in atoms:
        base = atom["id"]
        if base not in seen:
            seen[base] = 1
            continue
        seen[base] += 1
        atom["id"] = f"{base}-{seen[base]}"
    log(f"Atoms before enclave absorb: {len(atoms)}")
    atoms = absorb_enclaves(atoms)
    return atoms


def merge_groups(atoms):
    parent = list(range(len(atoms)))

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    geoms = [atom["geom"] for atom in atoms]
    tree = STRtree(geoms)
    neighbors = [set() for _ in atoms]
    log("Finding shared land borders…")
    started = time.time()
    for index, geom in enumerate(geoms):
        for other in tree.query(geom):
            other = int(other)
            if other <= index:
                continue
            try:
                shared = geom.boundary.intersection(geoms[other].boundary)
            except Exception:
                continue
            if shared.is_empty or shared.length < 0.012:
                continue
            neighbors[index].add(other)
            neighbors[other].add(index)
    log(f"  borders in {time.time() - started:.1f}s")

    area = [atom["area"] for atom in atoms]
    owners = [atom["owners"] for atom in atoms]
    cluster = [atom["cluster"] for atom in atoms]
    pin = [atom["pin"] for atom in atoms]

    def root_area(index):
        return area[find(index)]

    changed = True
    passes = 0
    while changed and passes < 12:
        changed = False
        passes += 1
        order = sorted(range(len(atoms)), key=root_area)
        for index in order:
            root = find(index)
            if pin[root] or area[root] >= ABSORB_MAX:
                continue
            candidates = []
            # Neighbors of every member currently in the root.
            member_neighbors = set()
            for member in range(len(atoms)):
                if find(member) == root:
                    member_neighbors.update(neighbors[member])
            for nb in member_neighbors:
                other = find(nb)
                if other == root or pin[root]:
                    continue
                if owners[other] != owners[root]:
                    continue
                if area[root] + area[other] > RESULT_MAX:
                    continue
                same_cluster = cluster[other] == cluster[root]
                if not same_cluster and area[root] >= CROSS_CLUSTER_MAX:
                    continue
                if pin[other] and not same_cluster and area[root] >= CROSS_CLUSTER_MAX:
                    continue
                candidates.append((0 if same_cluster else 1, area[other], other))
            if not candidates:
                continue
            candidates.sort()
            target = candidates[0][2]
            # Absorb root into target.
            area[target] = area[target] + area[root]
            parent[root] = target
            changed = True
    groups = defaultdict(list)
    for index in range(len(atoms)):
        groups[find(index)].append(index)
    log(f"Gameplay groups: {len(groups)} from {len(atoms)} atoms in {passes} passes")
    return groups, neighbors


def friendly_group_name(members, cluster_counts):
    if len(members) == 1:
        return members[0]["display"], members[0]["local"]
    clusters = {atom["cluster"] for atom in members}
    largest = max(members, key=lambda atom: atom["area"])
    if len(clusters) == 1:
        cluster = next(iter(clusters))
        complete = len(members) == cluster_counts.get(cluster, 0)
        label = friendly_cluster(cluster)
        if label and complete:
            return label, largest["local"]
        if complete and "|" not in cluster and len(members) >= 3:
            return cluster, largest["local"]
    member_names = {norm(atom["name"]) for atom in members}
    if member_names == {"bas-rhin", "haut-rhin"}:
        return "Alsace", largest["local"]
    if member_names == {"savoie", "haute-savoie"}:
        return "Savoy", largest["local"]
    if member_names == {"corse-du-sud", "haute-corse"}:
        return "Corsica", largest["local"]
    if member_names == {"bozen"}:
        return "South Tyrol", largest["local"]
    if len(members) <= 3:
        bits = [atom["display"] for atom in sorted(members, key=lambda atom: -atom["area"])]
        joined = "–".join(bits)
        if len(joined) <= 46:
            return joined, largest["local"]
    return largest["display"], largest["local"]


def project_factory(min_x, max_x, min_y, max_y, width, height):
    span_x = max(max_x - min_x, 1.0)
    span_y = max(max_y - min_y, 1.0)

    def project_xy(lon, lat):
        x, y = forward_lcc(lon, lat)
        sx = PAD + (x - min_x) / span_x * (width - 2 * PAD)
        sy = PAD + (max_y - y) / span_y * (height - 2 * PAD)
        return sx, sy

    return project_xy


def ring_points(coords, project_xy):
    points = []
    for lon, lat, *_rest in coords:
        sx, sy = project_xy(lon, lat)
        px = int(round(sx))
        py = int(round(sy))
        if not points or points[-1] != [px, py]:
            points.append([px, py])
    if len(points) >= 2 and points[0] == points[-1]:
        points.pop()
    if len(points) < 3:
        return None
    points.append(points[0])
    return points


def geometry_rings(geom, project_xy):
    simplified = geom.simplify(0.01, preserve_topology=True)
    simplified = as_polygonal(simplified) or geom
    rings = []
    for poly in iter_polygons(simplified):
        if area_km2(poly) < 8:
            continue
        outer = ring_points(poly.exterior.coords, project_xy)
        if outer:
            rings.append(outer)
        for hole in poly.interiors:
            inner = ring_points(hole.coords, project_xy)
            if inner:
                rings.append(inner)
    return rings


def path_from_rings(rings) -> str:
    parts = []
    for ring in rings:
        if len(ring) < 4:
            continue
        move = ring[0]
        bits = [f"M{move[0]} {move[1]}"]
        for x, y in ring[1:]:
            bits.append(f"L{x} {y}")
        bits.append("Z")
        parts.append("".join(bits))
    return "".join(parts)


def bbox_of(rings):
    xs = [point[0] for ring in rings for point in ring]
    ys = [point[1] for ring in rings for point in ring]
    return [min(xs), min(ys), max(xs), max(ys)]


def representative_screen(geom, project_xy):
    point = geom.representative_point()
    return project_xy(point.x, point.y)


def line_fragments(geom):
    if geom.is_empty:
        return []
    kind = geom.geom_type
    if kind == "LineString":
        return [list(geom.coords)]
    if kind == "MultiLineString":
        return [list(part.coords) for part in geom.geoms]
    if kind == "GeometryCollection":
        pieces = []
        for part in geom.geoms:
            pieces.extend(line_fragments(part))
        return pieces
    return []


def build_edges(atoms, neighbor_sets, project_xy):
    edges = []
    seen = set()
    for index, nbs in enumerate(neighbor_sets):
        for other in nbs:
            if other <= index:
                continue
            key = (index, other)
            if key in seen:
                continue
            seen.add(key)
            try:
                shared = atoms[index]["geom"].boundary.intersection(atoms[other]["geom"].boundary)
            except Exception:
                continue
            fragments = []
            for coords in line_fragments(shared):
                if len(coords) < 2:
                    continue
                projected = []
                for lon, lat, *_rest in coords:
                    sx, sy = project_xy(lon, lat)
                    point = [int(round(sx)), int(round(sy))]
                    if not projected or projected[-1] != point:
                        projected.append(point)
                if len(projected) >= 2:
                    fragments.append(projected)
            if not fragments:
                continue
            # Keep the longest fragment plus any substantial extra pieces.
            fragments.sort(key=len, reverse=True)
            kept = fragments[:3]
            path_bits = []
            for fragment in kept:
                move = fragment[0]
                bits = [f"M{move[0]} {move[1]}"]
                for x, y in fragment[1:]:
                    bits.append(f"L{x} {y}")
                path_bits.append("".join(bits))
            edges.append({"a": index, "b": other, "d": "".join(path_bits)})
    log(f"Shared edges: {len(edges)}")
    return edges


def load_cities():
    if not SRC_PLACES.exists():
        return []
    data = json.loads(SRC_PLACES.read_text())
    cities = []
    for feature in data["features"]:
        props = feature["properties"]
        lon = props.get("LONGITUDE")
        lat = props.get("LATITUDE")
        if lon is None or lat is None:
            continue
        if not (-26 <= lon <= 61 and 34 <= lat <= 72):
            continue
        pop = int(props.get("POP_MAX") or 0)
        kind = props.get("FEATURECLA") or ""
        if pop < 20_000 and "capital" not in kind.lower() and not props.get("ADM0CAP"):
            continue
        rank = 3
        if pop >= 1_500_000 or (props.get("ADM0CAP") and pop >= 600_000):
            rank = 0
        elif pop >= 400_000 or props.get("ADM0CAP"):
            rank = 1
        elif pop >= 120_000 or "Admin-0" in kind:
            rank = 2
        cities.append({
            "name": props.get("NAMEASCII") or props.get("NAME"),
            "local": props.get("NAME") or "",
            "lon": lon,
            "lat": lat,
            "pop": pop,
            "rank": rank,
            "capital": "capital" in kind.lower() or bool(props.get("ADM0CAP")),
            "kind": kind,
        })
    cities.sort(key=lambda city: (city["rank"], -city["pop"]))
    return cities


def assign_cities(atoms, cities, project_xy):
    geoms = [atom["geom"] for atom in atoms]
    tree = STRtree(geoms)
    for atom in atoms:
        atom["cities"] = []
    for city in cities:
        point = Point(city["lon"], city["lat"])
        hits = tree.query(point)
        host = None
        for hit in hits:
            hit = int(hit)
            try:
                if geoms[hit].contains(point):
                    host = hit
                    break
            except Exception:
                continue
        if host is None:
            continue
        sx, sy = project_xy(city["lon"], city["lat"])
        record = {
            "n": city["name"],
            "x": int(round(sx)),
            "y": int(round(sy)),
            "r": city["rank"],
            "p": city["pop"],
            "k": 1 if city["capital"] else 0,
        }
        atoms[host]["cities"].append(record)
    for atom in atoms:
        atom["cities"].sort(key=lambda item: (item["r"], -item["p"]))
    # Provinces with no town inside still get a named, approximate game center.
    for atom in atoms:
        if atom["cities"]:
            continue
        point = atom["geom"].representative_point()
        best = None
        best_d = 2.2 * 2.2
        for city in cities:
            dist = (city["lon"] - point.x) ** 2 + (city["lat"] - point.y) ** 2
            if dist < best_d:
                best_d = dist
                best = city
        if best is None:
            continue
        sx, sy = project_xy(point.x, point.y)
        atom["cities"].append({
            "n": best["name"],
            "x": int(round(sx)),
            "y": int(round(sy)),
            "r": 3,
            "p": best["pop"],
            "k": 0,
        })


def choose_capital(cities):
    if not cities:
        return None
    capitals = [city for city in cities if city["k"]]
    pool = capitals or cities
    best = min(pool, key=lambda city: (city["r"], -city["p"]))
    return {
        "n": best["n"],
        "x": best["x"],
        "y": best["y"],
        "v": 1 if best["k"] else 0,
    }


def build_terrain(project_xy, width, height, inverse_screen):
    if not SRC_TIF.exists():
        log("Terrain source missing; skipping")
        return False
    log("Sampling shaded relief…")
    image = Image.open(SRC_TIF)
    full_w, full_h = 10800, 5400

    def world_pixel(lon, lat):
        col = (lon + 179.98333333333333) / (360.0 / full_w)
        row = (89.98333333333333 - lat) / (180.0 / full_h)
        return col, row

    west, east, south, north = -32.0, 68.0, 32.0, 73.0
    c0, r_north = world_pixel(west, north)
    c1, r_south = world_pixel(east, south)
    crop_box = (
        max(0, int(math.floor(c0))),
        max(0, int(math.floor(r_north))),
        min(full_w, int(math.ceil(c1))),
        min(full_h, int(math.ceil(r_south))),
    )
    crop = image.crop(crop_box).convert("L")
    relief = np.asarray(crop, dtype=np.float32)
    rows, cols = relief.shape
    ys, xs = np.mgrid[0:height, 0:width]
    lon, lat = inverse_screen(xs.astype(np.float64) + 0.5, ys.astype(np.float64) + 0.5)
    col, row = world_pixel(lon, lat)
    col = col - crop_box[0]
    row = row - crop_box[1]
    inside = (lat > 34) & (lat < 72) & (lon > -28) & (lon < 62)
    col_i = np.clip(col.astype(np.int32), 0, cols - 1)
    row_i = np.clip(row.astype(np.int32), 0, rows - 1)
    shade = relief[row_i, col_i]
    shade = np.where(inside, shade, 188)
    # Stretch the narrow Natural Earth grayscale so mountain texture survives.
    sample = shade[::24, ::24]
    low, high = np.percentile(sample, [12, 90])
    if high - low < 8:
        high = low + 8
    relief_n = np.clip((shade - low) / (high - low), 0, 1)
    tone = 118 + relief_n * 108
    red = np.clip(tone * 1.04 + 6, 0, 255)
    green = np.clip(tone * 0.98 + 1, 0, 255)
    blue = np.clip(tone * 0.86 - 4, 0, 255)
    rgb = np.dstack([red, green, blue]).astype(np.uint8)
    picture = Image.fromarray(rgb, "RGB")
    picture = ImageEnhance.Contrast(picture).enhance(1.08)
    picture.save(OUT_TERRAIN, quality=72, optimize=True, progressive=True)
    log(f"  terrain {picture.size} → {OUT_TERRAIN.stat().st_size / 1024:.0f} KB")
    image.close()
    return True


def assert_history(atoms, groups):
    by_name = defaultdict(list)
    for atom in atoms:
        by_name[norm(atom["name"])].append(atom)
    checks = [
        ("bas-rhin", 3, "ger"),
        ("bas-rhin", 2, "fra"),
        ("bas-rhin", 0, "hab"),
        ("marne", 3, "fra"),
        ("bozen", 3, "auh"),
        ("bozen", 4, "ita"),
        ("skane", 1, "den"),
        ("skane", 2, "swe"),
    ]
    for name, era, expected in checks:
        matches = by_name.get(name) or by_name.get(norm(name))
        if not matches:
            raise SystemExit(f"Missing atom {name}")
        got = matches[0]["owners"][era]
        if got != expected:
            raise SystemExit(f"{name} era {era} is {got}, expected {expected}")
    # Groups preserve ownership tuples.
    for members in groups.values():
        tuples = {atoms[index]["owners"] for index in members}
        if len(tuples) != 1:
            raise SystemExit("Merged group crossed an ownership boundary")
    kaliningrad = [atom for atom in atoms if "kaliningrad" in norm(atom["name"])]
    crimea = [atom for atom in atoms if norm(atom["name"]) in {"crimea", "sevastopol"}]
    if not kaliningrad or kaliningrad[0]["owners"][4] != "ger" or kaliningrad[0]["owners"][5] != "rus":
        raise SystemExit("Kaliningrad ownership failed")
    if not crimea or any(atom["owners"][5] != "ukr" or atom["owners"][1] != "cri" for atom in crimea):
        raise SystemExit("Crimea ownership failed")
    log("Historical spot checks passed")


def main():
    if not SRC_ADMIN.exists():
        raise SystemExit(f"Missing {SRC_ADMIN}. See README preprocessing steps.")
    grouped = load_admin_features()
    clip_cyprus(grouped)
    atoms = build_atoms(grouped)
    groups, neighbors = merge_groups(atoms)
    assert_history(atoms, groups)

    # Projection fit.
    xs = []
    ys = []
    for atom in atoms:
        minx, miny, maxx, maxy = atom["geom"].bounds
        for lon, lat in ((minx, miny), (minx, maxy), (maxx, miny), (maxx, maxy)):
            x, y = forward_lcc(lon, lat)
            xs.append(x)
            ys.append(y)
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span_x = max_x - min_x
    span_y = max_y - min_y
    inner_w = MAP_W - 2 * PAD
    inner_h = inner_w * (span_y / span_x)
    height = int(round(inner_h + 2 * PAD))
    project_xy = project_factory(min_x, max_x, min_y, max_y, MAP_W, height)

    def inverse_screen(sx, sy):
        x = min_x + (sx - PAD) / (MAP_W - 2 * PAD) * span_x
        y = max_y - (sy - PAD) / (height - 2 * PAD) * span_y
        return inverse_lcc(x, y)

    # Round-trip a known city.
    px, py = project_xy(2.35, 48.86)
    lon, lat = inverse_lcc(*[
        float(value)
        for value in (
            min_x + (px - PAD) / (MAP_W - 2 * PAD) * span_x,
            max_y - (py - PAD) / (height - 2 * PAD) * span_y,
        )
    ])
    if abs(lon - 2.35) > 0.05 or abs(lat - 48.86) > 0.05:
        raise SystemExit(f"Projection round-trip failed: {lon} {lat}")

    assign_cities(atoms, load_cities(), project_xy)

    group_meta = {}
    atom_records = []
    gid_of = {}
    cluster_counts = {}
    for atom in atoms:
        cluster_counts[atom["cluster"]] = cluster_counts.get(atom["cluster"], 0) + 1
    for number, (root, members) in enumerate(sorted(groups.items(), key=lambda item: item[0])):
        gid = f"g{number:03d}"
        member_atoms = [atoms[index] for index in members]
        gname, glocal = friendly_group_name(member_atoms, cluster_counts)
        all_cities = []
        for atom in member_atoms:
            all_cities.extend(atom["cities"])
        all_cities.sort(key=lambda item: (item["r"], -item["p"]))
        capital = choose_capital(all_cities)
        if capital is None:
            anchor = max(member_atoms, key=lambda atom: atom["area"])
            point = anchor["geom"].representative_point()
            sx, sy = project_xy(point.x, point.y)
            capital = {"n": "Game center", "x": int(round(sx)), "y": int(round(sy)), "v": 0}
        group_meta[gid] = {
            "n": gname,
            "l": glocal,
            "cap": capital,
        }
        for index in members:
            gid_of[index] = gid

    edges = build_edges(atoms, neighbors, project_xy)

    scenario_owners = {year: [] for year in YEARS}
    for index, atom in enumerate(atoms):
        rings = geometry_rings(atom["geom"], project_xy)
        if not rings:
            rings = geometry_rings(atom["geom"].simplify(0.002), project_xy)
        if not rings:
            log(f"  dropping undrawable {atom['id']} {atom['name']}")
            continue
        sx, sy = representative_screen(atom["geom"], project_xy)
        box = bbox_of(rings)
        capital = choose_capital(atom["cities"])
        if capital is None:
            capital = {"n": "Game center", "x": int(round(sx)), "y": int(round(sy)), "v": 0}
        record_index = len(atom_records)
        atom["_out"] = record_index
        atom_records.append({
            "id": atom["id"],
            "gid": gid_of[index],
            "n": atom["display"],
            "l": atom["local"],
            "aka": sorted({alias for alias in atom["aka"] + [atom["name"], atom["local"]] if alias and alias != atom["display"]}),
            "rings": rings,
            "b": box,
            "cx": int(round(sx)),
            "cy": int(round(sy)),
            "cap": capital,
            "area": int(round(atom["area"])),
        })
        for era_index, year in enumerate(YEARS):
            scenario_owners[year].append(atom["owners"][era_index])

    # Remap edges to output indexes, dropping atoms that failed to draw.
    out_index = {index: atoms[index]["_out"] for index in range(len(atoms)) if "_out" in atoms[index]}
    edge_records = []
    neighbor_out = [[] for _ in atom_records]
    for edge in edges:
        if edge["a"] not in out_index or edge["b"] not in out_index:
            continue
        a = out_index[edge["a"]]
        b = out_index[edge["b"]]
        edge_records.append({"a": a, "b": b, "d": edge["d"]})
        neighbor_out[a].append(b)
        neighbor_out[b].append(a)
    for record, nbs in zip(atom_records, neighbor_out):
        record["nb"] = nbs

    # Global city list, de-duplicated, capped.
    city_list = []
    seen_cities = set()
    for atom in atoms:
        if "_out" not in atom:
            continue
        for city in atom["cities"]:
            if city["r"] > 2 and not city["k"]:
                continue
            key = (city["n"], city["x"] // 8, city["y"] // 8)
            if key in seen_cities:
                continue
            seen_cities.add(key)
            city_list.append({
                "n": city["n"],
                "x": city["x"],
                "y": city["y"],
                "r": city["r"],
                "p": city["p"],
                "a": atom["_out"],
            })
    city_list.sort(key=lambda city: (city["r"], -city["p"]))
    city_list = city_list[:520]

    seas = []
    land = unary_union([atom["geom"] for atom in atoms if "_out" in atom])
    for name, lon, lat in SEAS:
        point = Point(lon, lat)
        if land.contains(point):
            continue
        sx, sy = project_xy(lon, lat)
        if PAD < sx < MAP_W - PAD and PAD < sy < height - PAD:
            seas.append({"n": name, "x": int(round(sx)), "y": int(round(sy))})

    polities = [
        {"id": pid, "n": meta[0], "c": meta[1]}
        for pid, meta in sorted(COUNTRIES.items())
    ]
    used = {owner for owners in scenario_owners.values() for owner in owners}
    polities = [item for item in polities if item["id"] in used]

    has_terrain = build_terrain(project_xy, MAP_W, height, inverse_screen)

    payload = {
        "v": 1,
        "name": "Europa Canvas",
        "w": MAP_W,
        "h": height,
        "disclaimer": (
            "Historical ownership and these fixed game-province boundaries are approximate. "
            "Europa Canvas is a painting sandbox, not an authoritative historical reconstruction "
            "or a source of real-time political boundaries."
        ),
        "attribution": (
            "Coastlines and administrative areas: Natural Earth 1:10m cultural vectors, public domain. "
            "Populated places: Natural Earth 1:10m, public domain. "
            "Terrain shading: Natural Earth I shaded relief, public domain, cropped and reprojected. "
            "Game provinces merge small neighboring units when they share the same owner in every included scenario."
        ),
        "scenarios": [
            {
                **scenario,
                "owners": scenario_owners[scenario["id"]],
            }
            for scenario in SCENARIOS
        ],
        "polities": polities,
        "groups": group_meta,
        "atoms": atom_records,
        "edges": edge_records,
        "cities": city_list,
        "seas": seas,
        "terrain": "data/terrain.jpg" if has_terrain else None,
    }
    OUT_JSON.write_text(json.dumps(payload, separators=(",", ":")))
    report = {
        "atoms": len(atom_records),
        "groups": len(group_meta),
        "edges": len(edge_records),
        "cities": len(city_list),
        "polities": len(polities),
        "width": MAP_W,
        "height": height,
        "bytes": OUT_JSON.stat().st_size,
        "terrainBytes": OUT_TERRAIN.stat().st_size if has_terrain else 0,
    }
    OUT_REPORT.write_text(json.dumps(report, indent=2))
    log(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
