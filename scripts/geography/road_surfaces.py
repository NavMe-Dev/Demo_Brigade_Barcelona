"""Compile OSM surface roads into parcel-clipped, terrain-cell polygons."""
from collections import Counter, defaultdict
import gzip
import json
import math
import struct

from shapely import intersection, union_all
from shapely.geometry import LineString, Point, Polygon, box, shape
from shapely.ops import transform, substring
from shapely.strtree import STRtree

from geoframe import OUT, SOURCES, dump, to_local, to_wgs

SOURCE = SOURCES / 'building-context/infrastructure-overpass.json.gz'
DEST = OUT / 'roads'
TILE = 256
WIDTHS = {'motorway': 8.0, 'trunk': 8.0, 'primary': 8.0, 'secondary': 7.0,
          'tertiary': 7.0, 'residential': 5.5, 'unclassified': 5.0, 'service': 3.8,
          'footway': 1.65, 'cycleway': 2.2, 'path': 1.35}
FRONT = 1183681598
KINDS = ('median', 'verge', 'road', 'path', 'driveway', 'marking', 'showcaseMarking')
DETAIL_RADIUS = 250
NEIGHBORHOOD_RADIUS = 1000
REGION_RADIUS = 5000


def numeric(value):
    try:
        return float(value.strip().removesuffix(' m'))
    except (ValueError, AttributeError):
        return None


def polygons(geometry):
    if not geometry.is_empty:
        if geometry.geom_type == 'Polygon':
            yield geometry
        elif hasattr(geometry, 'geoms'):
            for part in geometry.geoms:
                yield from polygons(part)


def buffer(line, width):
    return line.buffer(width / 2, quad_segs=2, cap_style=1, join_style=1)


def nearby_building_footprints(area):
    directory = OUT / 'buildings'
    index = json.loads((directory / 'index.json').read_text())
    footprints = []
    for tile in index['tiles']:
        if not box(*tile['bbox']).intersects(area):
            continue
        ox, oz = (value * index['tileSize'] for value in tile['tile'])
        data = (directory / tile['file']).read_bytes()
        if len(data) != tile['bytes'] or data[:4] != b'BBF1':
            raise ValueError(f"Invalid neighboring footprint tile {tile['file']}")
        cursor = 8
        for _ in range(tile['count']):
            _, _, _, parts = struct.unpack_from('<HBBH', data, cursor)
            cursor += 6
            for _ in range(parts):
                ring_count, = struct.unpack_from('<H', data, cursor)
                cursor += 2
                rings = []
                for _ in range(ring_count):
                    count, = struct.unpack_from('<H', data, cursor)
                    cursor += 2
                    end = cursor + count * 4
                    rings.append([(ox+x/10, oz+z/10) for x,z in
                                  struct.iter_unpack('<hh', data[cursor:end])])
                    cursor = end
                footprint = Polygon(rings[0], rings[1:])
                if footprint.intersects(area):
                    footprints.append(footprint)
        if cursor != len(data):
            raise ValueError(f"Incomplete neighboring footprint tile {tile['file']}")
    return union_all(footprints).buffer(.10)


