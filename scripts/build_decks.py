"""Model the three amenity levels in registered masterplan coordinates."""
import math

def rim(batch,x,y,z,rx,rz,height,mat,segments=36):
    poly=[(x+rx*math.cos(i*math.tau/segments),z+rz*math.sin(i*math.tau/segments)) for i in range(segments)]
    batch.solid(poly,y,height,mat)

def paths(batch,coords,width,y,mat):
    # Smooth the hand-traced control polygon with two rounds of corner cutting.
    for _ in range(2):
        coords=[pair for a,b in zip(coords,coords[1:]+coords[:1]) for pair in
                [(a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25),(a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75)]]
    batch.line(coords+coords[:1],width,y,.065,mat)

def bench(b,x,y,z,mat,metal,angle=0,length=2.4):
    b.box(x,y+.44,z,length,.16,.55,mat,angle)
    for q in [-.36,.36]:
        b.box(x+q*length*math.cos(angle),y+.20,z+q*length*math.sin(angle),.13,.4,.46,metal,angle)
    b.box(x+.25*math.sin(angle),y+.82,z-.25*math.cos(angle),length,.45,.12,mat,angle)

def pergola(b,x,y,z,r,p):
    for dx in [-r,r]:
        for dz in [-r*.72,r*.72]:b.box(x+dx,y+1.38,z+dz,.2,2.76,.2,p.stone)
    b.box(x,y+2.82,z,2*r+.42,.16,r*1.44+.42,p.light)
    for i in range(-3,4):
        b.box(x+i*r/3,y+2.98,z,.13,.14,r*1.44+.6,p.walnut)

