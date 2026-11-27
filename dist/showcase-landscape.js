import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createArrival } from './showcase-arrival.js';

const assets = new URL('./assets/showcase/', import.meta.url);
let shared;
export function landscapeHeight(x,z) {
  const distance = Math.hypot(x,z);
  const blend = THREE.MathUtils.clamp((distance-92)/330,0,1);
  const low = 6*Math.sin(x*.022+z*.012)*Math.cos(z*.018)+3*Math.sin(z*.041);
  const hill = 85*Math.sin(x*.0033+1.3)**2*Math.cos(z*.004)**2+75*Math.sin(z*.003-x*.001)**2;
  return -.075+blend*blend*(low+hill*THREE.MathUtils.clamp((distance-230)/590,0,1));
}
export function getShowcase() {
  return shared || Promise.reject(new Error('The architectural landscape is unavailable.'));
}
export function loadShowcase(loader, invalidate) {
  shared = build(loader, invalidate).catch(error => { shared = null; throw error; });
  return shared;
}
function compoundTree(seed, detailed) {
  const pieces = [];
  function add(shape, x,y,z, wood) {
    const geometry = shape.index ? shape.toNonIndexed() : shape;
    if (geometry !== shape) shape.dispose();
    geometry.translate(x,y,z);
    const base = new THREE.Color(wood?'#655139':(['#607c39','#526f37','#456432','#6c813e','#53743d'][seed]));
    const positions = geometry.attributes.position;
    const colors = [];
    for (let i=0;i<positions.count;i++) {
      const gain = wood ? 1 : .78 + .23*Math.sin(12*positions.getX(i)+5*positions.getZ(i)) + .025*positions.getY(i);
      colors.push(base.r*gain,base.g*gain,base.b*gain);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    pieces.push(geometry);
  }
  const palm = seed === 4;
  if (detailed || palm) {
    const stem = new THREE.CylinderGeometry(palm?.12:.17,.25,palm?8.2:5.2,5);
    stem.rotateZ(.07);
    add(stem,0,palm?4.1:2.6,0,true);
  }
  if (palm) {
    for (let i=0;i<(detailed?11:6);i++) {
      const frond = new THREE.BufferGeometry();
      const positions = [], uv = [], index = [];
      for (let k=0;k<=5;k++) {
        const t=k/5, w=Math.sin(t*Math.PI)*.5;
        positions.push(t*3.2,Math.sin(t*Math.PI)*.95-t*1.5,-w,t*3.2,Math.sin(t*Math.PI)*1.13-t*1.5,w);
        uv.push(t,0,t,1);
        if(k) index.push(2*k-2,2*k-1,2*k,2*k-1,2*k+1,2*k);
      }
      frond.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      frond.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      frond.setIndex(index);
      frond.computeVertexNormals();
      frond.rotateY(i*2.399963);
      add(frond,-.2,8.15,0,false);
    }
  } else {
    const count = detailed ? 17 : 5;
    for (let i=0;i<count;i++) {
      const angle = i*2.399963+seed*1.7, spread=1.2+1.05*Math.sin(i*3.16+seed);
      const crown = new THREE.IcosahedronGeometry(1,detailed?1:0);
      const p = crown.attributes.position;
      for (let j=0;j<p.count;j++) {
        const x=p.getX(j),y=p.getY(j),z=p.getZ(j);
        const grain=1+.24*Math.sin(x*9+y*3+z*5+i);
        p.setXYZ(j,x*grain,y*grain,z*grain);
      }
      crown.scale(1.65+seed*.10,1.36,1.62);
      crown.computeVertexNormals();
      add(crown,Math.cos(angle)*spread,4.6+1.5*Math.sin(i*.65+seed)**2+seed*.22,Math.sin(angle)*spread,false);
    }
  }
  const merged = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return merged;
}
async function build(loader, invalidate) {
  const { scene: root } = await loader.loadAsync(new URL('landscape.glb',assets).href);
  root.name = 'Illustrative architectural gardens';
  root.traverse(object=>{if(object.isMesh) object.receiveShadow=true;});
  const arrivals = createArrival(THREE,{heightAt:landscapeHeight},invalidate);
  root.add(arrivals.root);
  const textureLoader = new THREE.TextureLoader();
  const ground = root.getObjectByName('Showcase_ground');
  if (ground?.material) {
    ground.material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec2 grassPlace;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>', '#include <begin_vertex>\ngrassPlace = position.xz;');
      shader.fragmentShader = 'varying vec2 grassPlace;\n' + shader.fragmentShader.replace(
        '#include <color_fragment>', `
          #include <color_fragment>
          float meadow = sin(grassPlace.x*.039 + grassPlace.y*.021) * cos(grassPlace.y*.046);
          float woodland = sin(grassPlace.x*.009-grassPlace.y*.014) * cos(grassPlace.y*.018);
          diffuseColor.rgb *= .71 + .11 * meadow + .13 * woodland;
        `);
    };
  }
  let bake, disposed = false, active = true, quality = 'auto', baked = false;
  const tiles = new Map(), templates = [], specimens = [];
  let specimenRequest;
  const avenue = [[-128,36],[-112,48],[-95,54],[-79,64],[71,54],[87,62],[104,47],[119,49],
    [-120,104],[-98,111],[-76,113],[-55,111],[-36,110],[-10,112],[18,116],[43,112],[67,110],
    [88,106],[114,97],[-82,-91],[-81,-113],[78,-86],[84,-106]];
  function loadSpecimens() {
    if(specimenRequest || disposed)return;
    specimenRequest=loader.loadAsync(new URL('specimen.glb',assets).href).then(({scene})=>{
      scene.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(scene), middle=bounds.getCenter(new THREE.Vector3());
      const instance=new THREE.Object3D();
      scene.traverse(source=>{
        if(!source.isMesh)return;
        if(disposed){source.geometry.dispose();source.material.dispose();return;}
        const geo=source.geometry.clone().applyMatrix4(source.matrixWorld).translate(-middle.x,-bounds.min.y,-middle.z);
        source.geometry.dispose();
        const mesh=new THREE.InstancedMesh(geo,source.material,avenue.length);
        for(let i=0;i<avenue.length;i++){
          const [x,z]=avenue[i];
          instance.position.set(x,landscapeHeight(x,z)-.02,z);
          instance.scale.setScalar(1.55+(i%5)*.24);
          instance.rotation.y=i*2.399963;
          instance.updateMatrix();
          mesh.setMatrixAt(i,instance.matrix);
        }
        mesh.computeBoundingSphere();
        mesh.castShadow=mesh.receiveShadow=true;
        specimens.push(mesh);
        root.add(mesh);
      });
      invalidate();
    }).catch(()=>{specimenRequest=null;});
  }
  const leaf = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.93,side:THREE.DoubleSide});
  textureLoader.load(new URL('terrain-indirect.png',assets).href,texture=>{
    if(disposed){texture.dispose();return;}
    bake = texture;
    texture.flipY=false;
    texture.channel=1;
    if(ground?.geometry?.hasAttribute('uv1')) {
      ground.material.lightMap=texture;
      ground.material.lightMapIntensity=.46;
      ground.material.needsUpdate=true;
      baked=true;
    }
    invalidate();
  },undefined,()=>{});
  fetch(new URL('planting.json',assets)).then(response=>{
    if(!response.ok) throw Error('Planting layout unavailable');
    return response.json();
  }).then(rows=>{
    if(disposed)return;
    const transform = new THREE.Object3D();
    const groups = new Map();
    for (const row of rows) {
      const [x,,z,,variant] = row;
      const tileX=Math.floor(x/180),tileZ=Math.floor(z/180);
      const key=[tileX,tileZ,variant].join(',');
      if(avenue.some(([u,v])=>(x-u)**2+(z-v)**2<30))continue;
      if(!groups.has(key))groups.set(key,{tileX,tileZ,variant,plants:[]});
      groups.get(key).plants.push(row);
    }
    for(let i=0;i<5;i++)templates.push([compoundTree(i,false),compoundTree(i,true)]);
    for(const {tileX,tileZ,variant,plants} of groups.values()) {
      const key=tileX+','+tileZ;
      if(!tiles.has(key))tiles.set(key,{x:(tileX+.5)*180,z:(tileZ+.5)*180,pairs:[]});
      const pair=templates[variant].map((geo,detail)=>{
        const mesh=new THREE.InstancedMesh(geo,leaf,plants.length);
        for(let i=0;i<plants.length;i++){
          const [x,y,z,size]=plants[i];
          transform.position.set(x,y,z);
          transform.rotation.y=i*2.399963+x*.179;
          transform.scale.set(size,size*(.84+.3*Math.sin(z)**2),size);
          transform.updateMatrix();
          mesh.setMatrixAt(i,transform.matrix);
        }
        mesh.computeBoundingSphere();
        mesh.castShadow=Boolean(detail);
        mesh.receiveShadow=Boolean(detail);
        root.add(mesh);
        return mesh;
      });
      tiles.get(key).pairs.push(pair);
    }
    invalidate();
  }).catch(error=>console.warn('Scenic planting unavailable', error));
  const eye=new THREE.Vector3();
  return {
    root, setActive(value){active=value;root.visible=value;},
    setQuality(value){
      quality=value;
      arrivals.setQuality(value);
      const high=value!=='performance'&&(value!=='auto'||innerWidth>680);
      if(high)loadSpecimens();
      for(const mesh of specimens)mesh.visible=high;
    },
    setMood(value){arrivals.setMood(value);},
    update(camera){
      if(!active)return;
      root.worldToLocal(camera.getWorldPosition(eye));
      const mobile=quality==='performance'||(quality==='auto'&&innerWidth<=680);
      for(const mesh of specimens)mesh.visible=!mobile && eye.length()<1150;
      for(const tile of tiles.values()) {
        const distance=Math.hypot(eye.x-tile.x,eye.z-tile.z,eye.y*.55);
        const threshold=quality==='cinematic'?440:quality==='high'?285:225;
        tile.detailed=!mobile && distance < threshold + (tile.detailed ? 30 : -30);
        const visibleRange=mobile?1450:2250;
        tile.visible=distance < visibleRange + (tile.visible ? 70 : -70);
        for(const [low,high] of tile.pairs) {
          low.visible=!tile.detailed&&tile.visible;
          high.visible=tile.detailed;
        }
      }
    },
    stats:()=>({plantingTiles:tiles.size,terrainIndirect:baked,specimenBatches:specimens.length}),
    dispose(){
      disposed=true;
      arrivals.dispose();
      const materials=new Set(), textures=new Set();
      root.traverse(object=>{
        object.geometry?.dispose();
        if(object.isInstancedMesh)object.dispose();
        if(object.material)for(const material of [].concat(object.material))materials.add(material);
      });
      for(const material of materials){
        for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
        material.dispose();
      }
      for(const texture of textures)texture.dispose();
      for(const pair of templates)for(const geometry of pair)geometry.dispose();
      leaf.dispose();bake?.dispose();root.removeFromParent();
    },
  };
}
