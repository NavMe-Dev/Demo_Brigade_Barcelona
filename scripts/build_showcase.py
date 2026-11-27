"""Build the separate, illustrative landscape in project coordinates."""
from bisect import bisect_right
import json
import math
import os
from pathlib import Path
import random
import subprocess
import sys
import tempfile

import bpy

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/assets/showcase'
OUT.mkdir(exist_ok=True)
sys.path.insert(0, str(Path(__file__).parent))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
rng = random.Random(417)

def height(x, z):
    distance = math.hypot(x,z)
    blend = min(1, max(0, (distance-92)/330))
    low = 6*math.sin(x*.022+z*.012)*math.cos(z*.018) + 3*math.sin(z*.041)
    hills = 85*math.sin(x*.0033+1.3)**2*math.cos(z*.004)**2 + 75*math.sin(z*.003-x*.001)**2
    return -.075 + blend*blend*(low+hills*min(1,max(0,(distance-230)/590)))

def surface(name, color, image=None, normal=None, roughness=.86):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color,1)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color,1)
    bsdf.inputs['Roughness'].default_value = roughness
    if image:
        node = nodes.new('ShaderNodeTexImage')
        node.image = bpy.data.images.load(str(ROOT/image),check_existing=True)
        node.image.pack()
        links.new(node.outputs['Color'],bsdf.inputs['Base Color'])
    if normal:
        node = nodes.new('ShaderNodeTexImage')
        node.image = bpy.data.images.load(str(ROOT/normal),check_existing=True)
        node.image.colorspace_settings.name = 'Non-Color'
        node.image.pack()
        bump = nodes.new('ShaderNodeNormalMap')
        bump.inputs['Strength'].default_value = .36
        links.new(node.outputs['Color'],bump.inputs['Color'])
        links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
    return mat

assets = 'dist/assets/textures/architecture/'
grass = surface('Tropical grounds',(.18,.23,.075),assets+'grass-base-color.png',assets+'grass-normal.png')
pave = surface('Arrivals stone',(.42,.35,.25),assets+'paving-base-color.png',assets+'paving-normal.png')
asphalt = surface('Fine aggregate asphalt',(.085,.08,.075),'dist/assets/showcase/asphalt-color.webp',
                  'dist/assets/showcase/asphalt-normal.webp')
curb = surface('Warm concrete kerb',(.38,.35,.28))
paint = surface('Warm white roadway paint',(.66,.59,.43))
soil = surface('Planted ground edge',(.12,.085,.045))

def mesh(name, pts, faces, material, repeat):
    data = bpy.data.meshes.new(name)
    data.from_pydata([(x,-z,y) for x,y,z in pts],[],faces)
    data.materials.append(material)
    uv = data.uv_layers.new(name='Surface')
    for face in data.polygons:
        face.use_smooth = name == 'Showcase ground'
        for i in face.loop_indices:
            x,_,z = pts[data.loops[i].vertex_index]
            uv.data[i].uv = (x/repeat,z/repeat)
    data.update()
    obj = bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    return obj

# Denser sampling at the estate, with expanding rings of scenic hills.
axis = list(range(-2304,-360,32))+list(range(-360,361,6))+list(range(384,2305,32))
n = len(axis)
ground = [(x,height(x,z),z) for z in axis for x in axis]
faces = []
for j in range(n-1):
    for i in range(n-1):
        a = j*n+i
        faces.extend([(a,a+n,a+n+1),(a,a+n+1,a+1)])

def surface_height(x,z):
    i,j = (max(0,min(n-2,bisect_right(axis,v)-1)) for v in (x,z))
    a = (x-axis[i])/(axis[i+1]-axis[i])
    b = (z-axis[j])/(axis[j+1]-axis[j])
    nw, se = ground[j*n+i][1], ground[(j+1)*n+i+1][1]
    if a >= b:
        return nw*(1-a) + ground[j*n+i+1][1]*(a-b) + se*b
    return nw*(1-b) + ground[(j+1)*n+i][1]*(b-a) + se*a
ground_object = mesh('Showcase ground',ground,faces,grass,8)

def loop(rx,rz,offset):
    return [(rx*math.sin(i*math.tau/600),offset+rz*math.cos(i*math.tau/600)) for i in range(601)]

roads = [loop(197,182,-94),loop(575,478,-263)]

def strip(name, points, left, right, lift, material, repeat, intervals=None):
    vertices, polygons = [], []
    for i,(x,z) in enumerate(points):
        ax,az = points[max(0,i-1)]
        bx,bz = points[min(len(points)-1,i+1)]
        dx,dz = bx-ax,bz-az
        length = math.hypot(dx,dz)
        nx,nz = -dz/length,dx/length
        for width in (left,right):
            u,v = x+nx*width,z+nz*width
            vertices.append((u,surface_height(u,v)+lift,v))
        if i and (not intervals or intervals(i)):
            j = 2*(i-1)
            polygons.append((j,j+1,j+3,j+2))
    return mesh(name,vertices,polygons,material,repeat)

