"""Fetch bbox-filtered Overture geometry and the OSM mapping used for lifecycle exclusions."""

import argparse, datetime, hashlib, json, sys, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from shapely.geometry import Polygon, mapping
from shapely.ops import polygonize, unary_union
from shapely.geometry import LineString
import pyarrow.dataset as ds, pyarrow.fs as fs, pyarrow.parquet as pq
from geoframe import SOURCES, dump

BBOX = (78.262, 17.354, 78.364, 17.450)
RELEASE = "2026-11-18.0"
STAC = f"https://stac.overturemaps.org/{RELEASE}/buildings/building/00298/00298.json"
p = argparse.ArgumentParser()
p.add_argument("--osm-cache", type=Path, required=True)
p.add_argument("--only", choices=["overture", "osm"])
args = p.parse_args()
folder = SOURCES / "building-context"
folder.mkdir(exist_ok=True)
if args.only != "osm":
    record = json.load(urllib.request.urlopen(STAC, timeout=35))
    part = record["assets"]["aws"]["alternate"]["s3"]["href"].removeprefix("s3://")
    store = fs.S3FileSystem(anonymous=True, region="us-west-2")
    dataset = ds.dataset(part, filesystem=store, format="parquet")
    field = lambda n: ds.field(("bbox", n))
    w, s, e, n = BBOX
    mask = (
        (field("xmin") < e)
        & (field("xmax") > w)
        & (field("ymin") < n)
        & (field("ymax") > s)
    )
    rows = dataset.to_table(
        filter=mask,
        columns=[
            "id",
            "geometry",
            "names",
            "height",
            "num_floors",
            "class",
            "subtype",
            "is_underground",
            "sources",
        ],
    )
    pq.write_table(rows, folder / "overture.parquet", compression="zstd")
    dump(
        folder / "overture-source.json",
        {
            "release": RELEASE,
            "stac": STAC,
            "bbox": BBOX,
            "partition": part,
            "sourceRecords": len(rows),
            "license": "ODbL-1.0",
        },
    )
if args.only == "overture":
    sys.exit()
args.osm_cache.mkdir(parents=True, exist_ok=True)


def tile(ij):
    i, j = ij
    f = args.osm_cache / f"{i}-{j}.osm"
    if not f.exists():
        x, y = BBOX[0] + i * 0.0255, BBOX[1] + j * 0.024
        url = "https://api.openstreetmap.org/api/0.6/map?bbox=" + ",".join(
            f"{v:.6f}" for v in [x, y, x + 0.0255, y + 0.024]
        )
        with urllib.request.urlopen(url, timeout=65) as response:
            content = response.read()
        ET.fromstring(content)
        f.write_bytes(content)
    return f


with ThreadPoolExecutor(max_workers=2) as pool:
    files = list(pool.map(tile, [(i, j) for i in range(4) for j in range(4)]))
nodes = {}
ways = {}
relations = {}
for f in files:
    r = ET.parse(f)
    nodes.update(
        {
            n.get("id"): (float(n.get("lon")), float(n.get("lat")))
            for n in r.findall("node")
        }
    )
    for w in r.findall("way"):
        ways[w.get("id")] = (
            [n.get("ref") for n in w.findall("nd")],
            {x.get("k"): x.get("v") for x in w.findall("tag")},
        )
    for rel in r.findall("relation"):
        relations[rel.get("id")] = (
            [
                (m.get("ref"), m.get("role"))
                for m in rel.findall("member")
                if m.get("type") == "way"
            ],
            {x.get("k"): x.get("v") for x in rel.findall("tag")},
        )
inactive = {
    "proposed",
    "construction",
    "demolished",
    "destroyed",
    "razed",
    "ruins",
    "abandoned",
    "disused",
    "collapsed",
    "roof",
}


def skip(t):
    return (
        t.get("landuse") in {"construction", "brownfield", "greenfield"}
        or t.get("building") in inactive
        or any(k + ":building" in t for k in inactive)
    )


def line(refs):
    if all(i in nodes for i in refs) and len(refs) >= 2:
        return LineString([nodes[i] for i in refs])


records = []
status_ids = []
heights = {}


def add(ref, t, ge):
    if ge is not None and not ge.is_empty:
        records.append(
            {
                "type": "Feature",
                "id": ref,
                "geometry": mapping(ge),
                "properties": {
                    k: v
                    for k, v in t.items()
                    if k in ("landuse", "building", "name") or ":building" in k
                },
            }
        )


for id_, (refs, t) in ways.items():
    ref = "way/" + id_
    if t.get("building") and (t.get("height") or t.get("building:levels")):
        heights[ref] = [t.get("height"), t.get("building:levels")]
    if skip(t):
        status_ids.append(ref)
        l = line(refs)
        if l is not None and l.is_ring:
            add(ref, t, Polygon(l))
for id_, (members, t) in relations.items():
    ref = "relation/" + id_
    if t.get("building") and (t.get("height") or t.get("building:levels")):
        heights[ref] = [t.get("height"), t.get("building:levels")]
    if not skip(t):
        continue
    status_ids.append(ref)
    pieces = {"outer": [], "inner": []}
    for id_, role in members:
        if id_ in ways and role in ("outer", "inner", ""):
            l = line(ways[id_][0])
            role = role or "outer"
            if l is not None:
                pieces[role].append(l)
    if pieces["outer"]:
        a = unary_union(list(polygonize(pieces["outer"])))
        if pieces["inner"]:
            a = a.difference(unary_union(list(polygonize(pieces["inner"]))))
        add(ref, t, a)
dump(
    folder / "osm-mask.geojson",
    {
        "type": "FeatureCollection",
        "bbox": BBOX,
        "copyright": "© OpenStreetMap contributors (ODbL 1.0)",
        "features": records,
    },
)
dump(
    folder / "osm-lifecycle.json",
    {
        "excludedIds": sorted(status_ids),
        "heightById": heights,
        "queryBbox": BBOX,
        "readAPI": "https://api.openstreetmap.org/api/0.6/map",
        "snapshot": datetime.datetime.fromtimestamp(
            min(f.stat().st_mtime for f in files), datetime.timezone.utc
        )
        .date()
        .isoformat(),
        "files": [
            {"key": f.name, "sha256": hashlib.sha256(f.read_bytes()).hexdigest()}
            for f in files
        ],
    },
)
print(len(records), "polygon masks;", len(heights), "building height or floor tags")
