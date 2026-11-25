"""Check the concept's graph against conservative, floor-level furniture AABBs.

This verifies authored graph paths only, not arbitrary free walking or architectural accuracy.
Run: python3 scripts/validate_model_navigation.py
"""
from pathlib import Path
import json, math, struct, sys

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'dist/assets'

def segment_box_hit(a,b,box,radius=.18):
    low=[box['min'][0]-radius,box['min'][2]-radius]
    high=[box['max'][0]+radius,box['max'][2]+radius]
    tmin,tmax=0.0,1.0
    for k,j in enumerate([0,2]):
        delta=b[j]-a[j]
        if abs(delta)<1e-9:
            if a[j]<low[k] or a[j]>high[k]:return False
        else:
            left,right=(low[k]-a[j])/delta,(high[k]-a[j])/delta
            if left>right:left,right=right,left
            tmin,tmax=max(tmin,left),min(tmax,right)
            if tmin>tmax:return False
    return True

def main():
    geom=json.loads((ASSETS/'apartment-geometry.json').read_text())
    boxes=json.loads((ASSETS/'furniture-colliders.json').read_text())['boxes']
    nodes={n['id']:n for n in geom['navigation_nodes']}
    issues=[]
    for edge in geom['navigation_edges']:
        a,b=nodes[edge['a']]['position'],nodes[edge['b']]['position']
        hits=[o['name'] for o in boxes if segment_box_hit(a,b,o)]
        if hits:issues.append({'a':edge['a'],'b':edge['b'],'objects':hits})
    raw=(ASSETS/'apartment-a3.glb').read_bytes()
    magic,version,total=struct.unpack_from('<III',raw,0)
    assert magic==0x46546C67 and version==2 and total==len(raw),'Invalid GLB header'
    chunk_length,chunk_type=struct.unpack_from('<II',raw,12)
    gltf=json.loads(raw[20:20+chunk_length])
    result={
        'status':'pass' if not issues else 'fail',
        'checks_scope':'Authored navigation graph against furniture AABBs; architectural wall checks are in source geometry validation',
        'capsule_radius_m':.18,
        'method':'Segment intersects axis-aligned furniture box expanded by capsule radius; conservative near corners',
        'navigation_nodes':len(nodes),'navigation_edges':len(geom['navigation_edges']),
        'furniture_boxes':len(boxes),'intersecting_edges':len(issues),'issues':issues,
        'glb_bytes':len(raw),'glb_nodes':len(gltf['nodes']),'glb_meshes':len(gltf['meshes']),
        'glb_primitives':sum(len(m['primitives']) for m in gltf['meshes']),
        'triangles':sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'] if 'indices' in p),
        'group_names':[n.get('name') for n in gltf['nodes'] if n.get('name') in ['floors','walls','walls_lower','walls_upper','ceiling','furniture','openings','lighting_fixtures']]
    }
    (ASSETS/'furniture-navigation-check.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2))
    if issues:sys.exit(1)

if __name__=='__main__':main()
