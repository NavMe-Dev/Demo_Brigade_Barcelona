"""Independently decode packed rings and check all shipped footprints against parcel and OSM masks."""

import hashlib, json, struct
from shapely import STRtree, make_valid
from shapely.geometry import Polygon, shape
from shapely.ops import transform
from geoframe import OUT, SOURCES, ROOT, to_local, dump

folder = OUT / "buildings"
index = json.loads((folder / "index.json").read_text())
masks = [
    make_valid(transform(to_local, shape(f["geometry"])))
    for f in json.loads((SOURCES / "building-context/osm-mask.geojson").read_text())[
        "features"
    ]
]
tree = STRtree(masks)
parcel = transform(
    to_local, shape(json.loads((OUT / "plot-20.geojson").read_text())["geometry"])
)
polys = []
holes = 0
bad = 0
maskOverlap = 0
parcelOverlap = 0
duplicates = 0
hashes = set()
area = 0
bounds = []
for tile in index["tiles"]:
    data = (folder / tile["file"]).read_bytes()
    i = 8
    ox, oz = (a * index["tileSize"] for a in tile["tile"])
    n = struct.unpack_from("<I", data, 4)[0]

    def word():
        global i
        k = struct.unpack_from("<H", data, i)[0]
        i += 2
        return k

    for _ in range(n):
        i += 4
        for p in range(word()):
            rings = []
            for r in range(word()):
                ring = []
                for _ in range(word()):
                    x, z = struct.unpack_from("<hh", data, i)
                    i += 4
                    ring.append((ox + x / 10, oz + z / 10))
                rings.append(ring)
            poly = Polygon(rings[0], rings[1:])
            holes += len(rings) - 1
            bad += not poly.is_valid or poly.is_empty
            if poly.intersects(parcel):
                parcelOverlap += 1
            for j in tree.query(poly):
                overlap = poly.intersection(masks[j]).area
                if overlap > 0.011:
                    maskOverlap += 1
                    print("Overlap", tile["file"], poly.centroid, overlap, j)
            digest = hashlib.sha256(poly.normalize().wkb).digest()
            duplicates += digest in hashes
            hashes.add(digest)
            area += poly.area
            polys.append(poly)
    assert i == len(data)
indexTree = STRtree(polys)
near = 0
for i, g in enumerate(polys):
    for j in indexTree.query(g):
        if j >= i:
            continue
        a = g.intersection(polys[j]).area
        if (
            a / min(g.area, polys[j].area) > 0.84
            and a / max(g.area, polys[j].area) > 0.61
        ):
            near += 1
assert bad == parcelOverlap == maskOverlap == duplicates == near == 0, (
    bad,
    parcelOverlap,
    maskOverlap,
    duplicates,
    near,
)
dump(
    ROOT / "qa/geographic-exclusions.json",
    {
        "status": "pass",
        "checkedPolygons": len(polys),
        "courtyards": holes,
        "invalid": bad,
        "parcelIntersections": parcelOverlap,
        "constructionMasksIntersected": maskOverlap,
        "geometryDuplicates": duplicates,
        "nearDuplicates": near,
        "coverageSqKm": round(area / 1e6, 4),
        "method": "Read shipped BBF1 rings. Reconstruct polygons, check topology, intersect parcel and lifecycle masks, compare normalized polygon hashes and scan spatially for overlaps of >84% of smaller plus >61% of larger footprint.",
    },
)
