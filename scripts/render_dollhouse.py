"""Render the roof-off fallback from the editable final master.

blender -b models/apartment-a3.blend -t 4 --python scripts/render_dollhouse.py
"""
import bpy
import os
import subprocess
import tempfile
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parents[1]
for group in ('ceiling','walls_upper','lighting_fixtures'):
    for child in bpy.data.objects[group].children_recursive:
        child.hide_render=True
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=16
scene.cycles.use_denoising=True
scene.render.resolution_x=1152
scene.render.resolution_y=896
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.color_mode='RGBA'
scene.render.image_settings.file_format='PNG'
target=Vector((7.6,-6.1,.65))
camera=scene.camera
camera.location=target+Vector((-9,-16,22))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=21
for location,energy,size in [((-2,-1,13),1250,9),((14,-12,10),920,6)]:
    bpy.ops.object.light_add(type='AREA',location=location)
    lamp=bpy.context.object
    lamp.data.energy=energy
    lamp.data.shape='DISK'
    lamp.data.size=size
    lamp.rotation_euler=(target-lamp.location).to_track_quat('-Z','Y').to_euler()
with tempfile.TemporaryDirectory() as directory:
    scene.render.filepath=str(Path(directory)/'overview.png')
    bpy.ops.render.render(write_still=True)
    code="from PIL import Image;import sys;Image.open(sys.argv[1]).save(sys.argv[2],quality=88,method=6)"
    subprocess.run([os.environ.get('BRIGADE_PYTHON','python3'),'-c',code,scene.render.filepath,
                    str(root/'dist/assets/apartment-a3-thumbnail.webp')],check=True)
