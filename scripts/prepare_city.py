"""Generate a north-up regional image for the interactive location map from the March 2025 Sentinel-2 scene."""
from pathlib import Path
import json
import rasterio
from rasterio.vrt import WarpedVRT
from rasterio.transform import from_bounds
from rasterio.enums import Resampling
from PIL import Image
import numpy as np

root = Path(__file__).resolve().parents[1] / 'dist'
bounds = [78.200, 17.200, 78.735, 17.605]
west, south, east, north = bounds
source = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/44/Q/KE/2025/3/S2A_44QKE_20250315_0_L2A/TCI.tif'
w,h = 1800,1430
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'), rasterio.open(source) as raw:
    with WarpedVRT(raw,crs='EPSG:4326',transform=from_bounds(*bounds,w,h),width=w,height=h,resampling=Resampling.bilinear) as image:
        rgb = np.moveaxis(image.read([1,2,3]),0,2)
Image.fromarray(rgb).save(root/'assets/geography/hyderabad-region.webp',quality=84)
scene=json.loads((root/'assets/scene-map.json').read_text())
def local_corner(x,z):
    lng=scene['location']['lon']+(x*scene['eastXZ'][0]+z*scene['eastXZ'][1])/(111320*np.cos(np.radians(scene['location']['lat'])))
    lat=scene['location']['lat']+(x*scene['northXZ'][0]+z*scene['northXZ'][1])/111320
    return [round(lng,8),round(lat,8)]
project=scene['location']
data={'id':'plot-20','address':'Brigade Barcelona, Plot No 20, Neopolis, Kokapet, Hyderabad, Telangana 500075, India.','sourcePage':6,'status':'published HMDA parcel; approximate tower siting','projectCenter':[project['lon'],project['lat']],'northXZ':scene['northXZ'],'eastXZ':scene['eastXZ'],'boundary':'assets/geography/plot-20.geojson','context':'assets/geography/kokapet.geojson','region':{'image':'assets/geography/hyderabad-region.webp','corners':[[west,north],[east,north],[east,south],[west,south]],'center':[(east+west)/2,(north+south)/2]},'neighborhood':{'image':'assets/geography/kokapet-color.webp','corners':[local_corner(x,z) for x,z in [(-6400,-6400),(6400,-6400),(6400,6400),(-6400,6400)]]},'attribution':'Contains modified Copernicus Sentinel data (2025). © OpenStreetMap contributors.','sourceAsset':source}
(root/'data/location.json').write_text(json.dumps(data,indent=2)+'\n')
