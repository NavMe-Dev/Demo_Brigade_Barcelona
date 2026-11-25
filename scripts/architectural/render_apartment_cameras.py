"""Render each documented room viewpoint and a roof-off overview from its own Blender master.
blender -b -t 4 --python scripts/architectural/render_apartment_cameras.py -- A1 A2 ...
"""
import bpy,json,math,os,subprocess,sys,tempfile
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
def v(a):return Vector((a[0],-a[2],a[1]))
def render(code):
    out=ROOT/'dist/assets/apartments'/code
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'models/apartments'/f'apartment-{code.lower()}.blend'))
    sc=bpy.context.scene;cam=sc.camera
    sc.render.engine='CYCLES';sc.cycles.samples=6;sc.cycles.use_denoising=True;sc.cycles.max_bounces=4
    sc.cycles.diffuse_bounces=2;sc.cycles.glossy_bounces=2;sc.cycles.transmission_bounces=2
    sc.render.resolution_x=540;sc.render.resolution_y=352;sc.render.resolution_percentage=100
    sc.render.image_settings.file_format='WEBP';sc.render.image_settings.quality=85;sc.render.image_settings.color_mode='RGB'
    g=json.loads((out/'geometry.json').read_text());meta=json.loads((out/'views.json').read_text())
    for item in ([] if os.environ.get('OVERVIEWS_ONLY') else meta['views']):
        target=out/item['file'];cam.location=v(item['position']);cam.rotation_euler=(v(item['look_at'])-cam.location).to_track_quat('-Z','Y').to_euler()
        cam.data.clip_start=.045;cam.data.lens=18
        sc.render.filepath=str(target);bpy.ops.render.render(write_still=True)
        item['bytes']=target.stat().st_size
    meta.update(size=[540,352],source_model=f'apartment-{code.lower()}.glb',status='Rendered from this layout’s furnished Blender master and registered camera viewpoints.')
    (out/'views.json').write_text(json.dumps(meta,ensure_ascii=False,indent=1)+'\n')
    for group in ('ceiling','walls_upper','lighting_fixtures'):
        for obj in bpy.data.objects[group].children_recursive:obj.hide_render=True
    for light in sc.objects:
        if light.type=='LIGHT':light.hide_render=True
    pts=g['outline'];xs=[p[0] for p in pts];zs=[p[1] for p in pts]
    width=max(xs)-min(xs);length=max(zs)-min(zs)
    middle=v([(min(xs)+max(xs))/2,.35,(min(zs)+max(zs))/2]);cam.location=middle+Vector((-4,-12,22))
    cam.rotation_euler=(middle-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=max(width,length)*1.42
    for dx,dy,dz,power in [(-5,-9,11,1250),(6,3,14,1000)]:
        bpy.ops.object.light_add(type='AREA',location=middle+Vector((dx,dy,dz)));lamp=bpy.context.object;lamp.data.energy=power;lamp.data.size=8;lamp.rotation_euler=(middle-lamp.location).to_track_quat('-Z','Y').to_euler()
    sc.render.resolution_x=900;sc.render.resolution_y=760;sc.render.film_transparent=True;sc.render.image_settings.color_mode='RGBA'
    sc.render.filepath=str(out/'overview.webp');bpy.ops.render.render(write_still=True)
    print('FINISHED STILLS',code,len(meta['views']),flush=True)
if __name__=='__main__':
    for code in sys.argv[sys.argv.index('--')+1:]:render(code)
