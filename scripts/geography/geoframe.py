"""Project coordinates used by the existing metre-scale architecture and the new extract."""

import json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "dist/assets/geography"
SOURCES = ROOT / "sources/geography"
SCENE = json.loads((ROOT / "dist/assets/scene-map.json").read_text())
LON, LAT = SCENE["location"]["lon"], SCENE["location"]["lat"]
EAST, NORTH = SCENE["eastXZ"], SCENE["northXZ"]
LON_METRES = 111320 * math.cos(math.radians(LAT))


def to_local(lon, lat):
    e, n = (lon - LON) * LON_METRES, (lat - LAT) * 111320
    return e * EAST[0] + n * NORTH[0], e * EAST[1] + n * NORTH[1]


def to_wgs(x, z):
    return LON + (x * EAST[0] + z * EAST[1]) / LON_METRES, LAT + (
        x * NORTH[0] + z * NORTH[1]
    ) / 111320


def dump(file, data):
    file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
