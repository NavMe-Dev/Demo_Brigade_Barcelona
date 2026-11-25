"""Read public ArcGIS metadata and spatial indices at the registered parcel, with no credentials or imagery downloads.

python3 scripts/probe_esri_coverage.py [--output /tmp/coverage.json]
"""
import argparse
import concurrent.futures
import functools
import gzip
import heapq
import json
import math
from pathlib import Path
import subprocess
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
anchor = json.loads((ROOT / 'dist/assets/scene-map.json').read_text())['location']
LON, LAT = anchor['lon'], anchor['lat']
IMAGERY = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
KEYED = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer'
ELEVATION = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'
PORTAL = 'https://www.arcgis.com/sharing/rest'
SCENES = 'https://basemaps3d.arcgis.com/arcgis/rest/services/'


def get(url, **params):
    url += '?' + urlencode({'f': 'json', **params})
    raw = subprocess.run(['curl', '-sSL', '--compressed', '--max-time', '18', '--', url],
                         check=True, capture_output=True).stdout
    if raw.startswith(b'\x1f\x8b'):
        raw = gzip.decompress(raw)
    return json.loads(raw)


def tile(z):
    n = 2 ** z
    return int((LON + 180) * n / 360), int((1 - math.asinh(math.tan(math.radians(LAT))) / math.pi) * n / 2)


def cache_flags(url):
    def flag(z):
        x, y = tile(z)
        return z, get(f'{url}/tilemap/{z}/{y}/{x}/1/1').get('data', [None])[0]
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        return dict(pool.map(flag, range(12, 24)))


def point_query(url, fields='*'):
    features = get(url + '/query', geometry=f'{LON},{LAT}', geometryType='esriGeometryPoint', inSR=4326,
                   spatialRel='esriSpatialRelIntersects', outFields=fields, returnGeometry='false')
    return [f['attributes'] for f in features['features']] if 'features' in features else features


def xyz(lon, lat, altitude):
    lat, lon = map(math.radians, (lat, lon))
    e2 = 0.0066943799901413165
    n = 6378137 / math.sqrt(1 - e2 * math.sin(lat) ** 2)
    return ((n + altitude) * math.cos(lat) * math.cos(lon), (n + altitude) * math.cos(lat) * math.sin(lon),
            (n * (1 - e2) + altitude) * math.sin(lat))


def scene_index(service):
    url = SCENES + service + '/SceneServer/layers/0'
    layer = get(url)
    if 'error' in layer:
        return layer
    size = layer['nodePages']['nodesPerPage']
    @functools.lru_cache(maxsize=160)
    def page(number):
        return get(url + f'/nodepages/{number}')['nodes']
    site = xyz(LON, LAT, 600)
    queue = [(0, 0)]
    tested = set()
    examples = []
    while queue and page.cache_info().misses < 260:
        _, index = heapq.heappop(queue)
        if index in tested:
            continue
        tested.add(index)
        node = page(index // size)[index % size]
        obb = node['obb']
        center = xyz(*obb['center'])
        distance = math.dist(center, site)
        radius = math.hypot(*obb['halfSize'])
        # Conservative bounding sphere around the OBB. Include margin for unknown orthometric offset.
        if distance - radius > 5100:
            continue
        mesh = node.get('mesh', {})
        if mesh and distance + radius < 5000:
            examples.append(dict(index=index, center=obb['center'], radiusM=round(radius),
                                 distanceM=round(distance), mesh=mesh))
            if len(examples) >= 2:
                break
        for child in node.get('children', []):
            heapq.heappush(queue, (distance - radius, child))
    return {'layerType': layer['layerType'], 'copyright': layer.get('copyrightText'),
            'textureSetCount': len(layer.get('textureSetDefinitions', [])),
            'geometryAttributes': [buf.get('compressedAttributes', {}).get('attributes', [])
                for definition in layer.get('geometryDefinitions', []) for buf in definition['geometryBuffers']],
            'examplesInside5km': examples,
            'indexPagesRead': page.cache_info().misses, 'testedNodes': len(tested), 'searchExhausted': not queue}


def mesh_catalog():
    local = get(PORTAL + '/search', q='(Hyderabad OR Kokapet OR Neopolis) AND type:"Scene Service"', num=75)
    broad = get(PORTAL + '/search', q='type:"Scene Service" AND (integratedmesh OR "integrated mesh")',
                bbox=f'{LON-.05},{LAT-.05},{LON+.05},{LAT+.05}', num=75)
    candidates = []
    for item in broad.get('results', []):
        if not item.get('url'):
            continue
        url = item['url'].rstrip('/')
        if '/layers/' not in url: url += '/layers/0'
        try:
            layer = get(url)
            extent = layer.get('store', {}).get('extent') or layer.get('fullExtent')
            candidates.append(dict(id=item['id'], title=item['title'], type=layer.get('layerType'),
                                   extent=extent, error=layer.get('error', {}).get('code')))
        except (ValueError, subprocess.SubprocessError):
            candidates.append(dict(id=item['id'], title=item['title'], error='Unreadable index'))
    return {'namedLocalSceneCount': local.get('total'), 'envelopeCandidates': candidates}


def elevation_sources():
    item = get(PORTAL + '/content/items/3af669838f594b378f90c10f98e46a7f')
    url = item['url'].rstrip('/')
    meta = get(url)
    layers = meta.get('layers', [{'id': 0}]); result = {}
    for layer in layers:
        attrs = point_query(url + '/' + str(layer['id']))
        if isinstance(attrs, list):
            result[layer.get('name', str(layer['id']))] = [{k: v for k, v in a.items() if k in {
                'PixelSize', 'ProductName', 'VerticalDatum', 'Source', 'ProductDate', 'DataSource', 'Meters', 'OrgName'}} for a in attrs]
    return {'url': url, 'matches': result}


def run():
    tasks={'imageryCitation':lambda:point_query(IMAGERY+'/4','NICE_NAME,NICE_DESC,SRC_DESC,SRC_DATE,SRC_RES,SRC_ACC,MinMapLevel,MaxMapLevel,BlockName,ReleaseName'),
           'imageryCache':lambda:cache_flags(IMAGERY), 'elevationCache':lambda:cache_flags(ELEVATION),
           'developerEndpoint':lambda:get(KEYED).get('error',{}), 'elevationSources':elevation_sources,
           'meshCatalog':mesh_catalog}
    for name in ['Open3D_Buildings_v1','OpenStreetMap3D_Buildings_v1','Esri3D_Buildings_v1']:
        tasks[name] = functools.partial(scene_index, name)
    with concurrent.futures.ThreadPoolExecutor(6) as pool:
        futures = {key: pool.submit(fn) for key,fn in tasks.items()}
        result = {'point': [LON, LAT]}
        for key,future in futures.items():
            try: result[key]=future.result()
            except (ValueError, KeyError, subprocess.SubprocessError) as error: result[key]={'probeError':str(error)}
    return result


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    data=json.dumps(run(),indent=2)+'\n'
    if args.output: args.output.write_text(data)
    else: print(data,end='')