def build():
    DEST.mkdir(parents=True, exist_ok=True)
    with gzip.open(SOURCE) as file:
        osm = json.load(file)
    parcel = transform(to_local, shape(json.loads((OUT / 'plot-20.geojson').read_text())['geometry']))
    terrain = json.loads((OUT / 'elevation.json').read_text())
    step = terrain['step']
    assert TILE % step == 0 and terrain['radius'] % step == 0
    region = Point(0, 0).buffer(REGION_RADIUS, quad_segs=32)
    detail = Point(0, 0).buffer(DETAIL_RADIUS)
    near_buildings = nearby_building_footprints(Point(0,0).buffer(NEIGHBORHOOD_RADIUS))
    if near_buildings.is_empty:
        raise ValueError('No surrounding building footprints were loaded')
    entries = defaultdict(list)
    measured = Counter()
    frontage = None
    ways = {}
    for way in osm['elements']:
        tags = way.get('tags', {})
        road_class = tags.get('highway')
        coords = way.get('geometry')
        if (road_class not in WIDTHS or not coords or len(coords) < 2
                or tags.get('area') == 'yes' or tags.get('bridge', 'no') != 'no'
                or tags.get('tunnel', 'no') != 'no' or tags.get('layer', '0') not in ('0', '0.0')):
            continue
        line = LineString([to_local(p['lon'], p['lat']) for p in coords])
        if not line.intersects(region):
            continue
        path = road_class in ('footway', 'cycleway', 'path')
        width, lanes = numeric(tags.get('width')), numeric(tags.get('lanes'))
        if width is not None and .65 <= width <= 32:
            measured['taggedWidth'] += 1
        elif not path and lanes is not None and 1 <= lanes <= 8:
            width = lanes * (3.2 if road_class in ('motorway', 'trunk', 'primary', 'secondary') else 2.95)
            measured['taggedLaneEstimate'] += 1
        else:
            width = WIDTHS[road_class]
            measured['classEstimate'] += 1
        kind = 'path' if path else 'road'
        surface = buffer(line, width).difference(parcel.buffer(.12)).intersection(region)
        if surface.is_empty:
            continue
        entries[kind].append(surface)
        ways[way['id']] = line
        if way['id'] == FRONT:
            frontage = line
        if not path and lanes and lanes >= 2 and line.intersects(detail):
            close = line.intersection(detail)
            for part in ([close] if close.geom_type == 'LineString' else getattr(close, 'geoms', [])):
                if part.geom_type != 'LineString':
                    continue
                for start in range(7, int(part.length) - 7, 11):
                    entries['marking'].append(buffer(substring(part, start, start + 3.4), .12).intersection(surface))
    if frontage is None:
        raise ValueError('The mapped near carriageway is absent')
    masterplan = json.loads((OUT.parent / 'amenity-plans.json').read_text())['sections'][0]
    features = {item['id']: item for item in masterplan['features']}
    gates = [features[key]['locations'][0]['world'] for key in ('masterplan-01', 'masterplan-02')]
    access = []
    for x, _, z in gates:
        gate = Point(x, z)
        join = frontage.interpolate(frontage.project(gate))
        approach = LineString([(x+5, z-11), gate.coords[0], join.coords[0]])
        entries['driveway'].append(buffer(approach, 4.25))
        access.append({'traceXZ': [list(p) for p in approach.coords], 'tieInWGS84': list(to_wgs(*join.coords[0]))})
    median_sides = []
    for way_id in (FRONT, 213838287):
        center = ways[way_id]
        local = center.intersection(Point(0, 35).buffer(170))
        if local.geom_type != 'LineString':
            continue
        entries['verge'].append(buffer(local, 10.0).difference(parcel.buffer(.05)))
        median_sides.append(buffer(local, 23.5))
        for start in range(8, int(local.length) - 8, 11):
            entries['showcaseMarking'].append(buffer(substring(local, start, start+3.1), .14))
    if len(median_sides) == 2:
        entries['median'].append(median_sides[0].intersection(median_sides[1]).difference(parcel))
    layers = {kind: (entries[kind], STRtree(entries[kind])) for kind in KINDS}
    tiles = []
    bundles = {key: bytearray() for key in ('frontage', 'neighborhood', 'region')}
    origin = Point(0, 0)
    scale = 100
    for ix in range(-math.ceil(REGION_RADIUS / TILE), math.ceil(REGION_RADIUS / TILE)):
        for iz in range(-math.ceil(REGION_RADIUS / TILE), math.ceil(REGION_RADIUS / TILE)):
            x, z = ix*TILE, iz*TILE
            tile = box(x, z, x+TILE, z+TILE)
            if tile.distance(origin) > REGION_RADIUS:
                continue
            surfaces = {}
            for kind, (items, index) in layers.items():
                candidates = index.query(tile, predicate='intersects')
                if len(candidates):
                    joined = intersection(union_all([items[i] for i in candidates]), tile)
                    surfaces[kind] = joined.difference(near_buildings) if tile.intersects(near_buildings) else joined
            if not surfaces:
                continue
            if 'road' in surfaces:
                for kind in ('path', 'driveway', 'verge', 'median'):
                    if kind in surfaces:
                        surfaces[kind] = surfaces[kind].difference(surfaces['road'])
                for kind in ('marking', 'showcaseMarking'):
                    if kind in surfaces:
                        surfaces[kind] = surfaces[kind].intersection(surfaces['road'])
            if 'median' in surfaces:
                for kind in ('path', 'driveway', 'verge'):
                    if kind in surfaces:
                        surfaces['median'] = surfaces['median'].difference(surfaces[kind])
            if 'driveway' in surfaces and 'verge' in surfaces:
                surfaces['verge'] = surfaces['verge'].difference(surfaces['driveway'])
            cell_triangles = []
            for a in range(x, x + TILE, step):
                for b in range(z, z + TILE, step):
                    p, q, r, s = (a,b), (a+step,b), (a+step,b+step), (a,b+step)
                    cell_triangles.extend([Polygon((p,q,r)), Polygon((p,r,s))])
            output = bytearray(b'BBR1')
            size = 0
            for kind in KINDS:
                pieces = []
                if kind in surfaces:
                    for patch in intersection(cell_triangles, surfaces[kind]):
                        for poly in polygons(patch):
                            if poly.area < .0005:
                                continue
                            rings = []
                            for ring in (poly.exterior, *poly.interiors):
                                ring_points = [(round((a-x)*scale), round((b-z)*scale)) for a,b in ring.coords[:-1]]
                                ring_points = [p for i,p in enumerate(ring_points) if p != ring_points[i-1]]
                                if len(ring_points) > 2:
                                    rings.append(ring_points)
                                elif not rings:
                                    break
                            if rings:
                                pieces.append(rings)
                output.extend(struct.pack('<I', len(pieces)))
                size += len(pieces)
                for rings in pieces:
                    output.extend(struct.pack('<H', len(rings)))
                    for ring in rings:
                        output.extend(struct.pack('<H', len(ring)))
                        for p in ring:
                            output.extend(struct.pack('<HH', *p))
            if size:
                identifier = f'{ix}_{iz}'
                near = -TILE <= x < TILE and -TILE <= z < TILE
                bundle = 'frontage' if near else 'neighborhood' if tile.distance(origin) < NEIGHBORHOOD_RADIUS else 'region'
                tiles.append([identifier, x, z, len(output), bundle, len(bundles[bundle])])
                bundles[bundle].extend(output)
    for key, data in bundles.items():
        (DEST / f'{key}.bin').write_bytes(data)
    if frontage.intersection(near_buildings).length > .015:
        raise ValueError('The verified frontage centerline crosses a mapped footprint')
    near_neighbors = []
    for way_id, line in ways.items():
        if way_id != FRONT and any(line.distance(Point(p)) < .12 for p in frontage.coords):
            near_neighbors.append(way_id)
    dump(DEST/'index.json', {'format':'BBR1', 'tileSize':TILE, 'scaleM':.01, 'layers':list(KINDS),
         'detailZonesM':[DETAIL_RADIUS, NEIGHBORHOOD_RADIUS, REGION_RADIUS],
         'footprintClearanceM':.10, 'footprintMaskRadiusM':NEIGHBORHOOD_RADIUS, 'tiles':tiles,
         'osmTimestamp':osm['osm3s']['timestamp_osm_base'], 'widthEvidence':dict(measured),
         'frontageWay':FRONT, 'frontageLengthM':round(frontage.length, 2),
         'connectedWayIds':sorted(near_neighbors), 'illustrativeAccess':access})
    print(len(tiles), sum(tile[3] for tile in tiles), 'bytes, frontage connects to', sorted(near_neighbors))


if __name__ == '__main__':
    build()
