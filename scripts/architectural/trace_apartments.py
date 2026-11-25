"""Trace individually registered brochure plans; compute constructive geometry and walkable paths."""
from pathlib import Path
from collections import defaultdict,deque
import heapq,json,math
import numpy as np
from shapely.geometry import Polygon, MultiPolygon, box, Point, LineString
from shapely.ops import unary_union,linemerge,nearest_points
from shapely import contains_xy,affinity
from plan_traces import TRACES,IDS

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'dist/assets/apartments'
BROCHURE={row['code']:row for row in json.loads((ROOT/'dist/assets/brochure-manifest.json').read_text())['layouts']}
LABELS={'b1':'Bedroom 1','b2':'Bedroom 2','b3':'Bedroom 3','mb':'Primary bedroom','w1':'Washroom 1','w2':'Washroom 2','w3':'Washroom 3','mw':'Primary washroom','fn':'Family lounge','ki':'Kitchen','ut':'Utility','cl':'Walk-in closet','c1':'Bedroom closet','li':'Living area','dn':'Dining','dk':'Expansive deck','st':'Study','pj':'Puja','sr':'Storage'}
def largest(g):return max((i for i in g.geoms if i.geom_type=='Polygon'),key=lambda x:x.area) if g.geom_type!='Polygon' else g
def poly(v):return box(*v) if len(v)==4 else Polygon(list(zip(v[::2],v[1::2]))).buffer(0)
def parts(g):return list(g.geoms) if hasattr(g,'geoms') else [g]
def output(path,obj):path.write_text(json.dumps(obj,ensure_ascii=False,indent=1)+'\n')
def coord(p):return [round(float(x),4) for x in p]
def points(p):return [coord(x) for x in list(p.exterior.coords)[:-1]]
def main(code,s):
    out=OUT/code;out.mkdir(parents=True,exist_ok=True)
    brochure=BROCHURE[code];page=brochure['source_pdf_page']
    ox,oy=s['main'][:2];ppm=s['ppm'];scalar=lambda p:((p[0]-ox)/ppm,(p[1]-oy)/ppm)
    def metric(g):return affinity.scale(affinity.translate(g,-ox,-oy),1/ppm,1/ppm,origin=(0,0))
    room={key:metric(poly(v)) for key,v in s['rooms'].items()}
    outline=unary_union([metric(box(*s['main'])),room['dk']])
    for v in s['voids']:outline=outline.difference(metric(box(*v)))
    for key in room:room[key]=largest(room[key].intersection(outline)).simplify(.001)
    room['dn']=largest(outline.difference(unary_union(list(room.values())))).simplify(.001)
    outline=unary_union(list(room.values()))
    if outline.geom_type!='Polygon':raise ValueError((code,outline.geom_type))
    # Split each unique room interface at every T junction. Preserve both sides
    # of shafts so they are never accessible through a neighboring room.
    pieces=parts(unary_union([p.boundary for p in room.values()]))
    spans=defaultdict(list)
    for line in pieces:
        for p,q in zip(line.coords,list(line.coords)[1:]):
            l=LineString([p,q]);mid=l.interpolate(.5,normalized=True)
            if l.length<.003:continue
            neighbors=tuple(sorted(k for k,r in room.items() if r.boundary.distance(mid)<.001))
            axis=int(abs(q[1]-p[1])>abs(q[0]-p[0]))
            fixed=round(p[1-axis],5)
            spans[(neighbors,axis,fixed)].append(sorted([p[axis],q[axis]]))
    interfaces=[]
    for (names,axis,fixed),segments in spans.items():
        combined=[]
        for lo,hi in sorted(segments):
            if combined and lo<combined[-1][1]+.002:combined[-1][1]=max(hi,combined[-1][1])
            else:combined.append([lo,hi])
        for lo,hi in combined:
            coords=lambda a: [fixed,a] if axis else [a,fixed]
            interfaces.append({'names':names,'a':coords(lo),'b':coords(hi),'cuts':[]})
    social={'fn','li','dn','st','pj'}
    def is_open(x):return len(x['names'])==2 and set(x['names'])<=social
    def open_at(position,types,room_key=None,other=None,width=1):
        p=Point(scalar(position));best=None
        for target in interfaces:
            n=target['names'];line=LineString([target['a'],target['b']])
            if (room_key and room_key not in n) or (types=='door' and len(n)!=2) or (types=='entry' and len(n)!=1) or (types=='window' and len(n)!=1 and 'dk' not in n):continue
            if types=='window' and n==('dk',):continue
            if is_open(target) or line.length<.60:continue
            penalty=0 if not other or other in n else 2.5
            t=line.project(p);width_here=min(width,line.length-.1)
            pos=max(width_here/2+.04,min(line.length-width_here/2-.04,t))
            distance=p.distance(line.interpolate(pos))+penalty
            if best is None or distance<best[0]:best=(distance,target,pos,width_here)
        if best is None:raise ValueError((code,types,room_key,other,position))
        delta,target,pos,ww=best
        line=LineString([target['a'],target['b']])
        if delta>2.8:print('CHECK SOURCE',code,room_key,other,position,round(delta,2),target['names'])
        target['cuts'].append((pos-ww/2,pos+ww/2,types))
        return list(line.interpolate(pos).coords)[0]
    for a,b,x,y in s['doors']:open_at((x,y),'door',a,b,1.65 if a=='dk' else .95 if a in ('mb','b1','b2','b3','ki') else .83)
    entry=open_at(s['entry'],'entry','li',width=1.05)
    for p in s['windows']:open_at(p,'window',width=1.42)
    walls=[];railings=[];openings=[]
    def wall(a,b,y,h):
        if math.dist(a,b)<.015:return
        walls.append({'id':'wall-'+str(len(walls)+1),'a':coord(a),'b':coord(b),'height_m':h,'base_y_m':y,'thickness_m':.14})
    for edge in interfaces:
        names=edge['names']
        if is_open(edge):continue
        line=LineString([edge['a'],edge['b']]);position=lambda t:coord(line.interpolate(t).coords[0])
        if names==('dk',):
            railings.append({'id':'rail-'+str(len(railings)+1),'a':edge['a'],'b':edge['b'],'height_m':1.1});continue
        last=0
        for lo,hi,kind in sorted(edge['cuts']):
            lo=max(lo,last)
            if hi-lo<.15:continue
            wall(position(last),position(lo),0,3)
            y=.94 if kind=='window' else 0
            top=2.5 if kind=='window' else 2.44
            if y:wall(position(lo),position(hi),0,y)
            wall(position(lo),position(hi),top,round(3-top,3))
            openings.append({'id':('entry' if kind=='entry' else 'opening-'+str(len(openings)+1)),
                 'type':kind if kind=='window' else 'sliding_door' if 'dk' in names else 'door','a':position(lo),'b':position(hi),
                 'center':position((lo+hi)/2),'width_m':round(hi-lo,3),'height_m':round(top-y,3),'sill_m':y,
                 'connects':[IDS[k] for k in names]+(['outside'] if kind=='entry' else []),'source_pdf_page':page,'status':'approximate raster trace'})
            last=hi
        wall(position(last),position(line.length),0,3)
    # Doors and window holes come directly from registered points above. New
    # furnishings are fitted to each distinct footprint and clear the door arc.
    doors=[(Point(o['center']),set(o['connects'])) for o in openings if o['type']!='window']
    furnishings=[]
    def furnish(key,kind,w,d,rotation=0,edge=None,near=None):
        r=room[key]; x0,z0,x1,z1=r.bounds
        restrictions=[p.buffer(.53) for p,n in doors if IDS[key] in n]
        previous=[box(*f['bounds']).buffer(.05) for f in furnishings if f['room']==IDS[key]]
        shape=(d,w) if rotation in (90,270) else (w,d)
        width,depth=shape
        candidates=[]
        for x in np.linspace(x0+width/2+.12,x1-width/2-.12,max(3,int((x1-x0)*5))):
            for z in np.linspace(z0+depth/2+.12,z1-depth/2-.12,max(3,int((z1-z0)*5))):
                bbox=box(x-width/2,z-depth/2,x+width/2,z+depth/2)
                if not r.covers(bbox) or any(v.intersects(bbox) for v in restrictions+previous):continue
                wallDist={'west':x-x0-width/2,'east':x1-x-width/2,'north':z-z0-depth/2,'south':z1-z-depth/2}.get(edge,0)
                anchor=near if near else r.representative_point().coords[0]
                candidates.append((8*wallDist+math.dist((x,z),anchor),x,z,bbox))
        if not candidates:return False
        _,x,z,b=min(candidates,key=lambda v:v[0])
        furnishings.append({'room':IDS[key],'kind':kind,'center':coord((x,z)),'width':round(w,3),'depth':round(d,3),'rotation':rotation,'bounds':coord(b.bounds)})
        return True
    for k,r in room.items():
        x0,z0,x1,z1=r.bounds; ww=x1-x0; dd=z1-z0
        if k in s['heads']:
            edge=s['heads'][k]; rot={'north':0,'south':180,'west':270,'east':90}[edge]
            furnish(k,'bed',1.74 if k=='mb' else 1.55,2.10,rot,edge)
        elif k in ('li','fn'):
            edge='south' if k=='li' and code in ['A1','A2','A4','A5','B10','B11','B12','B14'] else 'west' if k=='fn' and code in ['A6','A7','B8','B9'] or k=='li' and code in ['B8','B9','A7'] else 'east' if k=='fn' and code in ['A1','B14'] else 'south'
            rot={'south':0,'west':90,'east':270}[edge]
            furnish(k,'sofa',min(2.8,(ww if edge=='south' else dd)-.55),.94,rot,edge)
        elif k=='dn':furnish(k,'dining',1.7,1.84,0,near=(r.centroid.x,r.centroid.y))
        elif k=='ki':
            edge='south' if code not in ('A1','B14','B10','B11') else 'east'
            furnish(k,'kitchen',min(2.64,(ww if edge=='south' else dd)-.45),.58,0 if edge=='south' else 270,edge)
        elif k in ('w1','w2','w3','mw'):
            furnish(k,'vanity',min(.75,ww-.5),.43,0,'north')
            furnish(k,'wc',.42,.62,0,'south')
        elif k in ('st','pj','sr','cl','c1','ut'):
            furnish(k,{'st':'desk','pj':'shelf','sr':'shelf','cl':'wardrobe','c1':'wardrobe','ut':'laundry'}[k],min(1.3,ww-.35),.43,0,'north')
        elif k=='dk':furnish(k,'planter',.42,.42,0,'east')
    def get_nav():
        obstacle=[LineString([w['a'],w['b']]).buffer(.27,cap_style=2) for w in walls if w['base_y_m']<1.6]
        obstacle+=[LineString([w['a'],w['b']]).buffer(.23) for w in railings]
        for o in openings:
            if o['type']=='sliding_door':
                a,b=np.array(o['a']),np.array(o['b'])
                obstacle.append(LineString([a,a+.2*(b-a)]).buffer(.23))
        obstacle.extend(box(*f['bounds']).buffer(.205,join_style=2) for f in furnishings)
        safe=outline.buffer(-.195).difference(unary_union(obstacle))
        step=.15;x0,z0,x1,z1=outline.bounds
        xs=np.arange(x0+.08,x1,step);zs=np.arange(z0+.08,z1,step);X,Z=np.meshgrid(xs,zs)
        grid=contains_xy(safe,X,Z)
        dest={};nodes=[];edges=[];edge_set=set()
        def vector(pt):return [round(float(xs[pt[1]]),4),1.6,round(float(zs[pt[0]]),4)]
        def lookup(key,r,near=None):
            mask=grid&contains_xy(r.buffer(-.06),X,Z)
            coords=np.argwhere(mask)
            if not len(coords):raise ValueError((code,'unwalkable',key))
            furnished=next((f for f in furnishings if f['room']==IDS.get(key)),None)
            focus=furnished['center'] if furnished else list(r.representative_point().coords[0])
            if near:target=near
            else:
                # Choose a viewpoint away from the furniture's center, within the room and
                # with a reasonable view distance for fixtures and small service rooms.
                center=r.representative_point();target=(center.x,center.y)
            scores=(xs[coords[:,1]]-target[0])**2+(zs[coords[:,0]]-target[1])**2
            if furnished and not near:
                desired=min(2.15,max(.8,min(r.bounds[2]-r.bounds[0],r.bounds[3]-r.bounds[1])*.57))
                scores+=3*(np.hypot(xs[coords[:,1]]-focus[0],zs[coords[:,0]]-focus[1])-desired)**2
            best=tuple(coords[int(scores.argmin())]);pos=vector(best)
            if math.dist([pos[0],pos[2]],focus)<.25:focus=[focus[0]+.6,focus[1]+.4]
            rid=IDS.get(key,'living');nid=IDS.get(key,'entrance')
            dest[nid]=best;nodes.append({'id':nid,'room_id':rid,'position':pos,'look_at':coord([focus[0],1.08 if furnished else 1.4,focus[1]])})
        for key,r in room.items():lookup(key,r)
        lookup('entry',room['li'],entry)
        root=dest['entrance'];tree={root:None};queue=deque([root])
        while queue:
            iz,ix=queue.popleft()
            for dz,dx in ((0,-1),(0,1),(-1,0),(1,0),(-1,-1),(-1,1),(1,-1),(1,1)):
                zz,xx=iz+dz,ix+dx;nextpt=(zz,xx)
                if zz<0 or xx<0 or zz>=len(zs) or xx>=len(xs) or not grid[zz,xx] or nextpt in tree:continue
                if dx and dz and not(grid[zz,ix] and grid[iz,xx]):continue
                tree[nextpt]=(iz,ix);queue.append(nextpt)
        missing=[id for id,q in dest.items() if q not in tree]
        if missing:raise RuntimeError((code,'unreachable',missing))
        common={root:'entrance'}
        for nid,q in dest.items():
            if nid=='entrance':continue
            path=[]
            while q is not None:path.append(q);q=tree[q]
            path.reverse();idx=0;last='entrance'
            while idx<len(path)-1:
                pos=vector(path[idx])
                n=len(path)-1
                while n>idx+1:
                    end=vector(path[n])
                    if safe.covers(LineString([(pos[0],pos[2]),(end[0],end[2])])):break
                    n-=1
                pp=path[n];nodeid=nid if n==len(path)-1 else common.get(pp)
                if not nodeid:
                    nodeid='junction-'+str(len(common));common[pp]=nodeid
                    v=vector(pp);nodes.append({'id':nodeid,'room_id':None,'position':v,'look_at':[v[0],1.6,v[2]-.8]})
                key=tuple(sorted((last,nodeid)))
                if key not in edge_set and last!=nodeid:edge_set.add(key);edges.append({'a':last,'b':nodeid,'bidirectional':True})
                idx=n;last=nodeid
            if len(path)==1:edges.append({'a':'entrance','b':nid,'bidirectional':True})
        return nodes,edges
    # Tight bathroom/closet routes take precedence over freestanding furnishings.
    # Remove a non-structural item when its clearance breaks the rooted graph.
    original_furniture=list(furnishings)
    while True:
        try:nodes,edges=get_nav();break
        except RuntimeError as e:
            missing=e.args[0][2]
            blocked=[f for f in furnishings if f['room'] in missing]
            if not blocked:
                if furnishings:blocked=[furnishings[-1]]
                else:raise
            f=blocked[-1];furnishings.remove(f)
            print('Clearance adjustment',code,f['room'],f['kind'])
    roomlist=[]
    for k,r in room.items():
        node=next(n for n in nodes if n['id']==IDS[k])
        roomlist.append({'id':IDS[k],'label':LABELS[k],'polygon':points(r),'center':[node['position'][0],node['position'][2]],'published_dimensions_m':s['dimensions'].get(k),'dimension_status':'brochure_annotation' if k in s['dimensions'] else 'not independently verified','source_pdf_page':page})
    geometry={'layout_code':code,'project':'Brigade Barcelona','source_pdf_page':page,'status':'brochure-traced illustrative model','notice':'Wall centerlines, seams, portals, material finishes, furniture and viewpoints are interpretive reconstructions. Service shafts and outdoor-unit ledges are excluded from the walkthrough.',
      'coordinate_system':{'units':'meters','up':'Y','x':'right on plan','z':'down on plan','plan_image':{'width':1120,'height':1584,'origin':coord((ox*4/3,(oy+69)*4/3)),'pixels_per_meter':round(ppm*4/3,6)},'true_north':'brochure compass only; no surveyed bearing'},
      'calibration':{'method':'approximate wall-center span versus printed bedroom dimensions; scale is for illustration','pixels_per_meter_in_authoring_frame':ppm},'areas':{'total_sba_sqft':brochure['total_sba_sqft'],'total_carpet_area_sqft':brochure['total_carpet_area_sqft']},'assumptions':{'ceiling_height_m':3.0,'eye_height_m':1.6},'rooms':roomlist,'outline':points(outline),'entrance_node':'entrance','entry':coord(entry),'walls':walls,'openings':openings,'railings':railings,'navigation_nodes':nodes,'navigation_edges':edges,'guided_tour':[IDS[k] for k in ['li','dn','fn','dk','mb','st','b3','ki'] if k in room],'furnishings':furnishings}
    for r in roomlist:
        if r['id']=='deck':r['dimension_extent']='Printed main deck section; see the source plan for adjoining deck returns.'
        if r['id']=='dining':
            r['holes']=[list(map(coord,list(ring.coords)[:-1])) for ring in room['dn'].interiors]
    output(out/'geometry.json',geometry)
    output(out/'colliders.json',{'boxes':[{'name':f["kind"]+' '+f['room'],'min':[f['bounds'][0],0,f['bounds'][1]],'max':[f['bounds'][2],1.35,f['bounds'][3]]} for f in furnishings]})
    output(out/'views.json',{'layout_code':code,'source_pdf_page':page,'views':[{'room_id':r['id'],'label':r['label'],'node_id':r['id'],'file':'room-'+r['id']+'.webp',**{k:next(n[k] for n in nodes if n['id']==r['id']) for k in ('position','look_at')}} for r in roomlist]})
    print(code,len(roomlist),'rooms',len(nodes),'nodes',len(furnishings),'furnishings; '+str(len(original_furniture)-len(furnishings))+' removed')
if __name__=='__main__':
    import sys
    for code in sys.argv[1:] or TRACES:main(code,TRACES[code])
