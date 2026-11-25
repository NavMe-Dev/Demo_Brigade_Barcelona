"""Unlocated room studies for the brochure clubhouse programme, page 13."""
import math
from build_decks import bench, pergola, rim

def build_studies(api,section):
    p=api
    root=p.group('Unlocated_clubhouse_studies',status='illustrative detached furniture studies')
    for n,item in enumerate(section['features'][:14],1):
        b=p.Batch()
        # Each separate architectural vignette has its own lobby-scale room.
        b.box(0,-.1,0,8.6,.2,6.6,p.stone)
        b.box(0,1.64,-3.26,8.6,3.28,.18,p.light)
        for i in range(7):
            b.box(-3.9+i*.42,1.65,-3.12,.15,3.25,.12,p.walnut)
        b.box(-4.24,1.64,0,.16,3.28,6.6,p.glass)
        for z in (-3.21,-1.06,1.06,3.21):b.box(-4.17,1.64,z,.12,3.28,.1,p.walnut)
        for x in (-3.95,3.95):b.box(x,.1,-2.95,.60,.24,.65,p.brick);b.blob(x,.78,-2.95,.46,.90,.50,p.leaf2)
        def seat(x,z,width=1.5):
            b.box(x,.30,z,width,.34,.77,p.walnut)
            b.blob(x,.52,z,width*.48,.16,.40,p.path)
            b.blob(x,.77,z-.32,width*.48,.32,.10,p.garden)
        def table(x,z,w,d):
            b.box(x,.83,z,w,.10,d,p.path)
            for dx in (-w*.42,w*.42):
                for dz in (-d*.36,d*.36):b.box(x+dx,.40,z+dz,.1,.8,.1,p.walnut)
        if n in (1,3,4,8,9,14):
            if n in (1,8):b.box(1.4,.62,-1.8,3.3,1.22,1.0,p.brick)
            if n in (3,4,9):
                for xx in [-1.55,1.55]:
                    seat(xx,-1.7);table(xx,-.55,1.14,.68)
            else:
                seat(-1.7,0);seat(1.2,1.2)
            if n in (4,9):
                for h in (.49,1.02,1.55,2.08):
                    b.box(1.2,h,-2.99,3.5,.08,.38,p.walnut)
                    for j in range(8):b.box(-.36+j*.38,h+.20,-2.92,.21,.37,.22,[p.brick,p.garden,p.path][j%3])
            if n==14:
                for j in range(6):b.box(-2.6+j*.64,.25,-1.2,.45,.5,.45,[p.brick,p.garden,p.path][j%3])
        elif n==2:
            for x in (-2,1.7):
                for z in (-1.3,1.3):
                    rim(b,x,.77,z,.88,.88,.09,p.path);b.box(x,.38,z,.14,.76,.14,p.walnut)
                    for q in range(4):seat(x+math.cos(q*math.pi/2)*1.11,z+math.sin(q*math.pi/2)*1.11,.62)
        elif n==5:
            for x in [-2,0,2]:
                b.box(x,.22,0,.88,.36,2.5,p.dark)
                for dx in [-.38,.38]:b.box(x+dx,.76,-.9,.09,1.1,.12,p.walnut)
                b.box(x,1.32,-.9,.86,.16,.48,p.glass)
        elif n in (6,7):
            for x in [-2,0,2]:
                for z in [-1.3,1.3]:b.box(x,.045,z,.96,.085,1.84,p.garden)
            for x in [-1.5,0,1.5]:b.box(x,1.52,-3.13,1.43,1.87,.08,p.glint)
        elif n==10:
            b.box(0,1.60,-3.12,5.82,2.3,.1,p.dark)
            for z in [-1.21,.20,1.61]:
                for x in [-2.1,-.7,.7,2.1]:seat(x,z,1.16)
        elif n==11:
            b.box(.7,1.45,-3.1,5.88,2.54,.11,p.garden)
            b.box(.7,.05,-.3,3.2,.1,3.3,p.leaf2)
            b.blob(.7,.17,-.34,.10,.10,.10,p.light)
        elif n==12:
            for dx,dz,r in [(-1.2,-.85,.63),(-.32,-1.1,.40),(-1.85,-1.35,.41)]:
                rim(b,dx,.32,dz,r,r,.48,p.brick);rim(b,dx,.81,dz,r,r,.055,p.light)
            b.box(1.58,1.0,-.52,2.40,.22,.77,p.dark)
            for j in range(19):b.box(.49+j*.12,1.13,-.34,.108,.035,.30,p.light)
        elif n==13:
            table(0,0,3.72,2.0);b.box(0,.91,0,3.52,.08,1.81,p.leaf2)
            for x,z in [(-1.4,-.68),(.6,.45),(.2,-.24),(.4,.5)]:b.blob(x,1,z,.09,.09,.09,p.light)
            b.box(2,.28,-2,.4,.55,1.25,p.walnut)
        object=b.object(item['id']+'_study',root,amenityId=item['id'])
        # The browser shows only the selected room at the origin.
        object.hide_render=False
    return root
