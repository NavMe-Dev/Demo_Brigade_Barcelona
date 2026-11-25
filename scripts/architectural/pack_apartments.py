"""Keep interactive visibility groups, combine material batches and encode KTX2/meshopt."""
import json,os,struct,subprocess,tempfile
from pathlib import Path
GROUPS={'floors','walls_lower','walls_upper','openings','ceiling','lighting_fixtures','furniture','fixed_fittings'}
def pack(input_file,code,destination):
    data=input_file.read_bytes();length=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+length]);rest=data[20+length:]
    for node in doc['nodes']:
        if node.get('name') not in GROUPS and node.get('name')!='Residence_'+code:
            node.pop('name',None)
    for mesh in doc['meshes']:mesh.pop('name',None)
    for image in doc.get('images',[]):
        if image.get('name')=='A3 diffuse irradiance':image['name']=code+' diffuse irradiance'
    desc=json.dumps(doc,separators=(',',':')).encode();desc+=b' '*(-len(desc)%4)
    with tempfile.TemporaryDirectory() as tmp:
        source=Path(tmp)/'batched.glb';source.write_bytes(struct.pack('<4sIIII',b'glTF',2,20+len(desc)+len(rest),len(desc),0x4e4f534a)+desc+rest)
        output=Path(tmp)/'compressed.glb'
        subprocess.run([os.environ.get('GLTFPACK','gltfpack'),'-cc','-ce','ext','-tc','-tl','512','-tj','2','-vtf','-kn','-km','-ke','-i',str(source),'-o',str(output)],check=True)
        destination.write_bytes(output.read_bytes())
if __name__=='__main__':
    import bpy,sys
    root=Path(__file__).resolve().parents[2]
    for code in sys.argv[sys.argv.index('--')+1:]:
        bpy.ops.wm.open_mainfile(filepath=str(root/'models/apartments'/f'apartment-{code.lower()}.blend'))
        with tempfile.TemporaryDirectory() as tmp:
            source=Path(tmp)/'editable.glb'
            bpy.ops.export_scene.gltf(filepath=str(source),export_format='GLB',export_extras=True,export_cameras=False,export_lights=False)
            pack(source,code,root/'dist/assets/apartments'/code/f'apartment-{code.lower()}.glb')
