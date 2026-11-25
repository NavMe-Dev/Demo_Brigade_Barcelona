"""Generate the illustrative A3 apartment from source-traced, metric plan geometry.

Run: blender -b --python scripts/generate_model.py -- GEOMETRY_JSON OUTPUT_GLB
All furniture, finish colors and unverified heights are conceptual, not specifications.
Input/output coordinate system: right-handed, meters, X right, Y up, Z down the plan.
Blender internal coordinates use (X, -Z, Y) so glTF export returns the documented axes.
"""
import bpy, json, math, os, random, sys
from pathlib import Path
from mathutils import Vector

random.seed(47)
args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(args[0]) if args else PROJECT_ROOT/'dist/assets/apartment-geometry.json'
OUTPUT = Path(args[1]) if len(args)>1 else PROJECT_ROOT/'dist/assets/apartment-a3.glb'
HEIGHT = 3.0

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for d in bpy.data.materials:
    bpy.data.materials.remove(d)

def mat(name, color, roughness=.65, metallic=0, alpha=1):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,alpha);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,alpha)
    bs.inputs['Roughness'].default_value=roughness
    bs.inputs['Metallic'].default_value=metallic
    bs.inputs['Alpha'].default_value=alpha
    if alpha < 1:
        m.surface_render_method='DITHERED'
    return m

M={
 'plaster':mat('Warm limestone plaster',(0.82,.79,.73)),
 'white':mat('Warm white upholstery',(.91,.88,.81)),
 'floor':mat('Light limestone floor',(.73,.71,.65),.7),
 'stone':mat('Pale stone worktops',(.83,.82,.75),.35),
 'wood':mat('Natural oak',(.48,.31,.18),.56),
 'woodlight':mat('Honey oak',(.63,.44,.28),.6),
 'wooddark':mat('Walnut accent',(.23,.16,.115),.5),
 'rust':mat('Terracotta accent',(.42,.145,.13),.8),
 'olive':mat('Muted olive',(.29,.34,.24),.8),
 'sand':mat('Sand fabric',(.65,.59,.48),.88),
 'rug':mat('Woven oat rug',(.54,.49,.40),.96),
 'dark':mat('Charcoal bronze',(.105,.115,.11),.48,.2),
 'metal':mat('Brushed bronze',(.44,.32,.18),.3,.75),
 'leaf':mat('Botanical green',(.12,.24,.10),.8),
 'clay':mat('Ceramic clay',(.57,.43,.32),.9),
 'glass':mat('Window glazing',(.72,.82,.83),.12,0,.16),
 'water':mat('Sink basin',(.39,.43,.43),.35),
 'bath':mat('Bathroom tile',(.58,.59,.55),.6),
 'black':mat('Appliance glass',(.045,.055,.052),.23),
}
wood_variants=[mat('Oak plank %02d'%i,(.52+i*.014,.36+i*.01,.225+i*.008),.64) for i in range(6)]

def empty(name,parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;return o

root=empty('Brigade_Barcelona_A3_Illustrative')
groups={k:empty(k,root) for k in ['floors','walls','ceiling','furniture','openings','lighting_fixtures']}
wall_lower=empty('walls_lower',groups['walls']);wall_upper=empty('walls_upper',groups['walls'])
groups['walls_lower']=wall_lower;groups['walls_upper']=wall_upper

def coord(x,y,z):return (x,-z,y)

def cube(name,x,y,z,sx,sy,sz,material,bevel=0.015,parent=None,angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=coord(x,y,z))
    o=bpy.context.object;o.name=name;o.dimensions=(sx,sz,sy)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.rotation_euler.z=-angle
    if bevel:
        mod=o.modifiers.new('Soft edges','BEVEL');mod.width=min(bevel,min(sx,sy,sz)/3);mod.segments=2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    if material:o.data.materials.append(material)
    o.parent=parent or groups['furniture'];return o

def cyl(name,x,y,z,r,depth,material,parent=None,vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=coord(x,y,z))
    o=bpy.context.object;o.name=name;o.data.materials.append(material);o.parent=parent or groups['furniture']
    for p in o.data.polygons:p.use_smooth=True
    mod=o.modifiers.new('Small edge radius','BEVEL');mod.width=.012;mod.segments=2
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o

def sphere(name,x,y,z,sx,sy,sz,material,parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=coord(x,y,z))
    o=bpy.context.object;o.name=name;o.scale=(sx,sz,sy);o.data.materials.append(material)
    o.parent=parent or groups['furniture']
    for p in o.data.polygons:p.use_smooth=True
    return o

def polygon(name,points,y,material,parent=None):
    area=sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points)))
    # Correct normals after X,-Z,Y axis conversion.
    if (not name.startswith('ceiling_') and area>0) or (name.startswith('ceiling_') and area<0):points=list(reversed(points))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata([coord(p[0],y,p[1]) for p in points],[],[list(range(len(points)))])
    mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    o.data.materials.append(material);o.parent=parent or groups['floors']
    return o

