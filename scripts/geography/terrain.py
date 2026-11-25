"""Regenerate the regular-grid terrain. --fetch downloads missing public Terrarium tiles."""

import argparse, hashlib, json, math, urllib.request
from PIL import Image
import numpy as np
from shapely import points, distance
from shapely.geometry import Polygon
from geoframe import (
    OUT,
    SOURCES,
    LON,
    LAT,
    EAST,
    NORTH,
    to_wgs,
    to_local,
    dump,
)

p = argparse.ArgumentParser()
p.add_argument("--fetch", action="store_true")
args = p.parse_args()
RADIUS, STEP, ZOOM = 7168, 32, 13
cache = SOURCES / "terrain"
cache.mkdir(exist_ok=True)
axis = np.arange(-RADIUS, RADIUS + 1, STEP)
x, z = np.meshgrid(axis, axis)
lon, lat = to_wgs(x, z)
factor = 256 * 2**ZOOM
# Source pixel centres fall at half-integer Web Mercator pixel coordinates.
gx = (lon + 180) / 360 * factor - 0.5
gy = (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) * 0.5 * factor - 0.5
ix, iy = np.floor(gx).astype("int32"), np.floor(gy).astype("int32")
left, right = ix.min() // 256, (ix.max() + 1) // 256
top, bottom = iy.min() // 256, (iy.max() + 1) // 256
mosaic = np.zeros(((bottom - top + 1) * 256, (right - left + 1) * 256), dtype="float64")
tiles = []
for tx in range(left, right + 1):
    for ty in range(top, bottom + 1):
        name = f"{ZOOM}-{tx}-{ty}.png"
        f = cache / name
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{tx}/{ty}.png"
        if not f.exists() and args.fetch:
            with urllib.request.urlopen(url, timeout=40) as response:
                f.write_bytes(response.read())
        pixels = np.asarray(Image.open(f).convert("RGB"), dtype="float64")
        values = pixels[:, :, 0] * 256 + pixels[:, :, 1] + pixels[:, :, 2] / 256 - 32768
        row = (ty - top) * 256
        col = (tx - left) * 256
        mosaic[row : row + 256, col : col + 256] = values
        tiles.append(
            {
                "file": name,
                "url": url,
                "sha256": hashlib.sha256(f.read_bytes()).hexdigest(),
            }
        )
u, v = gx - ix, gy - iy
i, j = ix - left * 256, iy - top * 256
raw = (1 - v) * ((1 - u) * mosaic[j, i] + u * mosaic[j, i + 1]) + v * (
    (1 - u) * mosaic[j + 1, i] + u * mosaic[j + 1, i + 1]
)
anchor = raw[len(axis) // 2, len(axis) // 2]
ring = json.loads((OUT / "plot-20.geojson").read_text())["geometry"]["coordinates"][0]
footprint = Polygon([to_local(*point) for point in ring])
d = distance(points(x, z), footprint)
# Every grid vertex contributing to any point on the parcel must be level.
w = np.clip((d - math.sqrt(2) * STEP) / 60, 0, 1)
rel = (raw - anchor) * w * w * (3 - 2 * w)
assert np.max(abs(rel)) < 327
encoded = np.rint(rel * 100).astype("<i2")
file = OUT / "elevation.i16"
file.write_bytes(encoded.tobytes())
meta = {
    "file": "elevation.i16",
    "axisOrder": "row Z, column X",
    "unitsPerCountM": 0.01,
    "diagonal": "(x0,z0) to (x1,z1)",
    "radius": RADIUS,
    "step": STEP,
    "width": len(axis),
    "geodeticOrigin": [LON, LAT],
    "eastXZ": EAST,
    "northXZ": NORTH,
    "anchorElevationM": round(float(anchor), 3),
    "rawElevationRangeM": [round(float(raw.min()), 3), round(float(raw.max()), 3)],
    "sceneRangeM": [float(encoded.min()) * 0.01, float(encoded.max()) * 0.01],
    "reference": "SRTM/EGM96 orthometric metres relative to the interpolated origin. No surveyed finished floor level is available.",
    "pad": {
        "level": "Published parcel plus one grid diagonal; 60m smooth transition to DEM.",
        "dataDatum": "native relative height at the registered origin",
    },
    "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
}
dump(OUT / "elevation.json", meta)
dump(
    cache / "index.json",
    {"format": "Mapzen Terrarium RGB", "zoom": ZOOM, "tiles": tiles},
)
print(
    len(tiles),
    "source tiles;",
    meta["width"],
    "x",
    meta["width"],
    "grid;",
    meta["anchorElevationM"],
    "m origin;",
    meta["rawElevationRangeM"],
)
