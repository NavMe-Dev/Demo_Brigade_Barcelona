"""Blender 4.3+: build the conceptual masterplan and its separately loadable context.

blender -b --python scripts/generate_exterior.py
Distances are illustrative metres. Footprint and art references are documented in
dist/assets/architectural-manifest.json. No floor or apartment inventory is inferred.
"""
import json
import math
from pathlib import Path
import random
import os
import subprocess
import tempfile

import sys
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_decks import make_level, rim, bench
from build_club_studies import build_studies
import bpy

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'dist/assets'
OUTPUT = Path(os.environ.get('BRIGADE_ASSET_OUTPUT', ASSETS))
MODEL_OUTPUT = Path(os.environ.get('BRIGADE_MODEL_OUTPUT', ROOT / 'models'))
OUTPUT.mkdir(parents=True, exist_ok=True)
MODEL_OUTPUT.mkdir(parents=True, exist_ok=True)
SCENE = json.loads((ASSETS / 'scene-map.json').read_text())
DESIGNS = SCENE['designFootprints']
north,east=SCENE['northXZ'],SCENE['eastXZ']
lat0,lon0=SCENE['location']['lat'],SCENE['location']['lon']
def project(point):
    lon,lat=point
    u=(lon-lon0)*111320*math.cos(math.radians(lat0));v=(lat-lat0)*111320
    return (u*east[0]+v*north[0],u*east[1]+v*north[1])

rng = random.Random(2047)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

def srgb(s):
    v = int(s, 16)/255
    return v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4

def material(name, hexcolor, roughness=.73, metallic=0):
    color = tuple(srgb(hexcolor[i:i+2]) for i in (0, 2, 4)) + (1,)
    m = bpy.data.materials.new(name)
    m.diffuse_color = color
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return m

stone = material('Honed ivory limestone', 'd5bfa0', .82)
light = material('Pale travertine', 'e3d2b8', .80)
sand = material('Sandstone pilasters', 'a38972', .78)
rust = material('Fired terracotta', '87452f', .81)
brick = material('Warm clay brick', 'a75942', .85)
copper = material('Patinated clubhouse copper', '925436', .47, .48)
bronze = material('Clubhouse fascia bronze', 'a16c48', .38, .52)
stone_joint = material('Recessed masonry joints', '695043', .94)
walnut = material('Bronze anodised frame', '594333', .42, .35)
glass = material('Recessed neutral glazing', '313d40', .26, .20)
curtain = material('Linen behind smoked glass', '7b6d58', .59, .03)
reflection = material('Warm reflected glass', '625d56', .32, .24)
glint = material('Sky tinted guard glass', 'aab8af', .21, .03)
guard_shader = glint.node_tree.nodes['Principled BSDF']
guard_shader.inputs['Alpha'].default_value = .34
glint.surface_render_method = 'BLENDED'
dark = material('Shadowed colonnade', '494842')
water = material('Reflecting pools', '337e87', .17, .10)
lamp = material('Opal garden lantern', 'eac88e', .40)
lamp_bsdf = lamp.node_tree.nodes['Principled BSDF']
lamp_bsdf.inputs['Emission Color'].default_value = (1, .58, .24, 1)
lamp_bsdf.inputs['Emission Strength'].default_value = .7
flower = material('Violet garden salvia', '87568e')
wood = material('Oiled terrace timber', '89552a', .58)
sign = material('Brigade corporate crown sign', 'ffffff', .65)
sign_image = bpy.data.images.load(str(ASSETS / 'branding/crown-sign.jpg'))
sign_image.pack()
sign_node = sign.node_tree.nodes.new('ShaderNodeTexImage')
sign_node.image = sign_image
sign.node_tree.links.new(sign_node.outputs['Color'], sign.node_tree.nodes['Principled BSDF'].inputs['Base Color'])

road = material('Warm charcoal asphalt', '6e706c')
path = material('Buff limestone paving', 'dbc7a6')
leaf = material('Olive leaf', '748651')
leaf2 = material('Deep laurel', '4e6c46')
leaf3 = material('Sunlit neem', '96a068')
garden = material('Manicured terrace lawn', '869268')
trunk = material('Tree bark', '83705a')
lines = material('Court striping', 'e9e3ce')
clay = material('Court clay', 'bc8062')
court = material('Court blue', '65888b')

