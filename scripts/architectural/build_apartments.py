"""Build independent editable Blender scenes and web GLBs from the twelve plan traces.

blender -b -t 4 --python scripts/architectural/build_apartments.py -- A1 A2 ...
Requires gltfpack on PATH or GLTFPACK=/path/to/gltfpack. Textures are packed in .blend.
"""
import bpy
import json, math, os, sys, subprocess, tempfile
from pathlib import Path
from collections import defaultdict
from mathutils import Vector
import numpy as np
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'dist/assets/apartments';MASTERS=ROOT/'models/apartments';MASTERS.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'scripts'))
from bake_apartment import bake
sys.path.insert(0,str(Path(__file__).parent))
from pack_apartments import pack

def v(x,y,z):return (x,-z,y)
def empty(name,parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;return o

def material(name,color,rough=.65,metal=0,alpha=1,source=None):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,alpha);m.use_nodes=True
    n=m.node_tree.nodes;p=n.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;p.inputs['Alpha'].default_value=alpha
    if alpha<1:m.surface_render_method='DITHERED'
    if source:
        tex=n.new('ShaderNodeTexImage');image=bpy.data.images.load(str(ROOT/'models/materials'/f'{source}-color.jpg'),check_existing=True);tex.image=image
        # Warm neutral fabric preserves the actual weave and the authored material color.
        if source=='fabric' and image.name!='Neutral boucle':
            img=bpy.data.images.get('Neutral boucle')
            if not img:
                img=image.copy();img.name='Neutral boucle'
                w,h=img.size[:];buf=np.empty(w*h*4,dtype=np.float32);img.pixels.foreach_get(buf)
                vals=buf.reshape(h,w,4);lum=vals[:,:,0]*.22+vals[:,:,1]*.71+vals[:,:,2]*.07
                vals[:,:,:3]=(.76+.10*(lum/max(.01,np.mean(lum))-1)).clip(.4,1)[:,:,None]
                img.pixels.foreach_set(vals.ravel());img.update();img.pack()
            tex.image=img
        # A simple multiply is recognized by Blender's glTF exporter as baseColorFactor.
        tint=n.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1
        tint.inputs[2].default_value=(*color,1);m.node_tree.links.new(tex.outputs['Color'],tint.inputs[1]);m.node_tree.links.new(tint.outputs[0],p.inputs['Base Color'])
        normal=n.new('ShaderNodeTexImage');normal.image=bpy.data.images.load(str(ROOT/'models/materials'/f'{source}-normal.jpg'),check_existing=True);normal.image.colorspace_settings.name='Non-Color'
        normalmap=n.new('ShaderNodeNormalMap');normalmap.inputs['Strength'].default_value=.22
        m.node_tree.links.new(normal.outputs['Color'],normalmap.inputs['Color']);m.node_tree.links.new(normalmap.outputs['Normal'],p.inputs['Normal'])
    return m

class Batch:
    def __init__(self):self.vertices=[];self.faces=[];self.smooth=[]
    def add(self,P,F,smooth=False):
        i=len(self.vertices);self.vertices.extend(P);self.faces.extend([[i+k for k in f] for f in F]);self.smooth.extend([smooth]*len(F))
    def mesh(self,name,mat,parent,period):
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(self.vertices,[],self.faces);mesh.update()
        obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.parent=parent;mesh.materials.append(mat)
        uv=mesh.uv_layers.new(name='Surface')
        for poly,sm in zip(mesh.polygons,self.smooth):
            poly.use_smooth=sm
            axis=max(range(3),key=lambda i:abs(poly.normal[i]));indices=((1,2),(0,2),(0,1))[axis]
            for l in poly.loop_indices:
                pos=mesh.vertices[mesh.loops[l].vertex_index].co;uv.data[l].uv=(pos[indices[0]]/period,pos[indices[1]]/period)
        return obj

