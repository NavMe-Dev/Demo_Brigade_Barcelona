"""Render honest still-image fallback views from the delivered illustrative GLB.

Run: blender -b --python scripts/render_room_views.py
Requires Pillow in system python3 to encode WebP; override BRIGADE_PYTHON if necessary.
No external views, panoramas, photographic textures or solar-position claims are added.
"""
import bpy, json, os, subprocess, tempfile
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'dist/assets'
TEMP=Path(tempfile.mkdtemp(prefix='brigade-room-views-'))
def coord(p):return Vector((p[0],-p[2],p[1]))

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
source = Path(os.environ.get('BRIGADE_INTERIOR_GLB', ASSETS/'apartment-a3.glb'))
bpy.ops.import_scene.gltf(filepath=str(source))
for o in bpy.data.objects:o.hide_render=False
geom=json.loads((ASSETS/'apartment-geometry.json').read_text())
nodes={n['id']:n for n in geom['navigation_nodes']}
rooms={r['id']:r for r in geom['rooms']}

scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.cycles.max_bounces=5;scene.cycles.diffuse_bounces=3;scene.cycles.glossy_bounces=2
scene.cycles.transmission_bounces=3;scene.cycles.transparent_max_bounces=6
scene.render.resolution_x=840;scene.render.resolution_y=560;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.81,.83,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.60
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=-.35

# Soft presentation lighting is deliberate and illustrative, not a daylight analysis.
for room in geom['rooms']:
    center=room['center'];x,z=center
    if room['id']=='dining':x,z=6.9,6.9
    bpy.ops.object.light_add(type='AREA',location=coord([x,2.80,z]))
    light=bpy.context.object;light.name='presentation_fill_'+room['id']
    light.data.energy=125 if room['id'] not in ['closet','utility','bathroom-1','bathroom-2','primary-bathroom'] else 50
    light.data.shape='DISK';light.data.size=2.1;light.data.color=(1.0,.88,.73)

views=[
    ('living','entry',[2.8,1.05,6.8]),
    ('dining','dining',[6.92,1.04,6.94]),
    ('family-lounge','family',[11.05,1.00,7.33]),
    ('primary-bedroom','primary',[1.81,1.02,10.45]),
    ('bedroom-1','bed1',[1.81,1.00,2.18]),
    ('bedroom-2','bed2',[12.23,1.00,2.15]),
    ('kitchen','kitchen',[13.44,1.10,10.92]),
    ('deck','deck',[14.43,1.00,7.28]),
    ('bathroom-1','bath1',[5.48,.95,.52]),
    ('bathroom-2','bath2',[7.91,.96,1.01]),
    ('primary-bathroom','primary-bath',[7.04,.94,9.68]),
    ('closet','closet',[5.93,1.24,10.19]),
    ('utility','utility',[9.63,.95,9.67]),
]
bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='fallback_still_camera'
camera.data.type='PERSP';camera.data.lens=21;camera.data.sensor_width=36
camera.data.clip_start=.06;camera.data.clip_end=80;scene.camera=camera

metadata={
    'status':'illustrative_rendered_still_views',
    'source_asset':'apartment-a3-web.glb' if 'BRIGADE_INTERIOR_GLB' in os.environ else 'apartment-a3.glb',
    'source_pdf_page':18,
    'notice':'Rendered views of the same brochure-derived concept model; not panoramic or live 3D, not architect-approved, no real exterior views or daylight study.',
    'coordinate_system':'meters, x right, y up, z down plan',
    'lighting':'Soft warm diffuse presentation lighting; not georeferenced sun simulation',
    'image_processing':'Deterministic small median/bilateral noise reduction; no generative additions',
    'size':[840,560],
    'views':[]
}
if os.environ.get('BRIGADE_BAKED_GLB'):
    import sys
    sys.dont_write_bytecode=True
    sys.path.insert(0,str(Path(__file__).parent))
    from bake_apartment import bake
    bake(scene,os.environ['BRIGADE_BAKED_GLB'])
    scene.cycles.samples=12
if os.environ.get('BRIGADE_BLEND_PATH'):
    bpy.context.preferences.filepaths.save_version=0
    camera.location=coord(nodes['entry']['position'])
    camera.rotation_euler=(coord(views[0][2])-camera.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=os.environ['BRIGADE_BLEND_PATH'], compress=True)
for room_id,node_id,target in views:
    position=nodes[node_id]['position'];camera.location=coord(position)
    camera.rotation_euler=(coord(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    png=TEMP/f'room-{room_id}.png';webp=ASSETS/f'room-{room_id}.webp'
    scene.render.filepath=str(png);bpy.ops.render.render(write_still=True)
    subprocess.run([os.environ.get('BRIGADE_PYTHON','python3'),str(ROOT/'scripts/encode_render.py'),str(png),str(webp)],check=True)
    metadata['views'].append({'room_id':room_id,'label':rooms[room_id]['label'],'node_id':node_id,'file':webp.name,'position':position,'look_at':target,'bytes':webp.stat().st_size})
    print('ROOM_RENDERED',room_id,webp.stat().st_size,'bytes',flush=True)
metadata['total_image_bytes']=sum(v['bytes'] for v in metadata['views'])
(ASSETS/'room-views.json').write_text(json.dumps(metadata,indent=2))
print('COMPLETE',sum(v['bytes'] for v in metadata['views']),'total image bytes',flush=True)
