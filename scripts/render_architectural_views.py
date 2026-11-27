"""Render matched, separate offline reference views with Blender Cycles.

blender -b models/masterplan.blend --python scripts/render_architectural_views.py -- OUTPUT
"""
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
VIEWS = json.loads((ROOT / 'scripts/architectural-views.json').read_text())

def world_vector(point):
    x, y, z = point
    return Vector((x, -z, y))

def add_lamp(scene, name, kind):
    data = bpy.data.lights.new(name, kind)
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    return obj

def render(output, keys):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 94
    scene.view_settings.view_transform = 'AgX'

    world = bpy.data.worlds.new('Architectural reflection sky')
    world.use_nodes = True
    shader = world.node_tree.nodes['Background']
    hdri = world.node_tree.nodes.new('ShaderNodeTexEnvironment')
    hdri.image = bpy.data.images.load(str(ROOT / 'dist/assets/sky-light.hdr'))
    nodes, links = world.node_tree.nodes, world.node_tree.links
    links.new(hdri.outputs['Color'], shader.inputs['Color'])
    scene.world = world

    camera_data = bpy.data.cameras.new('Architectural comparison lens')
    camera_data.sensor_fit = 'VERTICAL'
    camera_data.sensor_height = 32
    camera_data.lens = 16 / math.tan(math.radians(43 / 2))
    camera_data.clip_start = .2
    camera_data.clip_end = 6000
    camera = bpy.data.objects.new('Architectural comparison camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    sun = add_lamp(scene, 'Architectural sun', 'SUN')
    sun.data.angle = math.radians(2.5)
    garden_glow = add_lamp(scene,'Sky garden warm accent','POINT')
    garden_glow.location = world_vector((9.7,179.18,39.5))
    garden_glow.data.color = (1,.55,.22)
    garden_glow.data.shadow_soft_size = .30
    sky_files = {'sunset': 'sky-sunset.hdr', 'night': 'sky-night.hdr', 'evening': 'sky-evening.hdr'}
    for key in keys:
        view = VIEWS[key]
        camera.location = world_vector(view['camera'])
        camera.rotation_euler = (world_vector(view['target']) - camera.location).to_track_quat('-Z','Y').to_euler()
        mood = view['light']
        hdri.image = bpy.data.images.load(str(ROOT / 'dist/assets' / sky_files.get(mood, 'sky-light.hdr')), check_existing=True)
        if mood == 'sunset':
            direction, energy, color, ambient = (-.28,.46,1), 2.9, (1,.63,.37), .46
        elif mood in ('night', 'evening'):
            direction, energy, color, ambient = (-1,.17,.3), .06, (.65,.75,1), .7
        else:
            direction, energy, color, ambient = (1,.61,1), 2.5, (1,.8,.65), .59
        sun.rotation_euler = (-world_vector(direction)).to_track_quat('-Z','Y').to_euler()
        sun.data.energy = energy
        sun.data.color = color
        shader.inputs['Strength'].default_value = ambient
        garden_glow.data.energy = 34 if mood in ('night', 'evening') else 0
        scene.render.filepath = str(output / (key + '-cycles.jpg'))
        bpy.ops.render.render(write_still=True)

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--')+1:]
    destination = Path(args[0]).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    render(destination, args[1:] or VIEWS)
