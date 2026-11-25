"""Partition the registered, 10 m Copernicus crop for progressive, offline-safe display."""
import json
import math
from pathlib import Path
from PIL import Image, ImageTransform

folder = Path(__file__).resolve().parents[1] / 'dist/assets/geography'
output = folder / 'sentinel'
output.mkdir(exist_ok=True)
with Image.open(folder / 'kokapet-color.webp') as source:
    assert source.size == (1280, 1280)
    source.resize((320, 320), Image.Resampling.LANCZOS).save(output / 'overview.webp', quality=87)
    for row in range(5):
        for column in range(5):
            # Include a one-pixel gutter from adjacent source pixels for linear filtering.
            left, top = column * 256, row * 256
            tile = Image.new('RGB', (258, 258))
            for x in range(258):
                sx = min(1279, max(0, left + x - 1))
                tile.paste(source.crop((sx, top, sx + 1, top + 256)), (x, 1))
                tile.putpixel((x, 0), source.getpixel((sx, max(0, top - 1))))
                tile.putpixel((x, 257), source.getpixel((sx, min(1279, top + 256))))
            tile.save(output / f'{row}-{column}.webp', lossless=True, method=5)

# The local 10 m crop ends at 6.4 km. Sample the separately registered regional
# image at 32 m only for the DEM ring reaching 7.168 km per axis.
root = folder.parents[1]
geo = json.loads((root / 'data/location.json').read_text())
west, north = geo['region']['corners'][0]
east, south = geo['region']['corners'][2]
lon0, lat0 = geo['projectCenter']
east_x, east_z = geo['eastXZ']
north_x, north_z = geo['northXZ']
radius = json.loads((folder / 'elevation.json').read_text())['radius']
size = round(2 * radius / 32)
with Image.open(root / geo['region']['image']) as region:
    def pixel(col, row):
        x = -radius + col * 2 * radius / size
        z = -radius + row * 2 * radius / size
        lon = lon0 + (x * east_x + z * east_z) / (111320 * math.cos(math.radians(lat0)))
        lat = lat0 + (x * north_x + z * north_z) / 111320
        return ((lon-west)/(east-west)*region.width,(north-lat)/(north-south)*region.height)
    a, b = pixel(0, 0)
    dx, dy = pixel(1, 0)
    ex, ey = pixel(0, 1)
    affine = ImageTransform.AffineTransform((dx-a,ex-a,a,dy-b,ey-b,b))
    region.transform((size,size), affine, resample=Image.Resampling.BILINEAR).save(output/'horizon.webp',quality=90)
