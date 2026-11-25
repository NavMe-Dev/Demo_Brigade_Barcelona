"""Inspect each delivered GLB, trace registration, camera list, source plan and render set."""
import json,hashlib,struct
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2];ASSETS=ROOT/'dist/assets'
doc=json.loads((ASSETS/'brochure-manifest.json').read_text())
report={'mode':'source registration and package validation; illustrative traced distances','layouts':[]}
sheet=Image.new('RGB',(1400,4*355),'#faf8f2')
houses=Image.new('RGB',(1400,4*300),'#f2eee6')
def read(f):return json.loads(f.read_text())
def tiles(code,index,plan,geo,origin,scale,overview):
    def px(v):return (origin[0]+v[0]*scale,origin[1]+v[1]*scale)
    overlay=Image.new('RGBA',plan.size);draw=ImageDraw.Draw(overlay)
    for w in geo['walls']:
        if w.get('base_y_m',0)>1:continue
        draw.line([px(w['a']),px(w['b'])],fill=(172,48,46,170),width=3)
    for o in geo['openings']:
        draw.line([px(o['a']),px(o['b'])],fill=(14,122,113,255) if o['type']=='window' else (224,127,19,240),width=4)
    nodes={n['id']:n for n in geo['navigation_nodes']}
    for e in geo['navigation_edges']:
        a,b=nodes[e['a']]['position'],nodes[e['b']]['position'];draw.line([px((a[0],a[2])),px((b[0],b[2]))],fill=(15,95,180,140),width=2)
    for r in geo['rooms']:
        x,y=px(r['center']);draw.ellipse([x-4,y-4,x+4,y+4],fill='#135781')
    points=[px(p) for p in geo['outline']];xs,ys=zip(*points)
    im=Image.alpha_composite(plan.convert('RGBA'),overlay).crop((min(xs)-13,min(ys)-13,max(xs)+13,max(ys)+13))
    im.thumbnail((339,321));left=index%4*350;top=index//4*355;sheet.paste(im,(left+(350-im.width)//2,top+26))
    d=ImageDraw.Draw(sheet);d.text((left+8,top+5),code+'  /  brochure p.'+str(geo['source_pdf_page']),fill='#3f382c')
    h=Image.open(overview).convert('RGBA');h.thumbnail((339,274));top=index//4*300
    houses.paste(h,(left+(350-h.width)//2,top+21),h);ImageDraw.Draw(houses).text((left+9,top+4),code,fill='#3f382c')
for idx,l in enumerate(doc['layouts']):
    code=l['code'];base=ASSETS/'apartments'/code
    if code=='A3':
        geom=read(ASSETS/'apartment-geometry.json');gfile=ASSETS/'apartment-a3-web.glb';views=read(ASSETS/'room-views.json');imgs=ASSETS
        overview=ASSETS/'apartment-a3-thumbnail.webp';plan=Image.open(ASSETS/'plan-a3.webp')
        origin,scale=[52,60],51;blend=ROOT/'models/apartment-a3.blend'
    else:
        geom=read(base/'geometry.json');gfile=base/f'apartment-{code.lower()}.glb';views=read(base/'views.json');imgs=base;overview=base/'overview.webp'
        blend=ROOT/'models/apartments'/f'apartment-{code.lower()}.blend';plan=Image.open(ASSETS/'plans'/f'{code}.webp')
        reg=geom['coordinate_system']['plan_image'];origin=reg['origin'];scale=reg['pixels_per_meter'];assert [reg['width'],reg['height']]==list(plan.size)
    raw=gfile.read_bytes();magic,version,total,dl,typ=struct.unpack_from('<4sIIII',raw);assert magic==b'glTF' and version==2 and len(raw)==total
    g=json.loads(raw[20:20+dl]);ids={r['id'] for r in geom['rooms']}
    assert len(ids)==len(geom['rooms']) and sum('bedroom' in s for s in ids)==l['bedrooms']
    assert sum('bathroom' in s for s in ids)==l['washrooms'] and ('study' in ids)==bool(l['has_study'])
    assert {'living','dining','kitchen','deck'}<=ids and {v['room_id'] for v in views['views']}==ids
    assert {'EXT_meshopt_compression','KHR_texture_basisu'}<=set(g['extensionsUsed'])
    names={n.get('name') for n in g['nodes']}
    assert {'furniture','ceiling','walls_upper','lighting_fixtures'}<=names
    assert blend.stat().st_size>1000 and overview.is_file() and geom['source_pdf_page']==l['source_pdf_page']
    assert all(r.get('published_dimensions_m') is None or all(x>0 for x in r['published_dimensions_m']) for r in geom['rooms'])
    for view in views['views']:
        img=imgs/view['file'];assert img.stat().st_size==view['bytes']
        im=Image.open(img);im.verify()
    tiles(code,idx,plan,geom,origin,scale,overview)
    report['layouts'].append(dict(code=code,page=l['source_pdf_page'],bedrooms=l['bedrooms'],washrooms=l['washrooms'],study=l['has_study'],
        roomDestinations=len(ids),roomDimensionsTranscribed=sum(r.get('published_dimensions_m') is not None for r in geom['rooms']),
        portals=len(geom['openings']),graphNodes=len(geom['navigation_nodes']),graphEdges=len(geom['navigation_edges']),
        sourceSBA=l['total_sba_sqft'],sourceCarpet=l['total_carpet_area_sqft'],modelBytes=len(raw),
        triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives']),
        primitives=sum(len(m['primitives']) for m in g['meshes']),embeddedKTX2=len(g['images']),
        sha256=hashlib.sha256(raw).hexdigest(),imageCount=len(views['views']),model=str(gfile.relative_to(ROOT))))
assert len({r['sha256'] for r in report['layouts']})==13
report['status']='pass';report['totalRoomDestinations']=sum(i['roomDestinations'] for i in report['layouts'])
report['boundaries']='Wall centerline, scale, height, glazing, placement and openings are brochure-registered interpretations. Nominal room dimensions and area labels are brochure annotations; these are layout types, not verified physical floor inventory.'
qa=ROOT/'qa';(qa/'evidence').mkdir(exist_ok=True,parents=True)
sheet.save(qa/'evidence/apartment-traces.webp',quality=89,method=6)
houses.save(qa/'evidence/apartment-dollhouses.webp',quality=88,method=6)
(qa/'apartment-assets.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(report['status'],len(report['layouts']),'GLBs;',report['totalRoomDestinations'],'room views')
