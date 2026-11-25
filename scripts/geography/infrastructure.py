"""Build the opt-in OSM cartographic overlay and street camera registration."""

import argparse, gzip, json, struct, urllib.request, urllib.parse
from collections import Counter, defaultdict
from shapely.geometry import LineString, Point, shape
from shapely.ops import transform, polygonize, unary_union
from geoframe import OUT, SOURCES, to_local, to_wgs, dump

bbox = "17.354,78.262,17.451,78.364"
q = f'[out:json][timeout:100];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|footway|cycleway|path)$"]({bbox});way["natural"~"^(water|wood|wetland|scrub)$"]({bbox});way["landuse"~"^(forest|construction|grass|meadow|orchard)$"]({bbox});relation["natural"="water"]({bbox});node["natural"="tree"]({bbox}););out geom;'
p = argparse.ArgumentParser()
p.add_argument("--input")
p.add_argument("--fetch", action="store_true")
a = p.parse_args()
source = SOURCES / "building-context/infrastructure-overpass.json.gz"
if a.input or a.fetch:
    if a.input:
        with open(a.input, "rb") as f:
            raw = f.read()
    else:
        with urllib.request.urlopen(
            "https://overpass-api.de/api/interpreter?"
            + urllib.parse.urlencode({"data": q}),
            timeout=115,
        ) as r:
            raw = r.read()
    source.write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
records = json.loads(gzip.decompress(source.read_bytes()))
origin = Point(0, 0)
roi = origin.buffer(5000, resolution=100)
parcel = transform(
    to_local, shape(json.loads((OUT / "plot-20.geojson").read_text())["geometry"])
)
categories = [
    "arterial",
    "street",
    "service",
    "path",
    "water",
    "green",
    "construction",
    "tree",
]
lines = defaultdict(list)
counts = Counter()
ignored = Counter()
nearest = []
seen = set()


def paths(g):
    if g.is_empty:
        return
    if g.geom_type in ("LineString", "LinearRing"):
        yield g
    elif hasattr(g, "geoms"):
        for part in g.geoms:
            yield from paths(part)


def category(tags):
    if "highway" in tags:
        c = tags["highway"]
        if c in ("footway", "cycleway", "path"):
            return "path"
        if c in ("motorway", "trunk", "primary", "secondary", "tertiary"):
            return "arterial"
        return "service" if c == "service" else "street"
    if tags.get("natural") == "water":
        return "water"
    if tags.get("landuse") == "construction":
        return "construction"
    if tags.get("natural") == "tree":
        return "tree"
    return "green"


def coords(points):
    return [
        to_local(p["lon"], p["lat"]) for p in points if p and "lon" in p and "lat" in p
    ]


for feature in records["elements"]:
    tags = feature.get("tags", {})
    kind = category(tags)
    id_ = feature["id"]
    geoms = []
    if (
        tags.get("highway") in ("construction", "proposed")
        or tags.get("tunnel") in ("yes", "building_passage")
        or tags.get("bridge") not in (None, "no")
        or tags.get("layer", "0") not in ("0", "0.0")
    ):
        ignored["gradeSeparatedOrPlanned"] += 1
        continue
    if feature["type"] == "node":
        if kind != "tree":
            continue
        pt = Point(*to_local(feature["lon"], feature["lat"]))
        if roi.covers(pt) and not parcel.intersects(pt):
            lines[kind].append(list(pt.coords))
            counts[kind] += 1
        continue
    if feature["type"] == "relation":
        outer = []
        inner = []
        for member in feature.get("members", []):
            pts = coords(member.get("geometry", []))
            if len(pts) > 1:
                (inner if member.get("role") == "inner" else outer).append(
                    LineString(pts)
                )
        if outer:
            poly = unary_union(list(polygonize(outer)))
            if inner:
                poly = poly.difference(unary_union(list(polygonize(inner))))
            geoms = list(paths(poly.boundary))
    else:
        pts = coords(feature.get("geometry", []))
        if len(pts) > 1:
            geoms = [LineString(pts)]
    contributed = False
    for line in geoms:
        if not roi.intersects(line):
            continue
        if kind in ("arterial", "street", "service"):
            gate = Point(-39, 63)
            road = line.interpolate(line.project(gate))
            if not parcel.intersects(road):
                nearest.append((gate.distance(road), id_, road, tags))
        segments = line.intersection(roi).difference(parcel)
        for segment in paths(segments):
            if segment.length < 1:
                continue
            tol = (
                0.3
                if segment.distance(origin) < 500
                else (0.65 if segment.distance(origin) < 2000 else 1)
            )
            points = list(segment.simplify(tol).coords)
            pts = tuple((round(x * 4), round(z * 4)) for x, z in points)
            normalized = min(pts, tuple(reversed(pts)))
            if normalized in seen:
                continue
            seen.add(normalized)
            lines[kind].append([(x / 4, z / 4) for x, z in pts])
            contributed = True
    if contributed:
        counts[kind] += 1
buf = bytearray(b"BBI1")
for kind in categories:
    buf.extend(struct.pack("<I", len(lines[kind])))
    for points in lines[kind]:
        buf.extend(struct.pack("<H", len(points)))
        for x, z in points:
            buf.extend(struct.pack("<hh", round(x * 4), round(z * 4)))
(OUT / "infrastructure.bin").write_bytes(buf)
distance, id_, point, tags = min(nearest, key=lambda row: row[0])
meta = {
    "format": "BBI1",
    "scaleM": 0.25,
    "categories": categories,
    "radiusM": 5000,
    "featureCounts": dict(counts),
    "excluded": dict(ignored),
    "bytes": len(buf),
    "timestampUTC": records["osm3s"]["timestamp_osm_base"],
    "source": "OpenStreetMap via Overpass; ODbL 1.0",
    "query": q,
    "streetCamera": {
        "osmWay": id_,
        "roadClass": tags["highway"],
        "localXZ": list(point.coords[0]),
        "lonLat": list(to_wgs(*point.coords[0])),
        "distanceFromGateReferenceM": distance,
    },
}
dump(OUT / "infrastructure.json", meta)
print(meta["featureCounts"], len(buf), meta["streetCamera"])
