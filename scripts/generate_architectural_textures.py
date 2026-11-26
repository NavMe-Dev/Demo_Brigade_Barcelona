"""Generate authored tileable architectural PBR maps with Pillow."""
import math
from pathlib import Path
import random
from PIL import Image

DESTINATION = Path(__file__).resolve().parents[1] / 'dist/assets/textures/architecture'
SIZE = 128
SURFACES = {
    'ivory': ((213, 191, 160), .79, 0, 4),
    'terracotta': ((139, 73, 51), .82, 0, 6),
    'copper': ((153, 91, 57), .46, .48, 9),
    'paving': ((176, 162, 139), .87, 0, 10),
}

def byte(value):
    return round(max(0, min(255, value)))

def maps(name, color, roughness, metalness, strength):
    rng = random.Random(name)
    heights = []
    pixels = []
    for y in range(SIZE):
        for x in range(SIZE):
            u, v = math.tau * x / SIZE, math.tau * y / SIZE
            cloud = .44*math.sin(3*u + 2*v) + .27*math.cos(5*u - 3*v) + .29*math.sin(2*u + 8*v)
            grain = rng.uniform(-1, 1)
            height = .5 + .13*cloud + .08*grain
            if name == 'paving':
                joint = min(abs(math.sin(4*u+v)), abs(math.sin(4*v))) < .14
                height -= .19 * joint
            heights.append(height)
            tone = strength * (.62*cloud+.38*grain) + (height-.5)*14
            pixels.append(tuple(byte(channel + tone) for channel in color))

    def height_at(x, y):
        return heights[(y % SIZE)*SIZE + x % SIZE]

    normals = []
    orm = []
    for y in range(SIZE):
        for x in range(SIZE):
            h = height_at(x, y)
            dx = (height_at(x-1,y) - height_at(x+1,y)) * .58
            dy = (height_at(x,y+1) - height_at(x,y-1)) * .58
            length = math.sqrt(dx*dx + dy*dy + 1)
            normals.append(tuple(byte((component/length*.5+.5)*255) for component in (dx, dy, 1)))
            orm.append((byte(255*(.94+.12*(h-.5))), byte(255*(roughness+(.5-h)*.13)), byte(metalness*255)))
    for map_name, data in [('base-color', pixels), ('normal', normals), ('orm', orm)]:
        image = Image.new('RGB', (SIZE, SIZE))
        image.putdata(data)
        image.save(DESTINATION / f'{name}-{map_name}.png', optimize=True)

if __name__ == '__main__':
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for material, surface in SURFACES.items():
        maps(material, *surface)