def bar(name,a,b,y,h,t,material,parent):
    dx=b[0]-a[0];dz=b[1]-a[1];length=math.hypot(dx,dz)
    if length<.001:return None
    return cube(name,(a[0]+b[0])/2,y,(a[1]+b[1])/2,length,h,t,material,.008,parent,math.atan2(dz,dx))

def plant(name,x,z,height=.9,r=.18,parent=None):
    p=parent or groups['furniture']
    cyl(name+'_pot',x,.16,z,r,.30,M['clay'],p)
    cyl(name+'_soil',x,.315,z,r*.86,.012,M['wooddark'],p)
    cyl(name+'_stem',x,height/2+.24,z,.014,height-.12,M['wooddark'],p,8)
    for j in range(9):
        ang=j*2.4;rr=.12+(j%3)*.045
        o=sphere(name+'_leaf_%02d'%j,x+math.cos(ang)*rr,.4+j*.065,z+math.sin(ang)*rr,.16,.055,.085,M['leaf'],p)
        o.rotation_euler=(.25*math.cos(ang),.25*math.sin(ang),ang)

def lamp(name,x,z,y=.55):
    cyl(name+'_foot',x,y+.025,z,.11,.035,M['metal'])
    cyl(name+'_stem',x,y+.20,z,.018,.35,M['metal'],vertices=12)
    cyl(name+'_shade',x,y+.42,z,.18,.25,M['white'])

def side_table(name,x,z,r=.24):
    cyl(name+'_base',x,.22,z,r*.53,.43,M['wooddark'])
    cyl(name+'_top',x,.46,z,r,.05,M['wood'])

def bed(name,cx,cz,width=1.7,length=2.0):
    # Head at negative Z; keep opposite circulation beside bed clear.
    cube(name+'_platform',cx,.24,cz,width+.10,.30,length+.12,M['wood'],.045)
    cube(name+'_mattress',cx,.49,cz,width,.24,length,M['white'],.075)
    cube(name+'_duvet',cx,.64,cz+.23,width+.04,.12,length*.69,M['sand'],.055)
    cube(name+'_throw',cx,.72,cz+.65,width+.06,.035,.40,M['rust'],.012)
    cube(name+'_headboard',cx,.69,cz-length/2-.08,width+.28,1.14,.13,M['woodlight'],.035)
    for s in [-1,1]:
        cube(name+'_pillow',cx+s*width*.245,.68,cz-length*.32,width*.43,.15,.41,M['white'],.065)
        tx=cx+s*(width/2+.36)
        side_table(name+'_nightstand',tx,cz-length*.38,.25)
        lamp(name+'_lamp',tx,cz-length*.38)