for i, road in enumerate(roads):
    strip('Loop carriageway '+str(i+1),road,-4.5,4.5,.11,asphalt,4)
    if i == 0:
        for side in (-1,1):
            strip('Stone footpath',road,*sorted((side*4.5,side*6.65)),.125,pave,3)
            strip('Continuous raised kerb',road,*sorted((side*4.5,side*4.77)),.184,curb,3)
        strip('Dashed centre line',road,-.066,.066,.125,paint,3,lambda i: i%6 in (1,2))
# The front loops share a short corridor. This branch makes their connection explicit at the rear.
a, b = roads[0][166], roads[1][187]
link = [(a[0]+(b[0]-a[0])*t/124,a[1]+(b[1]-a[1])*t/124) for t in range(125)]
roads.append(link)
strip('Scenic connecting road',link,-4.5,4.5,.12,asphalt,4)
masterplan = json.loads((ROOT/'dist/assets/amenity-plans.json').read_text())['sections'][0]['features']
for item in masterplan[:2]:
    x,_,z = item['locations'][0]['world']
    start = (x+(-3 if item['number']==1 else 2),z-6)
    end = (x, -94+182*math.sqrt(1-(x/197)**2))
    drive = [(start[0]+(end[0]-start[0])*t/18,start[1]+(end[1]-start[1])*t/18) for t in range(19)]
    strip(item['name']+' drive',drive,-2.6,2.6,.14,pave,2.6)
    roads.append(drive)

# Park specimens are placed in irregular groups and kept clear of the estate and roads.
samples = [point for road in roads for point in road[::2]]
forest = []
for _ in range(10500):
    x,z = rng.uniform(-1450,1450),rng.uniform(-1450,1450)
    r = math.hypot(x,z)
    if r>1450 or (-77<x<78 and -83<z<99):
        continue
    if not any((x-u)**2+(z-v)**2<140 for u,v in samples):
        cluster = math.sin(x*.045)*math.cos(z*.032)
        if rng.random()>.68+cluster*.26:
            continue
        forest.append([round(x,2),round(surface_height(x,z),2),round(z,2),round(rng.uniform(.68,1.65),2),rng.randrange(5)])
for _ in range(5800):
    x,z = rng.uniform(-620,620),rng.uniform(-620,620)
    if math.sin(x*.026+1)*math.cos(z*.025)<-.25 or rng.random()<.19:
        continue
    if (-77<x<77 and -78<z<103) or any((x-u)**2+(z-v)**2<135 for u,v in samples):
        continue
    forest.append([round(x,2),round(surface_height(x,z),2),round(z,2),round(rng.uniform(.85,1.55),2),rng.randrange(5)])
(OUT/'planting.json').write_text(json.dumps(forest,separators=(',',':'))+'\n')

# An actual Cycles irradiance bake for the terrain. The browser uses UV channel 1.
if os.getenv('SHOWCASE_BAKE','1') == '1':
    data = ground_object.data
    uv = data.uv_layers.new(name='Indirect')
    for face in data.polygons:
        for loop_index in face.loop_indices:
            x,y,_ = data.vertices[data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = (.012+.976*(x+2304)/4608,.012+.976*(2304-y)/4608)
    atlas = bpy.data.images.new('Scenic terrain indirect',512,512,alpha=False)
    atlas.colorspace_settings.name = 'Non-Color'
    nodes = grass.node_tree.nodes
    image = nodes.new('ShaderNodeTexImage')
    image.image = atlas
    nodes.active = image
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 10
    scene.world = bpy.data.worlds.new('Scenic bounce environment')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.27,.34,.48,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .28
    sun_data = bpy.data.lights.new('Sun for indirect bake','SUN')
    sun_data.energy = 2
    sun = bpy.data.objects.new('Sun for indirect bake',sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (.49,-.55,-.25)
    ground_object.select_set(True)
    bpy.context.view_layer.objects.active = ground_object
    bpy.ops.object.bake(type='DIFFUSE',pass_filter={'INDIRECT'},uv_layer='Indirect',margin=5)
    atlas.filepath_raw = str(OUT/'terrain-indirect.png')
    atlas.file_format = 'PNG'
    atlas.save()
    atlas.pack()
    data.uv_layers['Surface'].active_render = True
    data.uv_layers.active = data.uv_layers['Surface']
    bpy.data.objects.remove(sun,do_unlink=True)

# Keep UV1 in glTF even though the browser assigns the separately baked irradiance.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'models/showcase-landscape.blend'),compress=True)
pack = os.environ.get('GLTFPACK')
with tempfile.TemporaryDirectory() as temp:
    raw = Path(temp)/'landscape.glb'
    bpy.ops.export_scene.gltf(filepath=str(raw),export_format='GLB',export_yup=True)
    if pack:
        subprocess.run([pack,'-i',str(raw),'-o',str(OUT/'landscape.glb'),'-cc','-ce','ext','-kn','-tc','-tu','normal','-vtf','-vpf','-kv'],check=True)
    else:
        (OUT/'landscape.glb').write_bytes(raw.read_bytes())
