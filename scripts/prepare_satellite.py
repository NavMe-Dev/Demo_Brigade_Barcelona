"""Rebuild the local scene-aligned 12.8 km Sentinel-2 terrain texture (rasterio, numpy, Pillow)."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
import rasterio
from rasterio.transform import rowcol
from rasterio.warp import transform
from rasterio.windows import Window

assets = Path(__file__).resolve().parents[1] / 'dist' / 'assets'
scene = json.loads((assets / 'scene-map.json').read_text())
location = scene['location']
source = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/44/Q/KE/2025/3/S2A_44QKE_20250315_0_L2A/TCI.tif'
radius = 6400
samples = 1280
coords = (np.arange(samples) + 0.5) * (2 * radius / samples) - radius
x, z = np.meshgrid(coords, coords)
east = x * scene['eastXZ'][0] + z * scene['eastXZ'][1]
north = x * scene['northXZ'][0] + z * scene['northXZ'][1]
lat = location['lat'] + north / 111320
lon = location['lon'] + east / (111320 * np.cos(np.radians(location['lat'])))
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'), rasterio.open(source) as dataset:
    xx, yy = transform('EPSG:4326', dataset.crs, lon.flatten(), lat.flatten())
    rows, cols = rowcol(dataset.transform, xx, yy)
    rows = np.asarray(rows, dtype=int)
    cols = np.asarray(cols, dtype=int)
    window = Window(cols.min(), rows.min(), np.ptp(cols)+1, np.ptp(rows)+1)
    rgb = dataset.read([1,2,3], window=window)[:, rows-rows.min(), cols-cols.min()]
    image = np.moveaxis(rgb.reshape(3,samples,samples), 0, 2)
    Image.fromarray(image).save(assets/'geography'/'kokapet-color.webp', quality=90)