def sofa(name,cx,cz,width=2.7,depth=.9):
    for sx in [-1,1]:
        for sz in [-1,1]:cube(name+'_leg',cx+sx*(width/2-.18),.12,cz+sz*(depth/2-.13),.07,.22,.07,M['wooddark'],.01)
    cube(name+'_base',cx,.30,cz,width,.27,depth,M['sand'],.06)
    cube(name+'_back',cx,.68,cz+depth*.40,width,.62,.19,M['white'],.06)
    for sx in [-1,1]:cube(name+'_arm',cx+sx*(width/2-.10),.57,cz,.2,.42,depth,M['white'],.06)
    for i in range(3):
        cube(name+'_seat',cx+(i-1)*(width-.45)/3,.49,cz-.035,(width-.48)/3,.18,depth-.22,M['white'],.05)
    for side in [-1,1]:
        o=cube(name+'_cushion',cx+side*(width*.31),.74,cz+.12,.39,.39,.14,M['rust'] if side<0 else M['olive'],.07)
        o.rotation_euler.x=.18

def chair(name,x,z,angle=0):
    p=empty(name,groups['furniture'])
    # Build in local meter coordinates with simple mesh transforms handled by parent.
    p.location=coord(x,0,z);p.rotation_euler.z=-angle
    for sx in [-1,1]:
        for sz in [-1,1]:cube(name+'_leg',sx*.19,.22,sz*.18,.045,.44,.045,M['wooddark'],.008,p)
    cube(name+'_seat',0,.46,0,.50,.12,.48,M['white'],.055,p)
    cube(name+'_back',0,.73,.20,.50,.50,.11,M['sand'],.05,p)

def dining(name,cx,cz):
    cube(name+'_tabletop',cx,.79,cz,1.00,.09,2.15,M['wood'],.13)
    cube(name+'_pedestal',cx,.39,cz,.49,.70,1.16,M['wooddark'],.035)
    for j in [-1,0,1]:
        chair(name+'_chair_left',cx-.83,cz+j*.69,-math.pi/2)
        chair(name+'_chair_right',cx+.83,cz+j*.69,math.pi/2)
    cyl(name+'_bowl',cx,.88,cz,.15,.07,M['clay'])
    sphere(name+'_fruit',cx+.04,.94,cz,.06,.06,.06,M['olive'])
    # Pendants remain in a separately named group for dollhouse visibility.
    for dz in [-.55,.55]:
        cyl(name+'_pendant_cord',cx,2.56,cz+dz,.009,.88,M['dark'],groups['lighting_fixtures'],8)
        cyl(name+'_pendant_shade',cx,2.10,cz+dz,.20,.16,M['metal'],groups['lighting_fixtures'])

def artwork(name,x,z,width=.9,orientation='north'):
    # Thin panel against a horizontal wall, illustrations are procedural abstract blocks.
    cube(name+'_frame',x,1.65,z,width,.84,.045,M['wooddark'],.008)
    cube(name+'_canvas',x,1.65,z+.027,width-.06,.78,.015,M['white'],.004)
    cube(name+'_abstract_a',x-width*.12,1.65,z+.04,width*.31,.54,.008,M['rust'],.004)
    cube(name+'_abstract_b',x+width*.16,1.53,z+.045,width*.22,.25,.008,M['olive'],.004)

def rug(name,cx,cz,width,depth):
    cube(name,cx,.024,cz,width,.025,depth,M['rug'],.014)
    # Sparse parallel weave stripes add readable scale without expensive textures.
    for k in range(5):cube(name+'_weave',cx,.040,cz+(k-2)*depth/6,width*.96,.003,.014,M['sand'],0)

def shower(name,x,z,w=.9,d=.9):
    cube(name+'_tray',x,.05,z,w,.08,d,M['stone'],.025)
    cube(name+'_glass',x+w/2,1.06,z,.016,2.0,d,M['glass'],0)
    cyl(name+'_drain',x,.099,z,.045,.008,M['metal'],vertices=16)

def toilet(name,x,z):
    sphere(name+'_base',x,.24,z,.22,.25,.30,M['white'])
    sphere(name+'_bowl',x,.42,z,.24,.09,.33,M['white'])
    sphere(name+'_seat',x,.48,z,.19,.018,.27,M['stone'])
    cube(name+'_cistern',x,.60,z-.27,.38,.42,.16,M['white'],.045)