class Studio:
    def __init__(self,data):
        self.data=data;self.root=empty('Residence_'+data['layout_code'])
        self.root['brochure_page']=data['source_pdf_page'];self.root['status']='Illustrative architectural reconstruction'
        self.groups={g:empty(g,self.root) for g in ['floors','walls_lower','walls_upper','openings','ceiling','lighting_fixtures','furniture','fixed_fittings']}
        self.mats={
         'plaster':material('Ivory lime plaster',(.79,.76,.68)), 'paint':material('Warm ceiling paint',(.88,.86,.80)),
         'floor':material('Marble-finish tile',(.94,.91,.83),.35,source='marble'),
         'stone':material('Stone counter and tile',(.69,.67,.61),.45,source='marble'),
         'timber':material('Walnut veneer',(.95,.86,.76),.43,source='walnut'), 'darkwood':material('Smoked oak',(.48,.41,.34),.45,source='walnut'),
         'fabric':material('Ivory boucle',(.91,.84,.70),.86,source='fabric'),
         'linen':material('Stone linen',(.71,.66,.55),.94,source='fabric'),
         'accent':material('Sage textile',(.36,.44,.35),.85,source='fabric'),
         'ochre':material('Ochre textile',(.62,.36,.22),.88,source='fabric'),
         'metal':material('Patinated brass',(.47,.34,.19),.31,.76), 'black':material('Blackened steel',(.047,.049,.043),.38,.31),
         'china':material('Ivory ceramic',(.90,.89,.83),.23), 'glass':material('Clear glazing',(.80,.9,.89),.10,.05,.12),
         'botanical':material('Plant foliage',(.17,.28,.16),.67),'pot':material('Earthenware',(.54,.39,.26),.74),
         'glow':material('Warm architectural light',(.98,.84,.58),.5)}
        bs=self.mats['glow'].node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.73,.45,1);bs.inputs['Emission Strength'].default_value=.55
        self.batches=defaultdict(Batch);self.x=self.z=self.a=0.;self.group='furniture';self.owner='';self.ownerGroups={}
    def frame(self,x=0,z=0,angle=0,group='furniture',owner=''):
        self.x=x;self.z=z;self.a=math.radians(angle);self.group=group;self.owner=owner
    def add(self,mat,coords,faces,smooth=False):
        c,s=math.cos(self.a),math.sin(self.a);pts=[v(self.x+c*x-s*z,y,self.z+s*x+c*z) for x,y,z in coords]
        self.batches[self.group,self.owner,mat].add(pts,faces,smooth)
    def box(self,x,y,z,w,h,d,mat):
        corners=[(x+sx*w/2,y+sy*h/2,z+sz*d/2) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
        self.add(mat,corners,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)])
    def round(self,x,y,z,w,h,d,mat,edge=.31):
        # Superellipsoid: a continuous curved seam and gently crowned upholstery.
        signed=lambda q,e:math.copysign(abs(q)**e,q)
        segments,rings=24,12;P=[];F=[]
        for j in range(rings+1):
            t=-math.pi/2+math.pi*j/rings
            for i in range(segments):
                a=i*2*math.pi/segments;r=signed(math.cos(t),edge)
                P.append((x+w*.5*r*signed(math.cos(a),edge),y+h*.5*signed(math.sin(t),edge),z+d*.5*r*signed(math.sin(a),edge)))
        for j in range(rings):
            for i in range(segments):
                k=j*segments+i;l=j*segments+(i+1)%segments;F.append((k,k+segments,l+segments,l))
        self.add(mat,P,F,True)
    def cyl(self,x,y,z,r,h,mat,rz=None,top=None):
        n=32;rz=rz or r;top=1 if top is None else top
        P=[(x+math.cos(i*2*math.pi/n)*r*f,y+dy*h/2,z+math.sin(i*2*math.pi/n)*rz*f) for dy,f in [(-1,1),(1,top)] for i in range(n)]
        F=[tuple(range(n)),tuple(reversed(range(n,n*2)))]+[(i,i+n,(i+1)%n+n,(i+1)%n) for i in range(n)]
        self.add(mat,P,F,True)
    def sheet(self,poly,y,mat,under=False):
        P=[(x,y,z) for x,z in poly];area=sum(P[i][0]*P[(i+1)%len(P)][2]-P[(i+1)%len(P)][0]*P[i][2] for i in range(len(P)))
        if (area>0)!=under:P.reverse()
        self.add(mat,P,[list(range(len(P)))])
    def architecture(self):
        g=self.data;self.frame(group='floors')
        self.sheet(g['outline'],-.035,'floor')
        for r in g['rooms']:
            self.frame(group='floors');mat='timber' if r['id']=='deck' else 'stone' if ('bath' in r['id'] or r['id']=='utility') else 'floor'
            self.sheet(r['polygon'],0,mat)
            if r['id']!='deck':
                self.frame(group='ceiling');self.sheet(r['polygon'],3.005,'paint',True)
        for w in g['walls']:
            a,b=w['a'],w['b'];x=(a[0]+b[0])/2;z=(a[1]+b[1])/2;angle=math.degrees(math.atan2(b[1]-a[1],b[0]-a[0]));length=math.dist(a,b);start=w['base_y_m'];end=start+w['height_m']
            for lo,hi,group in [(start,min(1.04,end),'walls_lower'),(max(1.04,start),end,'walls_upper')]:
                if hi<=lo:continue
                self.frame(x,z,angle,group);self.box(0,(lo+hi)/2,0,length,hi-lo,.14,'plaster')
            if start==0:self.frame(x,z,angle,'walls_lower');self.box(0,.046,0,length,.092,.153,'timber')
        for o in g['openings']:
            a,b=o['a'],o['b'];length=math.dist(a,b);x,z=o['center'];angle=math.degrees(math.atan2(b[1]-a[1],b[0]-a[0]));h=o['height_m'];y=o['sill_m']
            self.frame(x,z,angle,'walls_upper','Window and door trim')
            if o['type']=='window':
                self.box(0,y+h/2,0,length,h,.014,'glass');self.box(0,y,0,length,.035,.17,'stone')
                for u in [-.5,0,.5]:self.box(u*length,y+h/2,0,.028,h,.04,'metal')
                for v1 in [y,y+h]:self.box(0,v1,0,length,.025,.045,'metal')
                if any('bedroom' in s for s in o['connects']):
                    self.frame(x,z,angle,'lighting_fixtures')
                    for end in [-1,1]:
                        P=[];F=[]
                        for j in range(5):
                            for i in range(25):
                                t=i/24;P.append((end*(length*.5-.19*t),.12+j*.65,.12+.032*math.sin(t*math.pi*7)))
                                k=j*25+i
                                if i<24 and j<4:F.append((k,k+1,k+26,k+25))
                        self.add('fabric',P,F,True)
            else:
                for side in [-1,1]:self.box(side*(length/2-.012),h/2,0,.03,h,.15,'timber')
                if o['type']=='sliding_door':self.box(-length*.4,h/2,0,length*.2,h,.014,'glass')
        for rail in g['railings']:
            a,b=rail['a'],rail['b'];length=math.dist(a,b);self.frame((a[0]+b[0])/2,(a[1]+b[1])/2,math.degrees(math.atan2(b[1]-a[1],b[0]-a[0])),'openings')
            self.box(0,.53,0,length,1.06,.022,'glass');self.box(0,1.09,0,length,.04,.04,'metal')
            for t in range(max(1,int(length/1.2))+1):self.box(-length/2+length*t/max(1,int(length/1.2)),.52,0,.023,1.05,.03,'metal')
    def furnish(self,item):
        kind=item['kind'];w=item['width'];d=item['depth'];x,z=item['center']
        group='fixed_fittings' if kind in ['wc','vanity','kitchen','laundry','wardrobe'] else 'furniture'
        self.frame(x,z,item['rotation'],group,item['room']+'_'+kind)
        B,R,C=self.box,self.round,self.cyl
        if kind=='bed':
            R(0,.21,.02,w,.29,d-.05,'darkwood');R(0,.43,0,w-.06,.25,d-.12,'fabric')
            R(0,.56,.25,w-.04,.14,d*.67,'linen')
            R(0,.64,d*.31,w-.025,.055,.37,'ochre')
            B(0,.72,-d*.47,w,1.30,.095,'timber')
            for i in range(6):R((i-2.5)*w/6,.82,-d*.435,w/6-.008,.94,.08,'linen')
            for side in [-1,1]:R(side*w*.244,.66,-d*.29,w*.43,.17,.43,'fabric');R(side*w*.22,.72,-d*.20,w*.29,.14,.31,'accent')
        elif kind=='sofa':
            R(0,.25,0,w,.37,d,'linen')
            R(0,.65,d*.40,w,.67,d*.18,'fabric')
            for i in [-1,0,1]:R(i*(w-.31)/3,.46,-.035,(w-.34)/3,.20,d*.74,'fabric')
            for side in [-1,1]:
                R(side*(w*.5-.075),.50,0,.15,.5,d,'linen')
                R(side*w*.30,.75,d*.21,.42,.41,.15,'accent' if side<0 else 'ochre')
            # Wall-mounted triptych; an original abstract study in contemporary local materials.
            for i in [-1,0,1]:
                px=i*w*.24
                B(px,1.82,d*.51,w*.217,.69,.035,'metal');B(px,1.82,d*.487,w*.204,.66,.018,'fabric')
                R(px-.034,1.87,d*.473,w*.13,.39,.008,'ochre' if i==0 else 'accent',.65)
        elif kind=='dining':
            R(0,.78,0,w*.57,.074,d*.91,'timber');R(0,.39,0,w*.24,.73,d*.49,'darkwood')
            C(0,.851,.12,.092,.10,'pot',top=.44)
            for i in [-1,1]:
                for j in [-1,0,1]:
                    x=i*w*.38;z=j*d*.29
                    R(x,.45,z,w*.24,.105,d*.22,'fabric');R(x+i*w*.095,.66,z,.065,.45,d*.23,'linen')
                    for sx in [-1,1]:
                        for sz in [-1,1]:B(x+sx*w*.08,.21,z+sz*d*.076,.032,.40,.032,'darkwood')
        elif kind=='kitchen':
            B(0,.43,0,w,.85,d,'timber');B(0,.89,0,w+.018,.06,d+.015,'stone');n=max(2,int(w/.53))
            for i in range(n):
                px=-w/2+(i+.5)*w/n;B(px,.46,-d*.506,w/n-.014,.70,.02,'timber');B(px,.74,-d*.54,.16,.014,.018,'metal')
            B(-w*.24,.934,0,w*.30,.016,d*.65,'black');B(w*.24,.932,-.02,w*.26,.014,d*.57,'metal')
            C(w*.24,1.04,.15,.018,.22,'metal')
            B(0,2.12,d*.19,w,.66,d*.54,'paint')
            for i in range(n-1):B(-w/2+(i+1)*w/n,2.12,-d*.084,.008,.65,.016,'metal')
        elif kind=='vanity':
            B(0,.47,0,w,.67,d,'timber');B(0,.84,0,w+.01,.055,d,'stone');R(0,.90,-.01,w*.69,.12,d*.65,'china');C(w*.31,1.01,d*.23,.012,.24,'metal');B(0,1.54,d*.46,w*.86,.72,.018,'metal')
        elif kind=='wc':
            R(0,.35,.01,w*.93,.34,d*.82,'china');R(0,.48,-.025,w,.095,d*.78,'china');R(0,.525,-.024,w*.75,.018,d*.57,'stone');B(0,.64,d*.39,w*.86,.4,.11,'china')
        elif kind=='wardrobe' or kind=='shelf':
            B(0,1.13,0,w,2.25,d,'timber')
            for i in [-1,1]:
                B(i*w*.248,1.13,-d*.515,w*.491,2.21,.024,'darkwood');B(i*.065,1.16,-d*.55,.015,.29,.023,'metal')
        elif kind=='desk':
            B(0,.76,0,w,.06,d,'timber')
            for i in [-1,1]:B(i*w*.43,.37,0,.035,.74,d*.85,'black')
            B(0,.82,0,.29,.03,.20,'accent');C(w*.32,.93,.02,.055,.3,'metal')
        elif kind=='laundry':
            B(0,.46,0,w,.9,d,'paint');R(0,.48,-d*.504,.37,.36,.018,'black');B(0,.94,0,w,.06,d,'stone')
        elif kind=='planter':
            C(0,.26,0,w*.46,.48,'pot',top=.85)
            for j in range(12):
                ang=j*2.4;xx=math.cos(ang)*w*.29;zz=math.sin(ang)*d*.29;R(xx,.55+j*.045,zz,.18,.09,.13,'botanical',.92)
    def finish(self):
        for (grp,owner,mat),batch in self.batches.items():
            parent=self.groups[grp]
            if owner:
                if owner not in self.ownerGroups:self.ownerGroups[owner]=empty(owner,parent)
                parent=self.ownerGroups[owner]
            name=(grp if not owner else owner)+'__'+mat
            batch.mesh(name,self.mats[mat],parent,.3 if mat in ('fabric','linen','ochre','accent') else 1.45)
        for room in self.data['rooms']:
            if room['id']=='deck':continue
            X=[a[0] for a in room['polygon']];Z=[a[1] for a in room['polygon']]
            x=(min(X)+max(X))/2;z=(min(Z)+max(Z))/2
            if room['id']=='dining':x,z=room['center']
            bpy.ops.object.light_add(type='AREA',location=v(x,2.84,z));lamp=bpy.context.object;lamp.name='Presentation light '+room['label'];lamp.data.energy=90 if 'bathroom' not in room['id'] else 37;lamp.data.color=(1,.89,.75);lamp.data.shape='DISK';lamp.data.size=2.2