def surface_maps(mat, name):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    def texture(kind, color_space):
        path = ASSETS / f'textures/architecture/{name}-{kind}.png'
        image = bpy.data.images.load(str(path), check_existing=True)
        image.colorspace_settings.name = color_space
        image.pack()
        node = nodes.new('ShaderNodeTexImage')
        node.image = image
        return node
    base = texture('base-color', 'sRGB')
    links.new(base.outputs['Color'], bsdf.inputs['Base Color'])
    normals = texture('normal', 'Non-Color')
    normal = nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = .27
    links.new(normals.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    orm = texture('orm', 'Non-Color')
    channels = nodes.new('ShaderNodeSeparateColor')
    links.new(orm.outputs['Color'], channels.inputs['Color'])
    links.new(channels.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(channels.outputs['Blue'], bsdf.inputs['Metallic'])

textured = {stone:'ivory', rust:'terracotta', copper:'copper', path:'paving'}
for surface, name in textured.items():
    surface_maps(surface, name)

def xyz(x, y, z):
    return (x, -z, y)

def group(name, parent=None, **props):
    a = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(a)
    a.parent = parent
    for k, v in props.items():
        a[k] = v
    return a

class Batch:
    """Store faces by material, in world-up coordinates used by glTF."""
    def __init__(self):
        self.verts, self.faces, self.face_materials, self.materials = [], [], [], []
        self.uv_faces = {}
        self.smooth_faces = set()
    def section(self, points, faces, mat):
        offset = len(self.verts)
        self.verts.extend([xyz(*p) for p in points])
        self.faces.extend([tuple(offset+i for i in f) for f in faces])
        if mat not in self.materials:
            self.materials.append(mat)
        self.face_materials.extend([self.materials.index(mat)]*len(faces))
    def quad(self, points, mat, mapped=False):
        if mapped:
            self.uv_faces[len(self.faces)] = [(0,0),(1,0),(1,1),(0,1)]
        self.section(points, [(0,1,2,3)], mat)
    def box(self, x, y, z, w, h, d, mat, angle=0):
        c, s = math.cos(angle), math.sin(angle)
        self.solid([(x+a*c-b*s,z+a*s+b*c) for a,b in [(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]],y-h/2,h,mat)
    def solid(self, poly, base, height, mat):
        if len(poly)<3:
            return
        n = len(poly)
        area = sum(poly[i][0]*poly[(i+1)%n][1]-poly[(i+1)%n][0]*poly[i][1] for i in range(n))
        if area < 0:
            poly = list(reversed(poly))
        pts = [(x,base,z) for x,z in poly]+[(x,base+height,z) for x,z in poly]
        faces = [tuple(range(n)),tuple(reversed(range(n,2*n)))]
        faces += [(i,i+n,(i+1)%n+n,(i+1)%n) for i in range(n)]
        self.section(pts,faces,mat)
    def blob(self,x,y,z,rx,ry,rz,mat,seg=10):
        phase=rng.uniform(0,math.tau)
        pts=[(x,y-ry,z)]; faces=[]
        for row in range(1,5):
            lat=-math.pi/2+row*math.pi/5
            for col in range(seg):
                a=phase+(col+.35*(row%2))*math.tau/seg
                r=math.cos(lat)*rng.uniform(.9,1.09)
                pts.append((x+rx*r*math.cos(a),y+ry*math.sin(lat),z+rz*r*math.sin(a)))
        pts.append((x,y+ry,z))
        for i in range(seg):
            j=(i+1)%seg
            faces.append((0,1+i,1+j))
            for row in range(3):
                a=1+row*seg
                faces.append((a+i,a+seg+i,a+seg+j,a+j))
            faces.append((1+seg*3+j,1+seg*3+i,len(pts)-1))
        start = len(self.faces)
        self.section(pts,faces,mat)
        self.smooth_faces.update(range(start,len(self.faces)))
    def line(self,points,width,base,h,mat):
        for (x,z),(u,v) in zip(points,points[1:]):
            length=math.hypot(x-u,z-v)
            if length:
                self.box((x+u)/2,base+h/2,(z+v)/2,length+.05,h,width,mat,math.atan2(v-z,u-x))
    def mesh(self,name):
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(self.verts,[],self.faces)
        for m in self.materials:
            mesh.materials.append(m)
        mesh.polygons.foreach_set('material_index',self.face_materials)
        for index in self.smooth_faces:
            mesh.polygons[index].use_smooth = True
        mesh.update()
        mapped_slots = {i for i, mat in enumerate(self.materials) if mat in textured or mat == water}
        if self.uv_faces or mapped_slots:
            uv = mesh.uv_layers.new(name='UVMap')
            for poly in mesh.polygons:
                coords = self.uv_faces.get(poly.index)
                if coords is None and poly.material_index in mapped_slots:
                    axis = max(range(3), key=lambda j: abs(poly.normal[j]))
                    u, v = ((1,2),(0,2),(0,1))[axis]
                    coords = [tuple(mesh.vertices[i].co[j] * .68 for j in (u,v)) for i in poly.vertices]
                if coords is not None:
                    for loop, coord in zip(poly.loop_indices, coords):
                        uv.data[loop].uv = coord
        return mesh
    def object(self,name,parent,**extras):
        return linked(self.mesh(name),name,parent,**extras)

def linked(mesh,name,parent,x=0,y=0,z=0,scale=1,angle=0,**extras):
    a=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(a)
    a.parent=parent
    a.location=xyz(x,y,z)
    a.rotation_euler.z=-angle
    a.scale=(scale,scale,scale)
    for k,v in extras.items():
        a[k]=v
    return a

def facade_finish(idx, zone):
    if zone == 2 and idx in (2,6,10,12):
        return rust
    if idx in (2,6,10,12):
        return sand if zone == 0 else stone
    return sand if zone == 0 else light

exterior=group('Barcelona_concept_masterplan', status='illustrative')
site=group('Podium_and_landscape',exterior)
# Modular floor bays sit on the T-shaped massing depicted on brochure pages 7 and 15.
# Grouping whole wing floors into one shared mesh allows GPU instancing by finish zone.
def floor_mesh(wing,zone,refuge=False):
    b=Batch()
    for code,(x0,z0,x1,z1) in DESIGNS.items():
        if code[0]!=wing:
            continue
        x,z=(x0+x1)/2,(z0+z1)/2
        w,d=x1-x0,z1-z0
        if refuge and code=='A7':
            # The 12th-floor plan shows an open refuge terrace in the A7 position.
            b.box(x,.2,z,w,.4,d,stone)
            for sign in [-1,1]:
                b.box(x,.8,z+sign*(d/2-.12),w,1.08,.24,stone)
                b.box(x+sign*(w/2-.12),.8,z,.24,1.08,d,stone)
            continue
        idx=int(code[1:])
        finish = facade_finish(idx, zone)
        b.box(x,1.525,z,w-1.42,3.05,d-1.42,dark)
        b.box(x,.21,z,w,.42,d,finish)
        for side in range(4):
            horizontal = side < 2
            span = w if horizontal else d
            normal = 1 if side in (0,2) else -1

            def facebar(t, offset, y, length, height, thickness, mat):
                if horizontal:
                    b.box(x+t,y,z+normal*(d/2+offset),length,height,thickness,mat)
                else:
                    b.box(x+normal*(w/2+offset),y,z+t,thickness,height,length,mat)

            terrace_side = (wing=='A' and side==1) or (wing=='B' and (side==0 or side==(2 if x>0 else 3)))
            open_bays = terrace_side and finish != rust
            bays = max(3, round(span / (4.55 if open_bays else 3.8)))
            bay_width = span / bays
            facebar(0,-.12,2.83,span,.44,.55,finish)
            facebar(0,-.12,.42,span,.21,.53,finish)
            if not open_bays:
                facebar(0,-.12,.63,span,.22,.55,finish)
            for i in range(bays + 1):
                t = -span/2 + i*bay_width
                width = .65 if open_bays else bay_width * (.64 if finish == rust else .53)
                if i in (0,bays):
                    t += width*.25 if i == 0 else -width*.25
                    width *= .5
                facebar(t,-.17,1.64,width,2.58,.61,finish)
                if not open_bays and finish == rust and i not in (0,bays):
                    facebar(t,.145,1.58,.055,1.76,.022,stone_joint)
            for i in range(bays):
                t = -span/2 + (i+.5)*bay_width
                opening = bay_width - (.65 if open_bays else bay_width * (.64 if finish == rust else .53))
                sill = .44 if open_bays else .77
                head = 2.61
                pane = reflection if (i+side+idx)%5==0 else glass
                facebar(t,-.64,(sill+head)/2,opening,head-sill,.105,pane)
                facebar(t,-.55,(sill+head)/2,.055,head-sill,.09,walnut)
                facebar(t,-.42,sill,opening+.13,.078,.32,walnut)
                if (i+side+idx)%4 == 0:
                    facebar(t-opening*.27,-.58,(sill+head)/2,opening*.37,head-sill-.1,.035,curtain)
                if open_bays:
                    facebar(t,.18,.24,opening,.32,1.04,finish)
                    facebar(t,.65,.68,opening-.13,.67,.055,glint)
                    facebar(t,.68,1.01,opening-.09,.064,.092,walnut)
    # Connecting service spine; only broad massing is inferred for unscheduled floors.
    for x0,z0,x1,z1 in SCENE['wings'][wing]['footprints'][sum(1 for c in DESIGNS if c[0]==wing):]:
        b.box((x0+x1)/2,1.5,(z0+z1)/2,x1-x0,3.04,z1-z0,sand)
    return b.mesh('Wing_%s_finish_zone_%d'%(wing,zone))

for wing,count in [('A',46),('B',52)]:
    g=group('Wing_'+wing,exterior,wing=wing)
    segments=[floor_mesh(wing,i) for i in range(3)]
    refuge=floor_mesh(wing,0,True) if wing=='A' else None
    caps, crown_sign = Batch(), Batch()
    for i in range(2,count):
        zone=0 if i<13 else 1 if i<count-9 else 2
        linked(refuge if i==11 and refuge else segments[zone],f'{wing}_storey_{i+1:02d}',g,y=15+i*3.05)
    for code,(x0,z0,x1,z1) in DESIGNS.items():
        if code[0]!=wing:
            continue
        x,z=(x0+x1)/2,(z0+z1)/2
        w,d=x1-x0,z1-z0
        y=15+count*3.05
        # Alternating red and stone roof loggias and stepped projecting cornice.
        m=rust if int(code[1:]) in (2,6,10,12) else light
        for xx in [x0+.4,x1-.4]:
            for zz in range(4):
                caps.box(xx,y+1.75,z0+.5+(d-1)*zz/3,.75,3.5,.85,m)
        for zz in [z0+.45,z1-.45]:
            for xx in range(1,4):
                caps.box(x0+xx*w/4,y+1.75,zz,.8,3.5,.8,m)
        caps.box(x,y+.15,z,w+.4,.3,d+.4,m)
        caps.box(x,y+3.60,z,w+.40,.42,d+.40,m)
        caps.box(x,y+3.89,z,w+.70,.17,d+.70,m)
        caps.box(x,y+4.035,z,w+.96,.12,d+.96,m)
        caps.box(x,y+4.135,z,w+1.16,.08,d+1.16,m)
        # Projecting limestone cadres articulate tall groups of recessed terraces.
        for lo,hi in [(1,13),(14,26),(27,count-9),(count-8,count)]:
            if hi<=lo:continue
            low,high=15+(lo-1)*3.05,15+hi*3.05
            trim=sand if lo==1 else m if lo==count-8 else stone
            for side in (-1,1):
                for edge in (-1,1):
                    caps.box(x+edge*(w/2-.26),(low+high)/2,z+side*(d/2+.22),.67,high-low,.65,trim)
                    caps.box(x+side*(w/2+.22),(low+high)/2,z+edge*(d/2-.26),.65,high-low,.67,trim)
        # Layered entablature and piers around the uppermost windows in the references.
        caps.box(x,y+4.27,z,w+1.35,.21,d+1.35,m)
        if code == 'B10':
            panel_w, panel_h = 5.15, 2.72
            bottom, front = y+.67, z1+.14
            caps.box(x,bottom+panel_h/2,z1-.15,panel_w+.34,panel_h+.26,.55,rust)
            crown_sign.quad([(x-panel_w/2,bottom,front),(x+panel_w/2,bottom,front),
                             (x+panel_w/2,bottom+panel_h,front),(x-panel_w/2,bottom+panel_h,front)],sign,mapped=True)
        for h in [13,26,count-9]:
            caps.box(x,15+h*3.05,z,w+.32,.32,d+.32,stone)
    caps.object('Cornices_'+wing,g,wing=wing)
    if crown_sign.faces: crown_sign.object('Brigade_sign_'+wing,g,wing=wing)

b=Batch()
def planpx(points):
    return [((x-345)*.25,(z-430)*.25) for x,z in points]
parcel=json.loads((ASSETS/'geography/plot-20.geojson').read_text())
site_outline=[project(point) for point in parcel['geometry']['coordinates'][0][:-1]]
b.solid(site_outline,-1.3,1.3,garden)
b.object('HMDA_Plot_20',site)
b=Batch()
podium=planpx([(160,292),(170,274),(500,273),(521,288),(521,442),(506,455),(458,456),(439,469),(438,658),(418,686),(383,688),(274,663),(261,651),(261,435),(190,430),(182,622),(160,610)])
b.solid(podium,0,14.1,brick)
b.solid(podium,14.1,.43,stone)
b.solid(podium,14.53,.47,garden)
# Layered ceramic piers and recessed ventilation grille bays along the podium.
for (x,z),(u,v) in zip(podium,podium[1:]+podium[:1]):
    length=math.hypot(u-x,v-z)
    for j in range(max(1,int(length/4))):
        t=(j+.5)/max(1,int(length/4));px=x+(u-x)*t;pz=z+(v-z)*t
        angle=math.atan2(v-z,u-x)
        b.box(px,7,pz,1.25,13.8,.44,rust,angle)
        for h in [2.8,6.2,9.6]:
            b.box(px, h,pz, .54,2.15,.47,dark,angle)
# The ribs of each screen share a mesh. The deeper clay wall sits behind the openings.
screen = Batch()
for j in range(9):
    screen.box(0,(j-4)*.19,0,1.13,.068,.115,rust)
    if j < 8:
        for i in range(5):
            x = (i-2)*.215 + (.05 if j%2 else -.05)
            screen.box(x,(j-3.5)*.19,0,.083,.122,.115,brick)
screen_module = screen.mesh('Staggered clay screen module')
screen_group = group('Podium_clay_screens',exterior)
for (x,z),(u,v) in zip(podium,podium[1:]+podium[:1]):
    length = math.hypot(u-x,v-z)
    count = max(1,int(length/2.16))
    angle = math.atan2(v-z,u-x)
    # Outward normal of this clockwise-in-world-up polygon.
    nx, nz = math.sin(angle), -math.cos(angle)
    for j in range(count):
        t = (j+.5)/count
        xx, zz = x+(u-x)*t, z+(v-z)*t
        for n in range(4):
            y = 3.35+n*1.93+(j%3-1)*.28
            b.box(xx+nx*.19,y,zz+nz*.19,1.22,1.69,.27,dark,angle)
            linked(screen_module,'Clay_ventilation_panel',screen_group,xx+nx*.37,y,zz+nz*.37,angle=angle)
# The open Eco level supports the residential slabs above and admits a landscaped walk.
for x in [-36,-21,-5,12,32]:
    for z in [-30,-12]:b.box(x,18.05,z,.70,6.1,.78,stone)
for x in [-13,0,15]:
    for z in [3,18,36,47]:b.box(x,18.05,z,.75,6.1,.75,stone)
podium_model=group('Podium_architecture',site)
screen_group.parent=podium_model
podium_object=b.object('Podium_ventilated_screen',podium_model)
b=Batch()
b.line(planpx([(386,244),(473,240),(540,237),(550,266),(549,535),(554,701),(543,728),(506,736),(398,724),(289,699),(166,656),(137,633),(125,606),(130,420),(136,296),(142,252),(175,234),(260,235),(320,243),(386,244)]),5.7,.01,.15,path)
b.line(planpx([(219,421),(242,428),(250,441),(251,621),(243,644),(222,653),(201,641),(192,626),(195,448),(206,427),(219,421)]),3.8,.15,.12,road)
b.line(planpx([(130,605),(139,636),(179,664),(226,676),(288,695)]),5,.2,.12,road)
b.line(planpx([(172,659),(194,641),(209,634)]),4,.2,.13,road)
b.solid(planpx([(209,478),(238,478),(238,587),(209,587)]),.1,.6,stone)
b.solid(planpx([(212,481),(235,481),(235,584),(212,584)]),.7,.1,water)
for x in [-39,-34,-29]:
    b.box(x,3.8,48,.65,7.6,.65,light)
b.box(-34,7.9,47,13,.68,6,light)
ground_access=b.object('Masterplan_entry_driveway_water_feature',site)
b=Batch()
clubhouse=group('Seven_level_clubhouse',exterior,amenitySection='clubhouse')
# Three raked glazed volumes express the clubhouse's seven indicative levels.
# Their exterior outline follows page 12; the interior programme remains unassigned.
def club_sections():
    for level in range(7):
        y = level * 3.38
        width = 10.5 + level * .37
        back = 30 - level * .72
        edge = 53 - (level % 2) * 1.75 + level * .24
        b.box(41,y+.16,(back+edge)/2,width+.6,.32,edge-back,bronze)
        b.box(41,y+1.65,back+.13,width,3.3,.26,copper)
        for direction in (-1,1):
            x = 41 + width/2 * direction
            for panel in range(9):
                length = (edge-back) / 9
                z = back + (panel+.5) * length
                material = bronze if (level*3+panel*5)%13==0 else copper
                b.box(x,y+1.02,z,.26,1.64,length-.032,material)
                b.box(x,y+2.46,z,.19,1.23,length-.08,glass)
                b.box(x+direction*.02,y+2.46,z-length*.45,.22,1.27,.095,walnut)
        b.box(41,y+.55,edge-.15,width+.95,.59,.55,copper)

    for lower, upper, toe, head, half in [
        (1.28,6.48,55.05,51.9,5.4),
        (7.98,13.07,55.85,52.3,6.0),
        (17.14,23.57,57.72,53.30,6.65),
    ]:
        def face(x1,x2,t1,t2,material,inset=0):
            y1,y2 = lower+(upper-lower)*t1,lower+(upper-lower)*t2
            z1,z2 = toe+(head-toe)*t1-inset,toe+(head-toe)*t2-inset
            b.quad([(x1,y1,z1),(x2,y1,z1),(x2,y2,z2),(x1,y2,z2)],material)
        for t1,t2 in [(0,.16),(.81,1)]:
            for n in range(4):
                x = 41-half + n*half/2
                face(x+.018,x+half/2-.018,t1,t2,bronze if n==2 else copper)
        for side in (-1,1):
            x = 41+side*(half-.28)
            face(x-.28,x+.28,.16,.81,bronze)
            b.section([(41+side*(half-.02),lower,toe),(41+side*(half-.02),lower,50),
                       (41+side*(half-.02),upper,50),(41+side*(half-.02),upper,head)],
                      [(0,1,2,3),(3,2,1,0)],copper)
        count = 7
        start = 41-half+.53
        width = (half*2-1.06)/count
        for n in range(count):
            x = start+n*width
            face(x+.03,x+width-.03,.16,.81,glass,.09)
            face(x-.03,x+.03,.16,.81,walnut,.04)

club_sections()
for z in [31,37,43,50]:
    for x in [36,46]:b.box(x,1.6,z,.53,3.2,.53,light)
b.object('Terracotta_raked_clubhouse',clubhouse)
b=Batch()
# Surround the lowered pool bed with coping. The clear long edge exposes the water line.
b.box(41,23.61,39.8,13.75,.33,31.7,stone)
b.box(39.75,23.80,36.8,8.78,.42,16.6,dark)
b.box(39.75,24.045,36.8,8.58,.04,16.42,water)
for x in (35.32,44.18):
    edge = glint if x > 40 else stone
    b.box(x,24.03,36.8,.14,.53,16.69,edge)
for z in (28.43,45.17):
    b.box(39.75,24.03,z,8.85,.53,.15,stone)
b.box(41.0,24.025,48.1,4.42,.15,3.5,water)
for zz in [29,32,35,38,41,44]:
    b.box(46.65,24.04,zz,.8,.14,1.7,wood)
    b.box(46.65,24.15,zz,.74,.11,1.59,light)
    b.box(46.65,24.29,zz-.64,.75,.24,.45,light)
for zz in (26.4,32.8,39.1,46.7,50.8):
    rim(b,34.98,23.82,zz,.65,.65,.47,bronze,12)
    b.blob(34.98,24.44,zz,.62,.38,.59,leaf2,10)
    b.blob(35.15,24.7,zz+.1,.51,.43,.48,leaf,8)
b.object('Clubhouse_rooftop_pools',clubhouse,amenityId='clubhouse-15')
b=Batch()
b.box(40,25.45,51,7.0,2.75,4.5,glass)
b.box(40,27,51,8.4,.34,5.9,light)
bench(b,45.5,24,46.3,walnut,dark)
b.object('Rooftop_pavilion_and_deck',clubhouse,amenityId='clubhouse-16')
b=Batch()
# Game courts follow the row on the masterplan's north-west edge in drawing space.
for x,w,mat in [(-48,20,court),(-20,26,garden),(14,31,court),(38,10,clay)]:
    b.box(x,.16,-58,w,.22,11.5,mat)
    for zz in [-62.8,-53.2,-58]:
        b.box(x,.283,zz,w-1,.035,.13,lines)
    for xx in [x-w/2+.5,x,x+w/2-.5]:
        b.box(xx,.283,-58,.13,.035,9.7,lines)
    if mat!=clay:
        b.box(x,.80,-58,.12,1.2,10.8,glint)
        b.box(x,1.44,-58,.15,.08,10.8,lines)
# Low façade pavilions, shaded loggias and evergreen climbers at the podium edge.
for x,z in [(-43,-37),(-43,-10),(-42,43),(-18,54),(7,58),(22,54),(42,-31),(42,-12)]:
    for dx in [-1.05,1.05]:
        for dz in [-.84,.84]:b.box(x+dx,15.5,z+dz,.29,4.6,.29,light)
    b.box(x,17.89,z,2.9,.3,2.5,light)
plant_rng = random.Random(9104)
for (x,z),(u,v) in zip(podium,podium[1:]+podium[:1]):
    length = math.hypot(u-x,v-z)
    for i in range(max(1,int(length/2.5))):
        if plant_rng.random() < .27:
            continue
        t = (i+.35)/max(1,int(length/2.5))
        px,pz = x+(u-x)*t,z+(v-z)*t
        depth = plant_rng.uniform(.4,1.9)
        for j in range(3):
            dx,dz = plant_rng.uniform(-.52,.52),plant_rng.uniform(-.36,.36)
            b.blob(px+dx,14.65-depth*.37,pz+dz,.47,depth*.69,.42,[leaf,leaf2,leaf3][j],7)
        b.blob(px,15.02,pz,.72,.35,.62,leaf2,8)
# Approach road in the brochure foreground, with paving, gate piers and bays.
street=planpx([(49,637),(108,674),(172,704),(253,737),(354,762),(467,780),(584,793),(642,795)])
b.line(street,13.2,-.23,.22,path)
b.line(street,10,-.001,.12,road)
b.line(street,.19,.12,.035,lines)
for i in range(15):
    x=-46+6*i;z=50+(x+46)*.23
    b.box(x,1.05,z,.20,2.1,.20,walnut)
    b.box(x,2.22,z,.36,.27,.36,light)
for x,z in [(-42,52),(-38,54)]:
    b.box(x,1.51,z,.72,3.02,.78,stone)
garden_ground=b.object('Courts_pergolas_and_approach',site)
def tree_mesh(palm=False):
    b=Batch()
    if palm:
        b.box(0,2.8,0,.32,5.6,.32,trunk)
        for i in range(13):
            a=i*math.tau/13+rng.uniform(-.12,.12)
            length=rng.uniform(2.3,3.4)
            pts=[]
            for j in range(7):
                t=j/6
                w=math.sin(t*math.pi)**.7*.32
                for q in (-w,0,w):
                    pts.append((t*length*math.cos(a)-q*math.sin(a),5.55+math.sin(t*math.pi)*.72-t*.8+(0.13 if q==0 else 0),t*length*math.sin(a)+q*math.cos(a)))
            fs=[]
            for j in range(6):
                for k in range(2):
                    n=j*3+k;fs.append((n,n+1,n+4,n+3))
            # Two-sided fronds, geometry also visible in the street-level camera.
            b.section(pts,fs+[tuple(reversed(f)) for f in fs],leaf if i%2 else leaf2)
    else:
        b.box(0,1.8,0,.36,3.6,.36,trunk)
        for i in range(7):
            a=i*math.tau/7
            b.blob(1.04*math.cos(a),3.5+rng.uniform(-.25,1.0),1.04*math.sin(a),1.38,1.4,1.42,[leaf,leaf2,leaf3][i%3],8)
        b.blob(.18,4.65,.12,1.62,1.44,1.55,leaf)
    return b.mesh('Date_palm' if palm else 'Shaded_canopy')

broadleaf,palm=tree_mesh(),tree_mesh(True)
landscape=group('Planted_perimeter_and_terraces',exterior)
def plant(x,y,z,species=None,scale=1):
    linked(species or broadleaf,'Plant',landscape,x,y,z,scale,rng.random()*math.tau)
for x in range(-60,57,5):
    plant(x,0,-64,scale=rng.uniform(.85,1.25))
for z in range(-52,75,5):
    plant(55.5,0,z,palm if z%3==0 else broadleaf,rng.uniform(.9,1.2))
for z in range(-53,49,4):
    plant(-59,0,z,palm if z%3 else broadleaf,rng.uniform(.85,1.1))
for x in range(-47,53,5):
    plant(x,0,60+(x+47)*.16,scale=rng.uniform(.85,1.15))
# Raised tree courts and rooftop gardens, drawn from the landscape programmes.
for x in range(-41,42,5):
    plant(x,15,-37.2,palm if x%2 else broadleaf,.65)
for z in range(-30,45,4):
    plant(-44 if z<0 else -19.8,15,z,broadleaf,.55)
for z in range(4,54,5):
    plant(32.6,0,z,palm,.95)
catalog=json.loads((ASSETS/'amenity-plans.json').read_text())
api=SimpleNamespace(**{key:globals()[key] for key in ('Batch','group','stone','light','walnut','garden','water','path','clay','lines','dark','brick','rust','glass','glint','leaf','leaf2','leaf3','flower','lamp','wood','trunk')})
decks={}
for section,y in zip(catalog['sections'][:3],[.25,15.06,178.45]):
    decks[section['id']]=make_level(api,section,exterior,y)
def select_hierarchy(root):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root]+list(root.children_recursive):
        obj.select_set(True)
    bpy.context.view_layer.objects.active=root

# Group small opaque material changes into vertex colours during GLB export.
# Water, glass and reflective metals retain their authored PBR materials.
# Original Blender sources keep every individual material editable.
tinted=material('Stone_planting_and_furniture_colours','ffffff',.72)
color_node=tinted.node_tree.nodes.new('ShaderNodeVertexColor')
color_node.layer_name='SurfaceColour'
tinted.node_tree.links.new(color_node.outputs['Color'],tinted.node_tree.nodes['Principled BSDF'].inputs['Base Color'])

def tint_small_features(obj):
    src=obj.data
    if len(src.materials)<2:return None
    geo=src.copy()
    old=list(geo.materials)
    colors=geo.color_attributes.new(name='SurfaceColour',type='FLOAT_COLOR',domain='CORNER')
    values=[0.0]*(len(geo.loops)*4);slots=[tinted]
    for poly in geo.polygons:
        m=old[poly.material_index]
        keep=m in (water,glass,glint,walnut,lamp) or m in textured
        if keep and m not in slots:slots.append(m)
        # Save the new index separately while rebuilding the slot list.
        c=(1,1,1,1) if keep else tuple(m.diffuse_color)
        for index in poly.loop_indices:values[index*4:index*4+4]=c
    new_ids=[slots.index(old[poly.material_index]) if old[poly.material_index] in slots else 0 for poly in geo.polygons]
    geo.materials.clear()
    for m in slots:geo.materials.append(m)
    geo.polygons.foreach_set('material_index',new_ids)
    colors.data.foreach_set('color',values)
    geo.update()
    obj.data=geo
    return src

def export_model(root,filename):
    select_hierarchy(root)
    replaced=[]
    for obj in bpy.context.selected_objects:
        if obj.type=='MESH' and obj.get('amenitySection') in ('masterplan','eco-deck','sky-deck'):
            original=tint_small_features(obj)
            if original:replaced.append((obj,original))
    try:
        bpy.ops.export_scene.gltf(filepath=str(OUTPUT/filename),use_selection=True,export_format='GLB',
                                  export_gpu_instances=True,export_extras=True,export_yup=True,
                                  export_texcoords=True,export_animations=False)
    finally:
        for obj,original in replaced:
            temp_mesh=obj.data
            obj.data=original
            bpy.data.meshes.remove(temp_mesh)
    pack=os.getenv('GLTFPACK')
    if pack:
        with tempfile.TemporaryDirectory() as temp:
            packed=Path(temp)/filename
            subprocess.run([pack,'-i',str(OUTPUT/filename),'-o',str(packed),'-cc','-ce','ext','-kn','-ke','-vpf','-vtf','-v'],check=True)
            (OUTPUT/filename).write_bytes(packed.read_bytes())
def save_editable(root,name):
    scene=bpy.data.scenes.new(name)
    for obj in [root]+list(root.children_recursive):
        scene.collection.objects.link(obj)
    dest=MODEL_OUTPUT/'architecture'
    dest.mkdir(parents=True,exist_ok=True)
    bpy.data.libraries.write(str(dest/(name+'.blend')),{scene},compress=True)
    bpy.data.scenes.remove(scene)

export_model(exterior,'brigade-barcelona.glb')
# Export exact subtrees of the complete model, retaining the same coordinate frame.
for obj,file in [(bpy.data.objects['Wing_A'],'wing-a'),(bpy.data.objects['Wing_B'],'wing-b'),
                 (podium_model,'podium'),(clubhouse,'clubhouse'),(landscape,'landscape'),
                 (decks['eco-deck'],'eco-deck'),(decks['sky-deck'],'sky-deck')]:
    export_model(obj,file+'.glb')
    save_editable(obj,file)
# Transitional compatibility for existing links to the previous complete model.
(OUTPUT/'exterior.glb').write_bytes((OUTPUT/'brigade-barcelona.glb').read_bytes())

study_root=build_studies(api,catalog['sections'][3])
export_model(study_root,'clubhouse-studies.glb')
for ob in list(study_root.children_recursive):
    bpy.data.objects.remove(ob,do_unlink=True)
bpy.data.objects.remove(study_root,do_unlink=True)

# Distant profile uses flat, recessed window ribbons and removes fine mouldings.
# Each floor still shares one GPU-instanced wing mesh per material zone.
def low_storey(wing,zone,refuge=False):
    mesh=Batch()
    for code,(x0,z0,x1,z1) in DESIGNS.items():
        if code[0]!=wing:continue
        x,z=(x0+x1)/2,(z0+z1)/2
        w,d=x1-x0,z1-z0
        if refuge and code=='A7':
            mesh.box(x,.49,z,w,.98,d,stone)
            continue
        idx=int(code[1:])
        facade=facade_finish(idx,zone)
        mesh.box(x,1.525,z,w,3.05,d,facade)
        for side in range(4):
            horizontal=side<2
            span=w if horizontal else d
            sign=1 if side in (0,2) else -1
            count=max(3,round(span/3.65))
            for k in range(count):
                edge=span/count*(.32 if facade==rust else .17)
                a=-span/2+span*k/count+edge
                b=-span/2+span*(k+1)/count-edge
                coords=[(a,.61),(b,.61),(b,2.65),(a,2.65)]
                if horizontal:
                    pts=[(x+v,h,z+sign*(d/2+.012)) for v,h in coords]
                else:
                    pts=[(x+sign*(w/2+.012),h,z+v) for v,h in coords]
                reverse=(horizontal and sign==-1) or (not horizontal and sign==1)
                mesh.section(pts,[(3,2,1,0) if reverse else (0,1,2,3)],reflection if (idx+k+side)%4==0 else glass)
    for x0,z0,x1,z1 in SCENE['wings'][wing]['footprints'][sum(1 for c in DESIGNS if c[0]==wing):]:
        mesh.box((x0+x1)/2,1.5,(z0+z1)/2,x1-x0,3.04,z1-z0,sand)
    return mesh.mesh('Low_%s_storey_zone_%d'%(wing,zone))

low=group('Barcelona_distance_model',status='illustrative')
low_plant=Batch()
low_plant.box(0,1.9,0,.32,3.8,.32,trunk)
low_plant.blob(.1,4.2,0,2.1,1.8,2.1,leaf,6)
canopy=low_plant.mesh('Low_tree_crown')
for ob in [obj for obj in site.children if obj.type=='MESH'] + [podium_object] + list(clubhouse.children):
    linked(ob.data,'Low_'+ob.name,low,**({'amenityId':ob['amenityId']} if 'amenityId' in ob else {}))
for section,ground in zip(catalog['sections'][:3],[.25,15.06,178.45]):
    key = section['id']
    layer = make_level(api,section,low,ground,detail=False)
    # Join static amenity features for the distance model while the detailed
    # model retains feature identities and its independent component packages.
    batch=Batch()
    for ob in layer.children:
        if ob.type!='MESH':continue
        offset=len(batch.verts)
        batch.verts.extend(v.co[:] for v in ob.data.vertices)
        ids=[]
        for mat in ob.data.materials:
            if mat not in batch.materials:batch.materials.append(mat)
            ids.append(batch.materials.index(mat))
        for poly in ob.data.polygons:
            batch.faces.append(tuple(offset+v for v in poly.vertices))
            batch.face_materials.append(ids[poly.material_index])
    if batch.faces:batch.object('Low_'+key,low,amenitySection=key)
    for obj in list(layer.children):
        bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.objects.remove(layer,do_unlink=True)
for ob in landscape.children:
    if ob.type!='MESH':continue
    copy=ob.copy();copy.data=canopy if ob.data==broadleaf else ob.data
    bpy.context.collection.objects.link(copy);copy.parent=low
for wing,count in [('A',46),('B',52)]:
    group_low=group('Wing_'+wing+'_distance',low,wing=wing)
    floor_meshes=[low_storey(wing,i) for i in range(3)]
    refuge=low_storey(wing,0,True) if wing=='A' else None
    for i in range(2,count):
        zone=0 if i<13 else 1 if i<count-9 else 2
        linked(refuge if i==11 and refuge else floor_meshes[zone],'Low_storey',group_low,y=15+i*3.05)
    linked(bpy.data.objects['Cornices_'+wing].data,'Cornice_detail',group_low)
    if crown := bpy.data.objects.get('Brigade_sign_'+wing):
        linked(crown.data,'Brigade_sign_distance',group_low)
export_model(low,'exterior-lod.glb')
# Geographic arrival only needs the registered silhouette and major color divisions.
horizon = group('Barcelona_geographic_profile',status='illustrative')
linked(bpy.data.objects['HMDA_Plot_20'].data,'Geographic_parcel',horizon)
podium_profile = Batch()
podium_profile.solid(podium,0,14.1,brick)
podium_profile.solid(podium,14.1,.9,garden)
podium_profile.box(41,11.95,41,13,23.9,24,copper)
podium_profile.object('Geographic_podium_and_clubhouse',horizon)
for wing,count in [('A',46),('B',52)]:
    shell = Batch()
    for code,(x0,z0,x1,z1) in DESIGNS.items():
        if code[0] != wing:
            continue
        x,z = (x0+x1)/2,(z0+z1)/2
        width,depth = x1-x0,z1-z0
        for bottom,top,zone in [(2,13,0),(13,count-9,1),(count-9,count,2)]:
            shell.box(x,15+(bottom+top)*1.525,z,width,(top-bottom)*3.05,depth,facade_finish(int(code[1:]),zone))
        shell.box(x,17.15,z,width,.35,depth,stone)
        shell.box(x,17.07+count*3.05,z,width+1.25,4.2,depth+1.25,facade_finish(int(code[1:]),2))
    shell.object('Geographic_wing_'+wing,horizon,wing=wing)
export_model(horizon,'exterior-geographic.glb')
for ob in list(horizon.children_recursive):
    bpy.data.objects.remove(ob,do_unlink=True)
bpy.data.objects.remove(horizon,do_unlink=True)
# LOD is generated on demand; retain the high-detail model in the authoring scene.
for ob in list(low.children_recursive):
    bpy.data.objects.remove(ob,do_unlink=True)
bpy.data.objects.remove(low,do_unlink=True)

context=group('Kokapet_geographic_context', attribution='© OpenStreetMap contributors; Mapzen terrain')
dem=json.loads((ASSETS/'geography/terrain-grid.json').read_text())
grid=dem['elevation'];step=dem['step'];radius=dem['radius'];N=len(grid)
def ground(x,z):
    fx=min(N-1.00001,max(0,(x+radius)/step))
    fz=min(N-1.00001,max(0,(z+radius)/step))
    i,j=int(fx),int(fz)
    def lerp(a,b,t):return a+(b-a)*t
    alt=lerp(lerp(grid[j][i],grid[j][i+1],fx-i),lerp(grid[j+1][i],grid[j+1][i+1],fx-i),fz-j)
    # Feather a level conceptual construction pad into the measured terrain grid.
    edge=min(1,max(0,(math.hypot(x,z)-100)/135))
    return (alt-grid[N//2][N//2])*edge-.9

earth=material('Kokapet terrain', 'aaa88a')
contextwall=material('Context sandstone','bbad98')
contextroof=material('Context terrace','c5bba6')
lake=material('Regional water', '829c9a',.48)
groundmesh=Batch()
pts=[(x,ground(x,z),z) for z in range(-radius,radius+1,step) for x in range(-radius,radius+1,step)]
fs=[(j*N+i,(j+1)*N+i,(j+1)*N+i+1,j*N+i+1) for j in range(N-1) for i in range(N-1)]
groundmesh.section(pts,fs,earth)
groundmesh.object('Topography_40m_sample',context)
geodata=json.loads((ASSETS/'geography/kokapet.geojson').read_text())
buildings,roads,median,waters=Batch(),Batch(),Batch(),Batch()
atlas=[]
roadside=[]
context_trees=Batch()
context_trees.box(0,2.3,0,.5,4.6,.5,trunk)
context_trees.blob(.1,4.6,0,2.7,2.4,2.6,leaf2,7)
context_tree=context_trees.mesh('Context_tree_canopy')
neighborhood_trees=group('Illustrative_roadside_planting',context)
def drape(a,points,width,offset,mat):
    for (x,z),(u,v) in zip(points,points[1:]):
        dx,dz=u-x,v-z;length=math.hypot(dx,dz)
        if length<.001:continue
        ex,ez=dz/length*width*.5,-dx/length*width*.5
        # Subdivide long segments so the roadway follows the terrain at grid scale.
        pieces=max(1,math.ceil(length/12))
        verts=[]
        for k in range(pieces+1):
            t=k/pieces
            xx,zz=x+dx*t,z+dz*t
            verts.extend([(xx+ex,ground(xx+ex,zz+ez)+offset,zz+ez),(xx-ex,ground(xx-ex,zz-ez)+offset,zz-ez)])
        a.section(verts,[(2*k,2*k+1,2*k+3,2*k+2) for k in range(pieces)],mat)
for feat in geodata['features']:
    g=feat['geometry'];tags=feat['properties']
    points=[project(p) for p in (g['coordinates'][0] if g['type']=='Polygon' else g['coordinates'])]
    if g['type']=='Polygon':
        points=points[:-1]
    if not points:continue
    x=sum(p[0] for p in points)/len(points);z=sum(p[1] for p in points)/len(points)
    if tags.get('building') and g['type']=='Polygon' and math.hypot(x,z)>100:
        # No heights in this extract. Make simple area-based illustrative extrusions.
        area=abs(sum(u*points[(i+1)%len(points)][1]-v*points[(i+1)%len(points)][0] for i,(u,v) in enumerate(points)))/2
        h=min(34, max(5.5, math.sqrt(area)*.5))
        y=min(ground(u,v) for u,v in points)-.8
        buildings.solid(points,y,h,contextwall)
        buildings.solid(points,y+h,.5,contextroof)
    elif 'highway' in tags and g['type']=='LineString':
        cat=tags['highway']
        width={'motorway':12,'primary':10,'trunk':12,'secondary':8.5,'tertiary':7,'cycleway':2.6,'path':1.5,'footway':1.6}.get(cat,5)
        offset=.56+max(0,int(tags.get('layer',0)))*3
        drape(roads,points,width,offset,road)
        if width>=7:
            for (ax,az),(bx,bz) in zip(points,points[1:]):
                dx,dz=bx-ax,bz-az;length=math.hypot(dx,dz)
                if length<12:continue
                for k in range(int(length/21)+1):
                    t=(k+.5)/(int(length/21)+1)
                    side=(-1 if k%2 else 1)*(width/2+3.7)
                    tx=ax+t*dx+side*dz/length;tz=az+t*dz-side*dx/length
                    if 105<math.hypot(tx,tz)<880 and all((tx-u)**2+(tz-v)**2>65 for u,v in roadside):
                        roadside.append((tx,tz))
                        linked(context_tree,'Verge_tree',neighborhood_trees,tx,ground(tx,tz),tz,rng.uniform(.85,1.45))
            drape(median,points,.22,offset+.035,path)
    elif tags.get('natural')=='water' and g['type']=='Polygon':
        # Regional shoreline is mapped. DEM samples over lakes may vary slightly.
        alt=sorted(ground(u,v) for u,v in points)[len(points)//2]+.35
        waters.solid(points,alt,.12,lake)
    if tags.get('name') in ('Kokapet Lake','Outer Ring Road','Osman Sagar','Brigade Gateway (u/c)'):
        atlas.append({'osmWay':feat['id'],'name':tags['name'],'point':[round(x,1),round(ground(x,z),1),round(z,1)]})
for batch,name in [(buildings,'Mapped_building_footprints'),(roads,'Mapped_road_network'),(median,'Arterial_centrelines'),(waters,'Mapped_lakes')]:
    if batch.faces:batch.object(name,context)
(OUTPUT/'geography').mkdir(exist_ok=True)
(OUTPUT/'geography/landmarks.json').write_text(json.dumps(atlas,indent=2)+'\n')
export_model(context,'neighborhood.glb')
select_hierarchy(exterior)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=310
            area.spaces.active.region_3d.view_location=(0,0,65)
            area.spaces.active.clip_end=6000
bpy.ops.wm.save_as_mainfile(filepath=str(MODEL_OUTPUT/'masterplan.blend'),compress=True)