def vanity(name,x,z,w=.7):
    cube(name+'_cabinet',x,.43,z,w,.78,.48,M['wood'],.018)
    cube(name+'_top',x,.85,z,w+.04,.05,.53,M['stone'],.015)
    sphere(name+'_basin',x,.89,z,.23,.035,.16,M['white'])
    cyl(name+'_tap',x,.98,z-.18,.018,.22,M['metal'],vertices=12)
    cube(name+'_mirror',x,1.5,z-.255,w*.88,.82,.02,M['glass'],.02)

def room_bounds(room):
    pts=room.get('polygon') or room.get('polygon_m') or room.get('points')
    if isinstance(pts,dict):pts=pts.get('coordinates',[[]])[0]
    if pts and isinstance(pts[0],dict):pts=[[p['x'],p.get('z',p.get('y'))] for p in pts]
    xs=[p[0] for p in pts];zs=[p[1] for p in pts]
    return pts,min(xs),max(xs),min(zs),max(zs)

def optimize_mesh_groups():
    """Batch static geometry by material and visibility group for mobile draw-call budgets."""
    for key in ['floors','walls_lower','walls_upper','ceiling','furniture','openings','lighting_fixtures']:
        group=groups[key];by_mat={}
        for obj in list(group.children_recursive):
            if obj.type=='MESH':by_mat.setdefault(obj.data.materials[0].name if obj.data.materials else 'None',[]).append(obj)
        for material,objects in by_mat.items():
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            bpy.ops.object.join()
            obj=bpy.context.object;world=obj.matrix_world.copy();obj.parent=group;obj.matrix_world=world
            obj.name=key+'__'+material.replace(' ','_')
            bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    keep={root,*groups.values()}
    for o in list(bpy.data.objects):
        if o.type=='EMPTY' and o not in keep and not o.children:bpy.data.objects.remove(o,do_unlink=True)

