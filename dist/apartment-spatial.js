import * as THREE from 'three';

let manifest;
export async function getApartmentPlacement(code) {
  manifest ??= fetch(new URL('./data/apartment-spatial.json',import.meta.url)).then(response=>{
    if(!response.ok)throw Error('Spatial registration unavailable');
    return response.json();
  }).catch(error=>{manifest=null;throw error;});
  return (await manifest).placements[code];
}

export function apartmentTransform(placement, floor) {
  const rotation=new THREE.Matrix4().makeRotationY(placement.yaw);
  const center=new THREE.Vector3(placement.localCenter[0],0,placement.localCenter[1]).applyMatrix4(rotation);
  return rotation.setPosition(new THREE.Vector3(placement.center[0],floor.elevation,placement.center[1]).sub(center));
}

export function createApartmentContext(model, placement) {
  const root=new THREE.Group();
  const plates=new THREE.Group();
  const ownedMaterials=new Set(), ownedGeometries=new Set();
  const bayPlanes = Array.from({length:6},()=>new THREE.Plane());
  const sectionPlane = new THREE.Plane(new THREE.Vector3(0,-1,0),-.08);
  const pruned=model.clone(true);
  // Meshopt pack places repeated storey batches at the glTF scene root,
  // outside the named wing nodes. Detect those batches by their vertical run.
  const towerSource=new THREE.Group();
  const detached=[];
  const instance=new THREE.Matrix4();
  pruned.updateMatrixWorld(true);
  pruned.traverse(object=>{
    if(/^Wing_[AB]_distance$/.test(object.name)){
      detached.push(object);
      return;
    }
    if(!object.isInstancedMesh||object.count<5)return;
    let low=Infinity, high=-Infinity;
    for(let i=0;i<object.count;i++){
      object.getMatrixAt(i,instance);
      const height=instance.elements[13];
      low=Math.min(low,height);high=Math.max(high,height);
    }
    if(low>12&&high-low>=15)detached.push(object);
  });
  for(const object of detached)towerSource.attach(object);
  const walkWing=new THREE.Group(), sectionWing=new THREE.Group();
  if(towerSource.children.length){
    function clip(target,planes,intersection){
      const clipped=new Map();
      const wing=towerSource.clone(true);
      wing.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const originals=[].concat(mesh.material);
        const mapped=originals.map(source=>{
          if(!clipped.has(source)){
            const material=source.clone();
            material.clippingPlanes=planes;
            material.clipIntersection=intersection;
            material.clipShadows=true;
            if(!intersection){
              material.color.set('#b6aea2');
              material.map=null;
              material.normalMap=null;
              material.roughness=.88;
            }
            clipped.set(source,material);
            ownedMaterials.add(material);
          }
          return clipped.get(source);
        });
        mesh.material=Array.isArray(mesh.material)?mapped:mapped[0];
      });
      target.add(wing);
    }
    clip(walkWing,bayPlanes,true);
    clip(sectionWing,[sectionPlane],false);
    towerSource.traverse(mesh=>{if(mesh.isInstancedMesh)mesh.dispose();});
  }
  // A section line around the registered plan shows its relationship to the traced bay.
  const [x0,z0,x1,z1]=placement.footprint;
  const lineGeometry=new THREE.BufferGeometry().setFromPoints([
    [x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0],
  ].map(([x,z])=>new THREE.Vector3(x,0,z)));
  const lineMaterial=new THREE.LineBasicMaterial({color:0xc99a5e});
  ownedGeometries.add(lineGeometry);
  ownedMaterials.add(lineMaterial);
  const bay=new THREE.Line(lineGeometry,lineMaterial);
  plates.add(bay);
  root.add(pruned,walkWing,sectionWing,plates);
  const [low,high]=placement.localBounds;
  const worldBounds=new THREE.Box3();
  const corner=new THREE.Vector3();
  const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  return {
    root,
    update(floor, cutaway){
      root.matrixAutoUpdate=false;
      const localToWorld=apartmentTransform(placement,floor);
      root.matrix.copy(localToWorld).invert();
      root.matrixWorldNeedsUpdate=true;
      worldBounds.makeEmpty();
      for (const x of [low[0],high[0]]) for(const z of [low[1],high[1]])
        worldBounds.expandByPoint(corner.set(x,0,z).applyMatrix4(localToWorld));
      const limits=[
        -Math.max(x1,worldBounds.max.x)-.28,Math.min(x0,worldBounds.min.x)-.28,
        -floor.elevation-3.05,floor.elevation-.08,
        -Math.max(z1,worldBounds.max.z)-.28,Math.min(z0,worldBounds.min.z)-.28,
      ];
      for(let i=0;i<bayPlanes.length;i++){
        const plane=bayPlanes[i];
        plane.normal.fromArray(directions[i]);
        plane.constant=limits[i];
        plane.applyMatrix4(root.matrix);
      }
      bay.position.y=floor.elevation+.04;
      walkWing.visible=!cutaway;
      sectionWing.visible=cutaway;
      plates.visible=cutaway;
    },
    dispose(){
      root.removeFromParent();
      for(const material of ownedMaterials)material.dispose();
      for(const geometry of ownedGeometries)geometry.dispose();
      root.traverse(mesh=>{if(mesh.isInstancedMesh)mesh.dispose();});
    },
  };
}

export function anchorRoute(navigator,start,anchor) {
  const nodes=[...navigator.nodes.values()].filter(n=>n.room_id===anchor.room);
  for(const eye of anchor.candidates){
    if(!navigator.canStand(eye[0],eye[2]))continue;
    if(navigator.lineClear(start,eye))return [start,eye];
    for(const node of nodes){
      if(!navigator.lineClear(node.position,eye))continue;
      const route=navigator.route(start,node.id);
      if(route)return [...route,eye];
    }
  }
  return null;
}
