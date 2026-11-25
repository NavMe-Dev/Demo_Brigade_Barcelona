"""Dress the supplied A3 mesh, bake contact shading, and export an editable GLB.

python3 scripts/finish_apartment.py /tmp/a3-dressed.glb
Requires NumPy and Pillow. gltfpack -cc -tc -kn -km -ke is the final web build.
The source coordinate system and navigable geometry are preserved.
"""
import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ASSETS = Path(__file__).resolve().parents[1] / 'dist/assets'
SOURCE = ASSETS / 'apartment-a3.glb'


def prepare(output):
    raw = SOURCE.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length])
    binary = bytearray(raw[28 + length:])
    geom = json.loads((ASSETS / 'apartment-geometry.json').read_text())
    boxes = json.loads((ASSETS / 'furniture-colliders.json').read_text())['boxes']

    def view(data, target=None):
        binary.extend(bytes(-len(binary) % 4))
        entry = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)}
        if target:
            entry['target'] = target
        doc['bufferViews'].append(entry)
        binary.extend(data)
        return len(doc['bufferViews']) - 1

    def attribute(array, shape, component=5126, bounds=False):
        array = np.asarray(array, dtype='<f4' if component == 5126 else '<u2')
        entry = {'bufferView': view(array.tobytes(), 34963 if shape == 'SCALAR' else 34962),
                 'componentType': component, 'count': len(array), 'type': shape}
        if bounds:
            entry.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        doc['accessors'].append(entry)
        return len(doc['accessors']) - 1

    def vectors(index):
        access = doc['accessors'][index]
        start = doc['bufferViews'][access['bufferView']]['byteOffset'] + access.get('byteOffset', 0)
        return np.frombuffer(bytes(binary[start:start + access['count'] * 12]), dtype='<f4').reshape(-1, 3)

    doc.update(images=[], textures=[], samplers=[{'wrapS': 10497, 'wrapT': 10497}])

    def texture(name, pixels):
        buf = io.BytesIO()
        Image.fromarray(np.uint8(np.clip(pixels, 0, 255))).save(buf, format='PNG')
        doc['images'].append({'bufferView': view(buf.getvalue()), 'mimeType': 'image/png', 'name': name})
        doc['textures'].append({'sampler': 0, 'source': len(doc['images']) - 1})
        return {'index': len(doc['textures']) - 1}

    # Licensed scans are packed in the editable master and the web model.
    source_dir = ASSETS.parents[1] / 'models/materials'
    def scan(name, kind, desaturate=False):
        pixels = np.asarray(Image.open(source_dir / (name+'-'+kind+'.jpg')).convert('RGB'),dtype=float)
        if desaturate:
            # Preserve fiber contrast while letting each furniture material determine color.
            lum = pixels @ np.array([.2126,.7152,.0722])
            pixels = np.repeat(np.clip(213 + 26*(lum / np.mean(lum) - 1),0,255)[:,:,None],3,axis=2)
        if name == 'marble' and kind == 'color':
            lum=pixels @ np.array([.2126,.7152,.0722])
            pixels = (pixels*.28 + lum[:,:,None]*.72)*.88+51
        return texture(name+' '+kind, pixels)
    stone_tex = scan('marble','color')
    oak_tex = scan('walnut','color')
    textile_tex = scan('fabric','color',desaturate=True)
    stone_normal = scan('marble','normal')
    oak_normal = scan('walnut','normal')
    textile_normal = scan('fabric','normal')
    rgb = lambda lum, gains: lum[:, :, None] * np.asarray(gains)
    # Bake ambient contact around actual walls, feet, and the footprint of low furniture.
    res = 512
    z, px = np.indices((res,res),dtype=float)
    px = px/res*17 - .5
    z = z/res*14 - .5
    occlusion = np.ones_like(px)
    for w in geom['walls']:
        if w.get('base_y_m',0) > .25:
            continue
        a, b = np.array(w['a']), np.array(w['b'])
        dx,dz = b-a
        t = np.clip(((px-a[0])*dx+(z-a[1])*dz) / max(dx*dx+dz*dz,1e-8),0,1)
        dist = np.hypot(px-a[0]-dx*t, z-a[1]-dz*t)
        occlusion = np.minimum(occlusion, 1-.35*np.exp(-dist/.18))
    for box in boxes:
        if box['min'][1] > .5:
            continue
        x0,_,z0 = box['min']; x1,_,z1 = box['max']
        dist = np.hypot(np.maximum(0,np.maximum(x0-px,px-x1)),np.maximum(0,np.maximum(z0-z,z-z1)))
        occlusion = np.minimum(occlusion, 1-.48*np.exp(-dist/.23))
    ao_tex = texture('A3 baked floor contact',rgb(occlusion*255,[1,1,1]))
    materials = {mat['name']:i for i,mat in enumerate(doc['materials'])}
    # The original material doubles as ceiling paint. Preserve its matte painted appearance.
    ceiling = json.loads(json.dumps(doc['materials'][materials['Warm white upholstery']]))
    ceiling['name'] = 'Ceiling paint'
    doc['materials'].append(ceiling)
    ceiling_material = len(doc['materials'])-1
    for n in doc['nodes']:
        if n['name'].startswith('ceiling__'):
            doc['meshes'][n['mesh']]['primitives'][0]['material'] = ceiling_material

    scales = {}
    for i, mat in enumerate(doc['materials']):
        name = mat['name'].lower()
        pbr = mat['pbrMetallicRoughness']
        if any(s in name for s in ('limestone floor','worktops','bathroom tile')):
            pbr.update(baseColorTexture=stone_tex, roughnessFactor=.32)
            scales[i] = 1.5
            mat['normalTexture'] = {**stone_normal,'scale':.28}
        elif any(s in name for s in ('oak','walnut')):
            pbr.update(baseColorTexture=oak_tex,roughnessFactor=.43)
            scales[i] = 1.0
            mat['normalTexture'] = {**oak_normal,'scale':.37}
            pbr['baseColorFactor'] = [1,.95,.89,1] if 'walnut' not in name else [.51,.48,.47,1]
        elif any(s in name for s in ('fabric','upholstery','rug','terracotta accent','muted olive')):
            pbr.update(baseColorTexture=textile_tex,roughnessFactor=.91)
            scales[i] = .23
            mat['normalTexture'] = {**textile_normal,'scale':.20}

    for node in doc['nodes']:
        if 'mesh' not in node:
            continue
        for p in doc['meshes'][node['mesh']]['primitives']:
            i = p['material']
            if i not in scales:
                continue
            attrs = p['attributes']
            pos, normal = vectors(attrs['POSITION']), vectors(attrs['NORMAL'])
            axes = np.argmax(abs(normal),axis=1)
            uv = np.column_stack([np.where(axes==0,pos[:,2],pos[:,0]), np.where(axes==1,pos[:,2],pos[:,1])])
            attrs['TEXCOORD_0'] = attribute(uv / scales[i], 'VEC2')
            if node['name'].startswith('floors__'):
                # Floor-only clones keep the spatial occlusion bake off vertical wood trim.
                material = json.loads(json.dumps(doc['materials'][i]))
                material['name'] += ' · floor finish'
                material['occlusionTexture'] = {**ao_tex,'texCoord':1,'strength':.85}
                doc['materials'].append(material)
                p['material'] = len(doc['materials'])-1
                attrs['TEXCOORD_1'] = attribute(np.column_stack([(pos[:,0]+.5)/17,(pos[:,2]+.5)/14]),'VEC2')

    # Keep folded linen panels at the ends of the bedroom windows. No door is obstructed.
    positions, normals, uvs, indices = [],[],[],[]
    for opening in geom['openings']:
        if opening['id'] not in ('bed1-north','bed2-north','primary-south'):
            continue
        a,b = np.array(opening['a']), np.array(opening['b'])
        inside = -1 if 'south' in opening['id'] else 1
        for direction, point in [(1,a),(-1,b)]:
            offset = len(positions)
            for row in range(9):
                t = row/8
                for col in range(49):
                    s = col/48
                    fold = s*4.5*np.pi*2
                    positions.append([point[0]+direction*(s*(.24+.035*t)-.04),2.79-t*(2.70+.014*np.cos(fold)),point[1]+inside*(.132+(.044+.012*t)*np.sin(fold))])
                    n = np.array([-inside*direction*3.5*np.cos(fold),.02,1])
                    normals.append(n/np.linalg.norm(n))
                    uvs.append([s*.38,t*3])
                    if col<48 and row<8:
                        v = offset+row*49+col
                        indices.extend([v,v+49,v+1,v+1,v+49,v+50])
    attrs = {'POSITION':attribute(positions,'VEC3',bounds=True),'NORMAL':attribute(normals,'VEC3'),'TEXCOORD_0':attribute(uvs,'VEC2')}
    doc['meshes'].append({'name':'Curtain folds','primitives':[{'material':materials['Warm white upholstery'],'attributes':attrs,'indices':attribute(indices,'SCALAR',5123)}]})
    fixture = next(n for n in doc['nodes'] if n['name']=='lighting_fixtures')
    fixture['children'].append(len(doc['nodes']))
    doc['nodes'].append({'name':'Window linen','mesh':len(doc['meshes'])-1})
    # Two original framed textile studies anchor the lounge seating compositions.
    # Geometry is flush to solid walls and sits above the navigation capsule.
    art = Image.new('RGB',(900,450),'#eae0ce')
    brush = ImageDraw.Draw(art)
    brush.ellipse((75,-104,545,366), fill='#99765c')
    brush.ellipse((440,77,770,407), fill='#858a76')
    brush.polygon([(0,320),(273,267),(560,307),(747,251),(900,263),(900,450),(0,450)],fill='#676d60')
    brush.polygon([(0,354),(220,335),(427,358),(670,306),(900,317),(900,450),(0,450)],fill='#414941')
    brush.ellipse((615,39,700,124),fill='#c5a77a')
    original=np.array(art,dtype=float)
    noise=np.random.default_rng(193).normal(0,3.7,original.shape[:2])
    artwork=texture('Original textile study', original+noise[:,:,None])
    doc['materials'].append({'name':'Framed textile study','doubleSided':True,'pbrMetallicRoughness':
                             {'metallicFactor':0,'roughnessFactor':.95,'baseColorTexture':artwork}})
    art_material=len(doc['materials'])-1
    artgroup=next(n for n in doc['nodes'] if n['name']=='walls_upper')
    def wall_quad(name, left, bottom, width, height, z, material, u0=0, u1=1):
        pos=[[left,bottom,z],[left+width,bottom,z],[left+width,bottom+height,z],[left,bottom+height,z]]
        attrs={'POSITION':attribute(pos,'VEC3',bounds=True),'NORMAL':attribute([[0,0,-1]]*4,'VEC3'),
               'TEXCOORD_0':attribute([[u0,1],[u1,1],[u1,0],[u0,0]],'VEC2')}
        doc['meshes'].append({'name':name,'primitives':[{'attributes':attrs,'indices':attribute([0,2,1,0,3,2],'SCALAR',5123),'material':material}]})
        artgroup['children'].append(len(doc['nodes']))
        doc['nodes'].append({'name':name,'mesh':len(doc['meshes'])-1})
    for start, name in [(1.20,'Living'),(10.06,'Family')]:
        for panel in range(3):
            left=start+panel*.82
            wall_quad(name+' bronze frame '+str(panel),left,1.26,.76,1.12,7.978,materials['Brushed bronze'])
            wall_quad(name+' textile panel '+str(panel),left+.022,1.282,.716,1.076,7.973,art_material,panel/3,(panel+1)/3)
    binary.extend(bytes(-len(binary)%4))
    doc['buffers'][0]['byteLength'] = len(binary)
    desc = json.dumps(doc,separators=(',',':')).encode()
    desc += b' '*(-len(desc)%4)
    output.write_bytes(struct.pack('<4sIIII',b'glTF',2,28+len(desc)+len(binary),len(desc),0x4e4f534a)+desc+struct.pack('<II',len(binary),0x004e4942)+binary)


if __name__ == '__main__':
    prepare(Path(sys.argv[1]))