def main():
    global HEIGHT
    data=json.loads(SOURCE.read_text())
    print('Geometry keys:',list(data))
    rooms=data.get('rooms',[])
    slab=polygon('continuous_floor_slab',data['outline'],-.012,M['floor'])
    mod=slab.modifiers.new('Floor slab thickness','SOLIDIFY');mod.thickness=.18
    bpy.context.view_layer.objects.active=slab;bpy.ops.object.modifier_apply(modifier=mod.name)
    nav=[]
    for i,room in enumerate(rooms):
        pts,x0,x1,z0,z1=room_bounds(room);w=x1-x0;d=z1-z0;cx=(x0+x1)/2;cz=(z0+z1)/2
        ident=str(room.get('id',room.get('name',f'room_{i}')))
        label=str(room.get('name',room.get('label',ident))).lower()
        kind=(str(room.get('type',''))+' '+ident+' '+label).lower()
        isbed=any(k in kind for k in ['bedroom','bed_','bed-','master']) and 'wash' not in kind
        isbath=any(k in kind for k in ['wash','bath','toilet'])
        isdeck=any(k in kind for k in ['deck','balcony'])
        floor_mat=M['woodlight'] if isdeck else M['bath'] if isbath else M['floor']
        polygon('floor_'+ident,pts,.005,floor_mat)
        if not isdeck:polygon('ceiling_'+ident,list(reversed(pts)),HEIGHT,M['white'],groups['ceiling'])
        if isbed:
            bx=x0+min(1.65,w*.43);bz=z0+d*.54
            if ident=='bedroom-2':bx=x1-1.55
            rug('rug_'+ident,bx,bz+.2,min(2.65,w-.2),min(2.9,d-.3))
            bed('bed_'+ident,bx,bz,width=min(1.7,w-.7),length=min(2.0,d-.8))
            cube('wardrobe_'+ident,x0+.31,1.24,z0+.7,.55,2.48,min(1.2,d*.3),M['wood'],.02)
            for q in range(2):cube('wardrobe_pull',x0+.60,1.18,z0+.49+q*.38,.025,.25,.025,M['metal'],.005)
            artwork('art_'+ident,bx,z0+.12,min(1.1,w*.32))
            if ident=='primary-bedroom':plant('plant_'+ident,x0+.40,z1-.40,.95,.17)
            else:plant('plant_'+ident,x1-.33,z0+.33,.95,.17)
            nav.append({'room_id':ident,'position':[x1-.72,1.6,z1-.65],'look_at':[bx,1.0,bz]})
        elif any(k in kind for k in ['living','lounge']):
            sw=min(2.85,w-1.0);sx=x0+w*.48;sz=z1-.63
            rug('rug_'+ident,sx,z1-1.55,min(w-.65,3.5),min(d-.7,2.65))
            sofa('sofa_'+ident,sx,sz,sw)
            cyl('coffee_table_'+ident,sx-.18,.41,z1-1.65,.46,.07,M['wood'])
            cyl('coffee_base_'+ident,sx-.18,.21,z1-1.65,.29,.38,M['wooddark'])
            cyl('coffee_small_'+ident,sx+.45,.34,z1-1.52,.32,.055,M['stone'])
            cube('coffee_book_'+ident,sx-.2,.46,z1-1.65,.24,.04,.31,M['rust'],.005)
            side_table('end_table_'+ident,min(x1-.33,sx+sw/2+.28),sz,.22)
            plant('plant_'+ident,x1-.34,z0+.36,1.12,.20)
            tvx=sx+.55 if ident=='family-lounge' else sx
            cube('console_'+ident,tvx,.36,z0+.23,min(w-.9,2.5),.60,.30,M['wood'],.025)
            cube('television_'+ident,tvx,1.17,z0+.15,1.4,.80,.055,M['black'],.018)
            nav.append({'room_id':ident,'position':[x0+.72,1.6,z0+.95],'look_at':[sx,1.0,sz]})
        elif 'dining' in kind:
            cx=room['center'][0];cz=room['center'][1]+.65
            dining('dining',cx,cz)
            nav.append({'room_id':ident,'position':[x0+.55,1.6,cz],'look_at':[cx,1.0,cz]})
        elif 'kitchen' in kind:
            # L-shaped counters preserve circulation from dining through utility doorway.
            cube('kitchen_south_base',cx,.43,z1-.32,w-.10,.83,.60,M['wood'],.015)
            cube('kitchen_south_worktop',cx,.88,z1-.32,w-.08,.07,.64,M['stone'],.015)
            cube('kitchen_east_base',x1-.31,.43,cz,.60,.83,max(.6,d-.7),M['wood'],.015)
            cube('kitchen_east_worktop',x1-.31,.88,cz,.64,.07,max(.6,d-.68),M['stone'],.015)
            for n in range(max(1,int(w/.62))):
                xx=x0+.35+n*.61
                cube('cabinet_front',xx,.46,z1-.635,.58,.71,.025,M['woodlight'],.012)
                cube('cabinet_handle',xx,.74,z1-.655,.23,.022,.025,M['metal'],.003)
            cube('kitchen_hob',x1-.32,.93,cz-.40,.52,.035,.61,M['black'],.008)
            for ox in [-.14,.14]:
                for oz in [-.17,.17]:cyl('hob_ring',x1-.32+ox,.953,cz-.40+oz,.09,.012,M['dark'],vertices=20)
            cube('kitchen_sink',cx-.15,.925,z1-.30,.65,.018,.39,M['water'],.06)
            cyl('kitchen_tap',cx-.15,1.06,z1-.51,.018,.29,M['metal'],vertices=12)
            cube('kitchen_upper_cabinets',x1-.20,2.08,cz,.35,.80,max(.65,d-.9),M['white'],.015)
            nav.append({'room_id':ident,'position':[x0+.80,1.6,z0+.90],'look_at':[x1-.3,1.1,cz]})
        elif isbath:
            if d>2.0:shower('shower_'+ident,x1-.53,z0+(.43 if ident=='bathroom-2' else .53),min(.9,w*.46),.76 if ident=='bathroom-2' else .90)
            toilet('toilet_'+ident,x1-.36,z1-.48)
            vanity('vanity_'+ident,x0+.48,z0+.30,min(.74,w-.2))
            nav.append({'room_id':ident,'position':[cx,1.6,cz],'look_at':[x0+.35,1.0,z0+.3]})
        elif 'closet' in kind:
            for zz in [z0+.25,z1-.25]:cube('closet_storage',cx,1.15,zz,w-.15,2.25,.42,M['wood'],.02)
            nav.append({'room_id':ident,'position':[cx,1.6,cz],'look_at':[cx,1.2,z0+.25]})
        elif 'utility' in kind:
            cube('utility_machine',x0+.36,.45,z0+.38,.62,.88,.66,M['white'],.025)
            cube('utility_worktop',x0+.36,.94,z0+.38,.66,.06,.70,M['stone'],.012)
            nav.append({'room_id':ident,'position':[cx,1.6,z1-.65],'look_at':[x0+.36,.9,z0+.38]})
        elif isdeck:
            plant('deck_plant_'+ident,x1-.28,z0+.34,1.2,.21)
            plant('deck_plant_b_'+ident,x1-.28,z1-.34,1.0,.20)
            if d>3:
                chair('deck_chair_a',cx,z1-1.45,.25)
                chair('deck_chair_b',cx,z1-.55,math.pi-.25)
                side_table('deck_table',cx+.52,z1-1.0,.23)
            # Transparent balustrade on the exposed east edge.
            bar('deck_glass_'+ident,[x1,z0],[x1,z1],.58,1.1,.025,M['glass'],groups['openings'])
            bar('deck_rail_'+ident,[x1,z0],[x1,z1],1.15,.045,.045,M['metal'],groups['openings'])
            nav.append({'room_id':ident,'position':[x0+.45,1.6,z0+d*.30],'look_at':[x1+4,1.6,z0+d*.30]})
        else:nav.append({'room_id':ident,'position':[cx,1.6,cz],'look_at':[cx,1.6,cz-1]})

    walls=data.get('walls',[])
    for i,w in enumerate(walls):
        a=w.get('a') or w.get('start');b=w.get('b') or w.get('end')
        h=w.get('height_m',HEIGHT);th=w.get('thickness_m',.18)
        base=w.get('base_y_m',w.get('base_m',0))
        lower=max(0,min(1.05-base,h))
        if lower>0:bar('wall_%03d_lower'%i,a,b,base+lower/2,lower,th,M['plaster'],wall_lower)
        if h>lower:bar('wall_%03d_upper'%i,a,b,base+lower+(h-lower)/2,h-lower,th,M['plaster'],wall_upper)
        # Skirting only along remaining solid wall segments.
        if base==0:bar('skirting_%03d'%i,a,b,.055,.11,th+.025,M['woodlight'],wall_lower)

    for i,o in enumerate(data.get('openings',[])):
        a=o.get('a') or o.get('start');b=o.get('b') or o.get('end')
        if not a or not b:continue
        typ=str(o.get('type','door')).lower();h=o.get('height_m',2.44)
        thick=.19;name='opening_%03d_%s'%(i,typ)
        if typ in ['window','glazing']:
            sill=o.get('sill_m',o.get('sill_height_m',.85));top=sill+h
            bar(name+'_glass',a,b,(sill+top)/2,top-sill,.018,M['glass'],groups['openings'])
            bar(name+'_sill',a,b,sill,.06,thick+.035,M['stone'],groups['openings'])
            for p in [a,b]:cube(name+'_window_frame',p[0],sill+h/2,p[1],.045,h,.045,M['metal'],.005,groups['openings'])
            bar(name+'_window_head',a,b,top,.045,.045,M['metal'],groups['openings'])
            continue
        elif typ in ['sliding','sliding_door']:
            # Slide the glass to one side, leaving the central walking route open.
            mid=[a[0]+(b[0]-a[0])*.20,a[1]+(b[1]-a[1])*.20]
            bar(name+'_glass',a,mid,h/2,h,.018,M['glass'],groups['openings'])
            bar(name+'_track',a,b,.025,.035,.05,M['metal'],groups['openings'])
        # Doorways intentionally have no closed slabs, keeping accessible circulation visible.
        for j,p in enumerate([a,b]):
            cube(name+'_jamb_%d'%j,p[0],h/2,p[1],.065,h,.065,M['woodlight'],.006,groups['openings'])

    # File-level metadata survives glTF export as extras.
    root['asset_status']='Illustrative reconstruction from brochure, not architect-approved'
    root['source_document']='Brigade Barcelona.pdf'
    root['source_page']=18
    root['unit_type']='A3, Wing A'
    root['units']='meters'
    root['assumed_wall_height_m']=HEIGHT
    root['furniture_and_finishes']='Illustrative, not a representation of included items'
    bpy.context.view_layer.update()
    colliders=[]
    for o in groups['furniture'].children_recursive:
        if o.type!='MESH':continue
        corners=[o.matrix_world@Vector(c) for c in o.bound_box]
        lo=[min(v[j] for v in corners) for j in range(3)];hi=[max(v[j] for v in corners) for j in range(3)]
        if hi[2]<.15 or lo[2]>1.3 or any(k in o.name for k in ['art_','television','mirror','pendant','lamp_']):continue
        colliders.append({'name':o.name,'min':[lo[0],lo[2],-hi[1]],'max':[hi[0],hi[2],-lo[1]]})
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    optimize_mesh_groups()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_materials='EXPORT')
    navpath=OUTPUT.with_name('navigation-adjustments.json')
    navpath.write_text(json.dumps({'status':'Use canonical geometry navigation_nodes/edges; optional view framing only','coordinate_system':'x right, y up, z down plan, meters','viewpoints':nav,'navigation_nodes':data.get('navigation_nodes',[]),'navigation_edges':data.get('navigation_edges',[])},indent=2))
    OUTPUT.with_name('furniture-colliders.json').write_text(json.dumps({'coordinate_system':'meters, x right, y up, z down plan','boxes':colliders},indent=2))
    OUTPUT.with_name('apartment-geometry.json').write_text(json.dumps(data,indent=2))
    print('EXPORTED',OUTPUT,OUTPUT.stat().st_size,'bytes')
    print('NAVIGATION',navpath)
    # Render an honest model thumbnail for verification and WebGL fallback.
    render_thumbnail(rooms)