def foliage(b,x,y,z,r,p,detail):
    rim(b,x,y,z,r,r*.72,.25,p.stone,22)
    rim(b,x,y+.25,z,r*.93,r*.65,.09,p.dark,22)
    if not detail:
        for i in range(7):
            angle=i*2.399963
            b.blob(x+math.cos(angle)*r*.47,y+.47,z+math.sin(angle)*r*.34,.31,.24,.28,[p.leaf,p.leaf2,p.leaf3][i%3],7)
        return
    for i in range(23):
        angle = i * 2.399963
        distance = math.sqrt((i+.45)/23) * r * .88
        px,pz = x+math.cos(angle)*distance,z+math.sin(angle)*distance*.69
        scale = .12+.063*((i*3)%7)
        if i%6==0:
            b.blob(px,y+.34+scale*.26,pz,scale*1.38,scale*.64,scale,p.leaf2,8)
        for j in range(9):
            a = angle+j*2.399963
            length = scale*(1.13+.11*(j%5))
            dx,dz = math.cos(a)*length,math.sin(a)*length
            spread = length*(.092 if i%4 else .21)
            sx,sz = -math.sin(a)*spread,math.cos(a)*spread
            base = y+.33
            crest = base+length*(1.25 if i%4 else .9)
            points = [
                (px,base,pz),
                (px+dx*.34+sx,crest-length*.27,pz+dz*.34+sz),
                (px+dx*.39,crest-length*.17,pz+dz*.39),
                (px+dx*.34-sx,crest-length*.27,pz+dz*.34-sz),
                (px+dx*.73+sx*.64,crest,pz+dz*.73+sz*.64),
                (px+dx*.77,crest+length*.055,pz+dz*.77),
                (px+dx*.73-sx*.64,crest,pz+dz*.73-sz*.64),
                (px+dx,crest-length*.23,pz+dz),
            ]
            faces = [(0,1,2),(0,2,3),(1,4,5,2),(2,5,6,3),(4,7,5),(5,7,6)]
            b.section(points,faces+[tuple(reversed(f)) for f in faces],[p.leaf,p.leaf2,p.leaf3][(i+j//3)%3])
        if i%5==1:
            for k in range(3):
                height = scale * (.97+k*.17)
                fx,fz = px+(k-1)*.1,pz+(i%3-1)*.055
                b.box(fx,y+.34+height*.5,fz,.012,height,.012,p.leaf2)
                for petals in range(3):
                    b.blob(fx,y+.35+height+.055*petals,fz,.045-petals*.008,.048,.042-petals*.007,p.flower,6)

def stone_frame(b,x,y,z,width,p,angle=0):
    for side in (-1,1):
        offset = side*(width/2-.25)
        px,pz = x+offset*math.cos(angle),z+offset*math.sin(angle)
        b.box(px,y+1.45,pz,.49,2.9,.58,p.stone,angle)
        b.box(px,y+.11,pz,.61,.22,.67,p.light,angle)
    b.box(x,y+2.89,z,width,.30,.63,p.stone,angle)
    b.box(x,y+3.11,z,width+.20,.14,.78,p.light,angle)
    b.box(x,y+3.24,z,width+.36,.12,.90,p.light,angle)

def plan_point(section,x,y):
    if section=='masterplan':return (x-345)*.25,(y-430)*.25
    if section=='eco-deck':return (160+(x-99)*.707-345)*.25,(273+(y-202)*.708-430)*.25
    return (265+(x-150)*.3875-345)*.25,(419+(y-220)*.362-430)*.25

def make_level(api,section,parent,ground,detail=True):
    Batch,p=api.Batch,api
    name=section['id'];root=api.group(name.replace('-','_'),parent,amenitySection=name)
    surface=Batch()
    if name=='eco-deck':
        # Podium top including the gathering lawn left of the occupied core.
        outline=[(99,226),(120,203),(583,203),(609,230),(609,443),(486,445),(480,655),(466,783),(340,768),(254,740),(161,710),(102,680)]
        surface.solid([plan_point(name,*q) for q in outline],ground-.25,.25,p.garden)
        curves=[[(122,245),(161,212),(245,235),(335,221),(441,225),(583,217),(593,296),(582,430),(502,442),(460,463),(466,565),(450,688),(470,758),(382,768),(280,717),(221,711),(205,666),(234,605),(231,520),(227,470),(169,447),(108,465)],
                [(144,475),(185,465),(214,491),(222,553),(202,601),(191,636),(150,644),(121,604),(119,532)],
                [(242,457),(309,446),(321,471),(298,525),(296,602),(280,640),(246,637),(243,555)],
                [(367,440),(415,414),(463,444),(465,510),(449,547),(452,623),(413,660),(367,640),(362,547)]]
    elif name=='sky-deck':
        curves=[]
        for xa,xb,za,zb in [(150,315,221,401),(393,568,221,401),(150,316,424,599),(393,568,423,600),(150,329,612,796),(379,568,611,796)]:
            poly=[plan_point(name,*q) for q in [(xa,za),(xb,za),(xb,zb),(xa,zb)]]
            surface.solid(poly,ground-.28,.26,p.garden)
            x,z=plan_point(name,(xa+xb)/2,(za+zb)/2);w,d=poly[2][0]-poly[0][0],poly[2][1]-poly[0][1]
            ring=[(x+math.cos(t*math.tau/16)*w*(.33+.08*math.sin(3*t*math.tau/16)),z+math.sin(t*math.tau/16)*d*.34) for t in range(16)]
            paths(surface,ring,1.12,ground,p.path)
        for path in [[(220,620),(315,626),(361,626),(411,610)],[(355,282),(356,443),(356,626)]]:
            surface.line([plan_point(name,*q) for q in path],1.65,ground-.1,.17,p.path)
    else:
        curves=[]
    for line in curves:
        coords=[plan_point(name,*q) for q in line]
        paths(surface,coords,1.52,ground,p.path)
        paths(surface,coords,.34,ground+.068,p.brick)
    if surface.faces:surface.object(name+'_paths_and_slab',root)
    for f in section['features']:
        n=f['number'];b=Batch()
        for k,loc in enumerate(f['locations']):
            x,y,z=loc['world']
            if name=='masterplan':
                if n in (1,2,9,11,14,15):
                    pergola(b,x,y,z,1.65,p)
                    if n==15:bench(b,x,y,z,p.walnut,p.dark)
                elif n==3:
                    b.box(x,y+1.18,z,2.1,2.36,1.7,p.glass)
                    b.box(x,y+2.45,z,2.55,.18,2.04,p.stone)
                elif n in (4,5,7,8,10):
                    b.box(x,y+.03,z,.8,.05,1.8,p.path)
                elif n==6:
                    for i in [-1,0,1]:
                        b.blob(x+i*.6,y+1.35,z+i*1.6,.28,1.15,.32,p.walnut,10)
                elif n in (12,20,21):
                    b.box(x,y+.02,z,4.8,.08,7.6,p.garden)
                    if n==20:
                        b.box(x,y+.4,z,2,.14,.54,p.walnut)
                        for dx in [-.9,.9]:b.box(x+dx,y+.23,z,.16,.46,.54,p.stone)
                    elif n==21:
                        b.box(x,y+.1,z,2.8,.09,13,p.path)
                elif n==13:
                    b.box(x,y+.22,z,4.8,.4,2.7,p.path)
                    for dx in [-1.3,1.3]:bench(b,x+dx,y+.42,z,p.walnut,p.dark,1.57)
                else:
                    # Painted service and baseline markers register to playing areas.
                    b.box(x,y+.032,z,3.2,.055,.11,p.lines)
            elif name=='eco-deck':
                if n in (2,13,18):
                    rim(b,x,y+.73,z,.75,.75,.09,p.light,16)
                    b.box(x,y+.36,z,.16,.72,.16,p.walnut)
                    for dx in [-1,1]:bench(b,x+dx,y,z,p.walnut,p.dark,math.pi/2,length=1.15)
                elif n in (3,8,9):
                    r=4.0 if n==9 else 1.9
                    for j in range(3):
                        for a in range(12):
                            ang=(a/12)*math.pi*1.6
                            b.box(x+(r+j*.43)*math.cos(ang),y+.13+j*.16,z+(r+j*.43)*math.sin(ang),.48,.26+j*.32,(r+j*.43)*.45,p.stone,-ang)
                    if n==9:rim(b,x,y+.018,z,r-.22,(r-.22)*.85,.08,p.garden)
                    if n==3:
                        for j in range(8):
                            theta = .25+j*.24
                            b.box(x+math.cos(theta)*2.6,y+.44,z+math.sin(theta)*2.6,.65,.14,.47,p.wood,theta+math.pi/2)
                elif n in (1,6,12,23):
                    pergola(b,x,y,z,1.55,p);bench(b,x,y,z,p.walnut,p.dark)
                elif n in (4,20):
                    b.box(x,y+1.25,z,1.86,2.5,.42,p.rust,.3)
                    if n==20:
                        for q in range(7):
                            b.blob(x+(q%3-.9)*.5,y+.50+.25*q,z+.29,.13,.1,.13,p.stone,6)
                elif n in (7,19):
                    rim(b,x,y,z,2.0,1.22,.26,p.stone)
                    rim(b,x,y+.27,z,1.84,1.07,.05,p.water if n==7 else p.path)
                elif n in (10,11,22):
                    bench(b,x,y,z,p.walnut,p.dark)
                elif n in (14,15):
                    rim(b,x,y,z,1,.8,.62,p.brick)
                    rim(b,x,y+.63,z,.78,.59,.03,p.dark)
                    bench(b,x,y,z+1.65,p.wood,p.dark)
                    if n==14:
                        stone_frame(b,x,y,z-.84,3.0,p)
                        for q in range(5):
                            b.blob(x+(q-2)*.17,y+.76+(.11 if q%2 else .02),z,.12,.15,.09,p.lamp,6)
                        foliage(b,x-1.8,y,z+.35,1.0,p,detail)
                        foliage(b,x+1.8,y,z+.35,1.0,p,detail)
                        walk=[(x-4.2,z-.55),(x-3.05,z-1.52),(x-1.64,z-1.82),(x+.3,z-1.67),(x+2.36,z-1.02)]
                        b.line(walk,1.19,y+.007,.048,p.path)
                        b.line(walk,.29,y+.051,.012,p.brick)
                elif n in (16,21,24):
                    foliage(b,x,y,z,1.7,p,detail)
                elif n in (17,25):
                    for dx in (-1.3,1.3):
                        for dz in (-.8,.8):b.box(x+dx,y+1.16,z+dz,.14,2.32,.14,p.walnut)
                    for q in range(6):b.box(x-1.25+.50*q,y+2.31,z,.11,.13,1.74,p.brick)
                elif n==5:
                    b.box(x,y+.78,z,2.2,.12,1.4,p.garden);b.box(x,y+.95,z,.04,.25,1.42,p.lines)
                    for dx in [-.88,.88]:b.box(x+dx,y+.38,z,.09,.76,1.1,p.walnut)
            else:
                if n in (1,5,9):
                    bench(b,x,y,z,p.walnut,p.dark)
                elif n in (2,4,11,12):
                    pergola(b,x,y,z,1.25,p);bench(b,x,y,z,p.walnut,p.dark)
                elif n in (6,7,8,10):
                    foliage(b,x,y,z,1.20,p,detail)
                    if n==6:
                        stone_frame(b,x,y,z+2.08,5.3,p)
                        for dx,dz,r in [(-.64,-.4,.36),(.5,.22,.29),(.2,-.58,.22)]:
                            b.blob(x+dx,y+.34+r,z+dz,r,r,r,p.lamp,12)
                        b.blob(x-.77,y+.34,z+.37,.44,.27,.33,p.stone,9)
                        for dx,dz,scale in [(-2.1,.35,.83),(2.05,.23,.87),(.4,-1.75,.77)]:
                            foliage(b,x+dx,y,z+dz,scale,p,detail)
                        walk=[(x+2.58*math.cos(i*math.tau/22),z+1.73*math.sin(i*math.tau/22)) for i in range(22)]
                        paths(b,walk,.76,y+.012,p.path)
                    if n==7:
                        rim(b,x+1.3,y+.01,z+.4,.69,.62,.08,p.water)
                elif n in (3,13):
                    if n==3:
                        for i in [-1,0,1]:b.blob(x+i*.37,y+.65+.16*i,z,.27,.65,.27,p.stone,9)
                    else:rim(b,x,y+.02,z,2.25,2.65,.045,p.garden)
                elif n==14:
                    b.box(x,y+1,z,1.72,2,1.64,p.brick);b.box(x,y+2.12,z,2.16,.2,2.04,p.light)
                elif n==15:
                    b.box(x,y+.08,z,3.3,.16,3.42,p.path)
                    bench(b,x,y+.16,z,p.walnut,p.dark)
        if b.faces:b.object(f['id'],root,amenityId=f['id'],amenitySection=name)
    return root
