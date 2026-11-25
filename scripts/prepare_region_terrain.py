"""Sample the open Terrarium elevation mosaic over the same WGS84 bounds as the regional image."""
from pathlib import Path
import math, json, urllib.request
from PIL import Image

root = Path(__file__).resolve().parents[1]
data = json.loads((root/'dist/data/location.json').read_text())
out = root/'dist/assets/geography/region-dem.json'
cache = root/'sources/geography/region-terrain'
cache.mkdir(exist_ok=True)
images = {}
def sample(lon,lat):
    scale = 2**9 * 256
    px = (lon+180)/360*scale-.5
    py = (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*scale-.5
    x,y = math.floor(px),math.floor(py)
    total = 0
    for ix in (x,x+1):
        for iy in (y,y+1):
            tx,ty = ix//256,iy//256
            if (tx,ty) not in images:
                path = cache/f'9-{tx}-{ty}.png'
                if not path.exists():
                    url=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/9/{tx}/{ty}.png'
                    with urllib.request.urlopen(url,timeout=30) as response: path.write_bytes(response.read())
                images[tx,ty]=Image.open(path).convert('RGB')
            r,g,b = images[tx,ty].getpixel((ix%256,iy%256))
            total+=(r*256+g+b/256-32768)*(1-abs(ix-px))*(1-abs(iy-py))
    return round(total)
(west,north),(_,_),(east,south),(_,_) = data['region']['corners']
cols,rows=101,81
heights=[sample(west+(east-west)*i/(cols-1),north+(south-north)*j/(rows-1)) for j in range(rows) for i in range(cols)]
out.write_text(json.dumps({'source':'Mapzen Terrain Tiles / AWS, Terrarium zoom 9, metres','cols':cols,'rows':rows,'heights':heights},separators=(',',':'))+'\n')
print(len(heights),'regional elevation samples;',min(heights),'to',max(heights),'metres')