def build(code):
    g=json.loads((DATA/code/'geometry.json').read_text());sc=bpy.context.scene
    if bpy.data.objects:bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    s=Studio(g);s.architecture()
    for item in g['furnishings']:s.furnish(item)
    s.finish()
    sc.render.engine='CYCLES';sc.cycles.samples=12;sc.cycles.use_denoising=True
    sc.world.use_nodes=True;bg=sc.world.node_tree.nodes.get('Background');bg.inputs[0].default_value=(.76,.83,.91,1);bg.inputs[1].default_value=.67
    sc.view_settings.view_transform='AgX';sc.view_settings.exposure=-.25
    bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Buyer viewpoint';cam.data.lens=20;sc.camera=cam
    vp=next(n for n in g['navigation_nodes'] if n['id']=='living');cam.location=v(*vp['position']);cam.rotation_euler=(Vector(v(*vp['look_at']))-cam.location).to_track_quat('-Z','Y').to_euler()
    with tempfile.TemporaryDirectory() as temp:
        master=Path(temp)/'master.glb'
        bake(sc,master,atlas_size=512,samples=14)
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=str(MASTERS/f'apartment-{code.lower()}.blend'),compress=True)
        output=DATA/code/f'apartment-{code.lower()}.glb'
        # Keep visibility and room groups, collapse nonessential render primitives.
        pack(master,code,output)
        print('FINISHED MODEL',code,output.stat().st_size,flush=True)
if __name__=='__main__':
    for code in sys.argv[sys.argv.index('--')+1:]:build(code)
