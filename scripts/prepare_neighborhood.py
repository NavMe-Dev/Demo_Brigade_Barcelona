"""Prepare offline map features and a terrain grid. Python, Shapely 2 and Pillow.

Fetch the map API bbox and four Terrarium tiles listed in the asset manifest.
Usage: python scripts/prepare_neighborhood.py map.osm /path/to/tiles
Tile files are named brigade-dem-X-Y.png.
"""
import json
import math
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

from PIL import Image
from shapely.geometry import LineString, Polygon, box, mapping

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/assets/geography'
OUT.mkdir(parents=True, exist_ok=True)
osm = ET.parse(sys.argv[1])
tiles = Path(sys.argv[2])
scene = json.loads((ROOT / 'dist/assets/scene-map.json').read_text())
lat0, lon0 = scene['location']['lat'], scene['location']['lon']
north, east = scene['northXZ'], scene['eastXZ']
bounds = (78.304, 17.394, 78.324, 17.413)
clip = box(*bounds)
nodes = {n.get('id'): (float(n.get('lon')), float(n.get('lat'))) for n in osm.findall('node')}
features = []
for way in osm.findall('way'):
    tags = {t.get('k'): t.get('v') for t in way.findall('tag')}
    points = [nodes[n.get('ref')] for n in way.findall('nd')]
    kind = next((k for k in ('building', 'highway', 'natural', 'landuse', 'leisure') if k in tags), None)
    if not kind or len(points) < 2:
        continue
    if kind == 'highway':
        geom = LineString(points)
    elif len(points) >= 4 and points[0] == points[-1]:
        geom = Polygon(points)
        if not geom.is_valid:
            geom = geom.buffer(0)
    else:
        continue
    result = geom.intersection(clip).simplify(0.000004)
    for part in getattr(result, 'geoms', [result]):
        if part.is_empty or part.geom_type not in ('Polygon', 'LineString'):
            continue
        keys = ('building', 'height', 'building:levels', 'name', 'highway', 'lanes', 'natural', 'landuse', 'leisure', 'water', 'layer')
        features.append({'type': 'Feature', 'id': int(way.get('id')), 'geometry': mapping(part),
                         'properties': {k: tags[k] for k in keys if k in tags}})
geodata = {'type': 'FeatureCollection', 'copyright': '© OpenStreetMap contributors', 'license': 'https://opendatacommons.org/licenses/odbl/1-0/', 'bbox': bounds, 'features': features}
(OUT / 'kokapet.geojson').write_text(json.dumps(geodata, separators=(',', ':')) + '\n')

raster = {}
step, radius = 40, 1600
def elevation(x, z):
    e, n = x*east[0] + z*east[1], x*north[0] + z*north[1]
    lat, lon = lat0 + n/111320, lon0 + e/(111320*math.cos(math.radians(lat0)))
    tx, ty = (lon+180)/360*8192, (1-math.asinh(math.tan(math.radians(lat)))/math.pi)*4096
    key = int(tx), int(ty)
    if key not in raster:
        raster[key] = Image.open(tiles / ('brigade-dem-%d-%d.png' % key)).convert('RGB')
    r,g,b = raster[key].getpixel((int(tx*256)%256, int(ty*256)%256))
    return round(r*256+g+b/256-32768, 2)
dem = {'step': step, 'radius': radius, 'datum': 'Mapzen Terrarium terrain grid, metres',
       'elevation': [[elevation(x, z) for x in range(-radius, radius+1, step)] for z in range(-radius, radius+1, step)]}
(OUT / 'terrain-grid.json').write_text(json.dumps(dem, separators=(',', ':'))+'\n')
print(len(features), 'OSM features;', len(dem['elevation'])**2, 'terrain samples')
