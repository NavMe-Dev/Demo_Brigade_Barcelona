"""Annotate the six supplied screenshots and assemble the comparison plates."""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'qa/evidence/architectural-comparison'
SOURCES = ROOT / 'dist/data/architectural-reference-manifest.json'
# Original screenshot pixel coordinates. Crops omit the viewer chrome.
ANNOTATIONS = {
    'complete-exterior': (
        (630,179,1143,920),
        [(936,204,'Stepped terracotta crown'), (1017,476,'Ivory balcony stacks'),
         (769,723,'Warm lower façade'), (974,871,'Planted podium')]),
    'facade-crown': (
        (12,38,364,787),
        [(262,169,'Brigade sign panel'), (313,114,'Stepped cornice'),
         (297,331,'Deep narrow window bays'), (63,180,'Open roof loggia')]),
    'clubhouse': (
        (508,400,1241,916),
        [(770,501,'Transparent pool edge'), (1120,506,'Raked glazing'),
         (915,565,'Recessed terrace'), (1068,710,'Copper fascia and panel joints')]),
    'sky-deck': (
        (416,330,959,920),
        [(867,405,'Ivory lintel and cornice'), (562,615,'Illuminated garden spheres'),
         (742,606,'Layered planting'), (802,702,'Boulder in raised island')]),
    'eco-deck': (
        (416,151,960,920),
        [(702,230,'Projecting ivory frame'), (622,333,'Fire feature'),
         (654,420,'Curved timber seating'), (645,752,'Terracotta paving inlay')]),
    'podium': (
        (645,141,1275,926),
        [(966,351,'Projecting ivory colonnade'), (725,531,'Perforated red screen'),
         (814,453,'Cascading planting'), (953,740,'Recessed vertical joints')]),
}

def font(size):
    try:
        return ImageFont.truetype('Arial.ttf', size)
    except OSError:
        return ImageFont.load_default(size=size)

def annotated(source, area, markers):
    picture = source.crop(area).convert('RGB')
    width, height = picture.size
    footer = 126
    plate = Image.new('RGB',(width,height+footer),'#f2eee6')
    plate.paste(picture,(0,0))
    draw = ImageDraw.Draw(plate)
    for index, (x,y,label) in enumerate(markers,1):
        x -= area[0]
        y -= area[1]
        draw.ellipse((x-13,y-13,x+13,y+13), fill='#18312d', outline='#f9f3e5',width=2)
        draw.text((x,y),str(index),fill='white',font=font(15),anchor='mm')
        draw.text((15,height+9+27*(index-1)),f'{index}. {label}',fill='#22312b',font=font(16))
    return plate

def compare(name, reference):
    canvas = Image.new('RGB',(1800,730),'#f2eee6')
    draw = ImageDraw.Draw(canvas)
    labels = ['Supplied reference','Three.js browser','Blender Cycles']
    photos = [reference,*[Image.open(EVIDENCE / f'{name}-{engine}.jpg')
                          for engine in ('browser','cycles')]]
    for index, (label, photo) in enumerate(zip(labels,photos)):
        x = 26+index*592
        draw.text((x,18),label,fill='#22312b',font=font(27))
        photo = ImageOps.contain(photo,(566,642))
        canvas.paste(photo,(x+(566-photo.width)//2,65+(642-photo.height)//2))
    canvas.save(EVIDENCE / f'{name}-comparison.jpg',quality=92)

if __name__ == '__main__':
    EVIDENCE.mkdir(parents=True,exist_ok=True)
    for view in json.loads(SOURCES.read_text())['views']:
        name = view['id']
        source = Image.open(ROOT / view['screenshot'])
        area, markers = ANNOTATIONS[name]
        annotation = annotated(source,area,markers)
        annotation.save(EVIDENCE / f'{name}-annotated.jpg',quality=93)
        if all((EVIDENCE / f'{name}-{engine}.jpg').exists() for engine in ('browser','cycles')):
            compare(name,source.crop(area))
