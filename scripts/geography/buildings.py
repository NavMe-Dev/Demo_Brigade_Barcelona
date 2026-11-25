"""Build spatial footprint tiles from the saved Overture extract and OSM exclusion masks."""

import json, math, re, struct
from collections import defaultdict, Counter
import numpy as np
import pyarrow.parquet as pq
from shapely import affinity, from_wkb, make_valid, STRtree, set_precision
from shapely.geometry import shape, Point
from shapely.geometry.polygon import orient
from geoframe import ROOT, OUT, SOURCES, LON, LAT, EAST, NORTH, LON_METRES, dump

SIZE, LIMIT = 512, 5000
folder = SOURCES / "building-context"
dest = OUT / "buildings"
dest.mkdir(exist_ok=True)


def local(g):
    a, b = EAST[0] * LON_METRES, NORTH[0] * 111320
    c, d = EAST[1] * LON_METRES, NORTH[1] * 111320
    return affinity.affine_transform(
        g, [a, b, c, d, -a * LON - b * LAT, -c * LON - d * LAT]
    )


def valid(g):
    return g if g.is_valid else make_valid(g)


def polygons(g):
    if g.geom_type == "Polygon":
        yield g
    elif hasattr(g, "geoms"):
        for p in g.geoms:
            yield from polygons(p)


def number(v):
    m = re.fullmatch(r"\s*([\d.]+)\s*(?:m|metres|meters)?\s*", str(v))
    return float(m.group(1)) if m else None


def osm_identifier(record):
    m = re.match(r"^([wr])(\d+)", record or "")
    return ("way/" if m[1] == "w" else "relation/") + m[2] if m else ""


def dimensions(row, osm_id):
    oh, of = life["heightById"].get(osm_id, [None, None])
    h = number(oh) or row["height"]
    floors = number(of) or row["num_floors"]
    if h and 1 <= h <= 400:
        return h, 0
    if floors and 1 <= floors <= 100:
        return floors * 3.1, 1
    c = row["class"]
    sub = row["subtype"]
    if c in ("shed", "garage", "hut", "kiosk") or sub == "outbuilding":
        return 3, 2
    if c in ("apartments", "dormitory", "office", "hotel"):
        return 10, 2
    if sub in ("education", "commercial", "entertainment", "industrial"):
        return 7, 2
    if sub == "residential":
        return 6.2, 2
    return 4.5, 2


def age(row):
    s = row["sources"][0]
    return (
        0 if s["provider"] == "osm" else (1 if s["provider"] == "microsoft" else 2),
        -(s.get("confidence") or 0),
        row["id"],
    )


masks = [
    valid(local(shape(f["geometry"])))
    for f in json.loads((folder / "osm-mask.geojson").read_text())["features"]
]
masktree = STRtree(masks)
parcel = local(shape(json.loads((OUT / "plot-20.geojson").read_text())["geometry"]))
origin = Point(0, 0)
life = json.loads((folder / "osm-lifecycle.json").read_text())
excluded = set(life["excludedIds"])
rows = sorted(pq.read_table(folder / "overture.parquet").to_pylist(), key=age)
rejected = Counter()
candidates = []
pieces = []
sourceCounts = Counter()
heightCounts = Counter()
for row in rows:
    src = row["sources"][0]
    provider = src["provider"]
    osm_id = osm_identifier(src["record_id"]) if provider == "osm" else ""
    if row["is_underground"] or osm_id in excluded:
        rejected["lifecycleOrUnderground"] += 1
        continue
    label = (row["names"] or {}).get("primary") or ""
    if re.search(r"\b(under construction|proposed|demolished)\b", label, re.I):
        rejected["lifecycleOrUnderground"] += 1
        continue
    geom = valid(local(from_wkb(row["geometry"])))
    if geom.is_empty or geom.centroid.distance(origin) > LIMIT:
        rejected["outsideRadius"] += 1
        continue
    if provider != "osm" and src["confidence"] is not None and src["confidence"] < 0.70:
        rejected["lowDetectionConfidence"] += 1
        continue
    # Reject the entire feature on any parcel or mapped lifecycle polygon overlap.
    if geom.intersects(parcel):
        rejected["parcel"] += 1
        continue
    if any(geom.intersection(masks[k]).area > 0.01 for k in masktree.query(geom)):
        rejected["osmMask"] += 1
        continue
    if geom.area < 10:
        rejected["under10sqm"] += 1
        continue
    height, method = dimensions(row, osm_id)
    candidates.append(
        (row["id"], provider, height, method, row["class"], row["subtype"])
    )
    pieces.append(geom)
