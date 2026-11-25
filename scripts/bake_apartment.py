"""Bake multi-bounce irradiance onto the architectural shell for the web renderer.
Called by render_room_views.py with BRIGADE_BAKED_GLB set. Uses Blender Cycles.
"""
from pathlib import Path
import bpy
import math


def bake(scene, destination, atlas_size=1024, samples=40):
    surfaces = [o for o in scene.objects if o.type == 'MESH' and
                o.name.startswith(('walls_lower__','walls_upper__','floors__','ceiling__'))]
    image = bpy.data.images.new('A3 diffuse irradiance',width=atlas_size,height=atlas_size,alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    image.generated_color = (1,1,1,1)
    bpy.ops.object.select_all(action='DESELECT')
    for o in surfaces:
        if not o.data.uv_layers:
            o.data.uv_layers.new(name='Surface')
        bake_uv = o.data.uv_layers.new(name='Irradiance')
        o.data.uv_layers.active = bake_uv
        o.select_set(True)
        for slot in o.material_slots:
            material=slot.material.copy()
            material.name = slot.material.name + ' GI'
            slot.material=material
            nodes=material.node_tree.nodes
            tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.name='Baked daylight'
            nodes.active=tex
    bpy.context.view_layer.objects.active=surfaces[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(65),island_margin=.003)
    bpy.ops.object.mode_set(mode='OBJECT')
    scene.cycles.samples=samples
    scene.render.bake.use_pass_color=False
    scene.render.bake.use_pass_direct=True
    scene.render.bake.use_pass_indirect=True
    scene.render.bake.margin=4
    bpy.ops.object.bake(type='DIFFUSE',uv_layer='Irradiance')
    # A short linear-space denoise removes isolated Monte Carlo noise while the
    # four-pixel bake margin protects island edges at the target atlas resolution.
    import numpy as np
    pixels=np.empty(atlas_size*atlas_size*4,dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgba=pixels.reshape(atlas_size,atlas_size,4)
    for step in (1,2):
        padded=np.pad(rgba,((step,step),(step,step),(0,0)),mode='edge')
        result=np.zeros_like(rgba)
        for i,wi in enumerate((1,2,1)):
            for j,wj in enumerate((1,2,1)):
                result+=wi*wj*padded[i*step:i*step+atlas_size,j*step:j*step+atlas_size]
        rgba=result/16
    image.pixels.foreach_set(rgba.ravel())
    image.update()
    image.pack()
    group=bpy.data.node_groups.get('glTF Material Output')
    if not group:
        group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
        group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    for o in surfaces:
        o.data.uv_layers.active_index=0
        for slot in o.material_slots:
            mat=slot.material
            nodes,links=mat.node_tree.nodes,mat.node_tree.links
            ao=next((n for n in nodes if n.type=='GROUP' and n.node_tree and n.node_tree.name=='glTF Material Output'),None)
            if not ao:
                ao=nodes.new('ShaderNodeGroup');ao.node_tree=group
            uv=nodes.new('ShaderNodeUVMap');uv.uv_map='Irradiance'
            tex=nodes['Baked daylight']
            links.new(uv.outputs['UV'],tex.inputs['Vector'])
            links.new(tex.outputs['Color'],ao.inputs['Occlusion'])
    # The exporter omits offline cameras/lights. Runtime lights remain independently adjustable.
    bpy.ops.export_scene.gltf(filepath=str(Path(destination).resolve()), export_format='GLB',
                             export_extras=True, export_cameras=False, export_lights=False,
                             export_yup=True, export_texcoords=True, export_materials='EXPORT')