def render_thumbnail(rooms):
    groups['ceiling'].hide_render=True
    groups['walls_upper'].hide_render=True
    groups['lighting_fixtures'].hide_render=True
    # Hide child objects recursively: Empty hide_render does not hide child meshes.
    for group in ['ceiling','walls_upper','lighting_fixtures']:
        for o in groups[group].children_recursive:o.hide_render=True
    pts=[p for r in rooms for p in room_bounds(r)[0]]
    xs=[p[0] for p in pts];zs=[p[1] for p in pts]
    cx=(min(xs)+max(xs))/2;cz=(min(zs)+max(zs))/2
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
    scene.cycles.use_denoising=False
    scene.render.resolution_x=1500;scene.render.resolution_y=1150;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
    scene.world.color=(.65,.65,.65)
    scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.70,.75,.8,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.55
    bpy.ops.object.light_add(type='AREA',location=coord(cx-4,15,cz-5));light=bpy.context.object
    light.data.energy=2200;light.data.shape='DISK';light.data.size=12
    light.rotation_euler=(Vector(coord(cx,0,cz))-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.light_add(type='AREA',location=coord(cx+9,8,cz+4));light=bpy.context.object;light.data.energy=1300;light.data.size=10
    light.rotation_euler=(Vector(coord(cx,0,cz))-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=coord(cx-13,20,cz+17));cam=bpy.context.object
    target=Vector(coord(cx,0,cz));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=max(max(xs)-min(xs),max(zs)-min(zs))*1.43;scene.camera=cam
    scene.view_settings.view_transform='AgX';scene.render.filepath=str(OUTPUT.with_name('apartment-a3-thumbnail.png'))
    if os.environ.get('BRIGADE_BLEND_PATH'):
        bpy.ops.wm.save_as_mainfile(filepath=os.environ['BRIGADE_BLEND_PATH'])
    bpy.ops.render.render(write_still=True)

if __name__=='__main__':main()