# Overture already conflates its inputs. Prefer current mapped footprints for residual near-duplicates.
tree = STRtree(pieces)
accepted = set()
tiles = defaultdict(list)
zoneCounters = Counter()
holes = 0
multiparts = 0
bounds = {}
vertical = Counter()
soil = []
for n, g in enumerate(pieces):
    duplicate = False
    for k in tree.query(g):
        if k not in accepted:
            continue
        overlap = g.intersection(pieces[k]).area
        if (
            overlap / min(g.area, pieces[k].area) > 0.84
            and overlap / max(g.area, pieces[k].area) > 0.61
        ):
            duplicate = True
            break
    if duplicate:
        rejected["nearDuplicate"] += 1
        continue
    id_, provider, height, method, cls, sub = candidates[n]
    r = g.centroid.distance(origin)
    zone = 0 if r <= 500 else (1 if r <= 2000 else 2)
    tol = (0.1, 0.35, 0.75)[zone]
    geom = from_wkb(set_precision(g.simplify(tol, preserve_topology=True), 0.1).wkb)
    if (
        geom.is_empty
        or geom.intersects(parcel)
        or any(geom.intersection(masks[k]).area > 0.01 for k in masktree.query(geom))
    ):
        rejected["unsafeAfterSimplification"] += 1
        continue
    tile = (math.floor(g.centroid.x / SIZE), math.floor(g.centroid.y / SIZE))
    ox, oz = (c * SIZE for c in tile)
    parts = list(polygons(geom))
    if not parts:
        continue
    accepted.add(n)
    sourceCounts[provider] += 1
    heightCounts[["sourceHeight", "floorsTimes3.1", "classDefault"][method]] += 1
    zoneCounters[zone] += 1
    multiparts += len(parts) > 1
    category = (
        1
        if sub == "residential"
        else (
            2
            if sub in ("commercial", "industrial")
            else (3 if sub in ("education", "religious", "civic") else 0)
        )
    )
    records = []
    for part in parts:
        p = orient(part, sign=1)
        rings = [p.exterior, *p.interiors]
        holes += len(rings) - 1
        coords = [
            [
                (int(round((x - ox) * 10)), int(round((z - oz) * 10)))
                for x, z in list(ring.coords)[:-1]
            ]
            for ring in rings
        ]
        records.append(coords)
    tiles[tile].append((id_, height, method, category, records))
    box = geom.bounds
    prev = bounds.get(tile, box)
    bounds[tile] = [
        min(prev[0], box[0]),
        min(prev[1], box[1]),
        max(prev[2], box[2]),
        max(prev[3], box[3]),
    ]
    vertical[tile] = max(vertical[tile], height)
    if len(soil) < 12 and (method < 2 or zone == 0):
        soil.append(
            {
                "id": id_,
                "source": provider,
                "x": round(g.centroid.x, 1),
                "z": round(g.centroid.y, 1),
                "heightM": round(height, 2),
                "method": method,
                "zone": zone,
            }
        )
index = []
total = 0
for (ix, iz), features in sorted(tiles.items()):
    name = f"{ix}_{iz}.bin"
    data = bytearray(struct.pack("<4sI", b"BBF1", len(features)))
    vertices = 0
    for _, height, method, category, parts in features:
        data.extend(
            struct.pack("<HBBH", int(round(height * 10)), method, category, len(parts))
        )
        for rings in parts:
            data.extend(struct.pack("<H", len(rings)))
            for ring in rings:
                data.extend(struct.pack("<H", len(ring)))
                for x, z in ring:
                    data.extend(struct.pack("<hh", x, z))
                vertices += len(ring)
    (dest / name).write_bytes(data)
    total += len(data)
    index.append(
        {
            "tile": [ix, iz],
            "file": name,
            "bbox": list(np.round(bounds[(ix, iz)], 1)),
            "count": len(features),
            "vertices": vertices,
            "bytes": len(data),
            "maxHeight": round(vertical[(ix, iz)], 1),
        }
    )
report = {
    "source": "Overture 2026-11-18.0 + OSM snapshot 2026-11-25",
    "rawBboxRecords": len(rows),
    "acceptedBuildings": len(accepted),
    "rejectedByFirstReason": dict(rejected),
    "zones": {
        "0–500m": zoneCounters[0],
        "500–2000m": zoneCounters[1],
        "2000–5000m": zoneCounters[2],
    },
    "originCandidatesInsideHMDA": int(rejected["parcel"]),
    "includedInsideHMDA": 0,
    "sourceProviders": dict(sourceCounts),
    "heightMethods": dict(heightCounts),
    "osmMaskPolygonCount": len(masks),
    "multipolygonBuildings": multiparts,
    "interiorRings": holes,
    "spatialTiles": len(tiles),
    "bytes": total,
    "tileSideM": SIZE,
    "sampleBuildings": soil,
}
dump(
    dest / "index.json",
    {
        "format": "BBF1",
        "tileSize": SIZE,
        "radius": LIMIT,
        "attribution": "Overture Maps Foundation; © OpenStreetMap contributors, Google Open Buildings, Microsoft ML Buildings. ODbL 1.0.",
        "zones": report["zones"],
        "total": len(accepted),
        "tiles": index,
    },
)
dump(ROOT / "qa/geographic-buildings.json", report)
print(json.dumps(report, indent=2))
