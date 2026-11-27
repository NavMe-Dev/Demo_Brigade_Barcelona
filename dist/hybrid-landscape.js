import * as THREE from 'three';
import { loadTerrain } from './geo-terrain.js';
import { loadEsriElevation } from './gis-elevation.js';
import { createArcGISOverlay, mercatorTile } from './gis-arcgis.js';
import { createRoads } from './geo-roads.js';
import { createBuildings } from './geo-buildings.js';
import { createArrival } from './geo-arrival.js';

const asset = file => new URL('./assets/' + file, import.meta.url).href;

export async function loadHybrid(loader, invalidate) {
  const [baseTerrain, parcel, settings] = await Promise.all([
    loadTerrain(),
    fetch(asset('geography/plot-20.geojson')).then(response => response.json()),
    fetch(new URL('./data/arcgis-runtime.json', import.meta.url), { cache: 'no-store' })
      .then(response => response.ok ? response.json() : {}).catch(() => ({})),
  ]);
  const boundary = parcel.geometry.coordinates[0].slice(0,-1).map(point => baseTerrain.wgs84ToLocal(...point));
  const terrain = await loadEsriElevation(baseTerrain, settings, boundary);
  const root = new THREE.Group();
  root.name = 'Plot 20 architectural and geographic environment';
  const mobile = innerWidth <= 680;
  let active = true, disposed = false;
  const arc = settings.arcgisImageryEnabled && settings.arcgisApiKey
    ? createArcGISOverlay(THREE, terrain, { mobile, onChange: () => invalidate(false), key: settings.arcgisApiKey }) : null;
  const textureLoader = new THREE.TextureLoader();
  const textures = await Promise.all(['geography/roads/soil-color.webp','textures/architecture/grass-base-color.png'].map(async file => {
    const texture = await textureLoader.loadAsync(asset(file));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  }));
  const zones = { value: new THREE.Vector2(8,32) };
  const material = new THREE.MeshStandardMaterial({ map: textures[0], roughness: .96, color: '#ffffff' });
  arc?.decorate(material);
  const decorate = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    decorate.call(material, shader);
    Object.assign(shader.uniforms, {
      parcelBoundary: { value: boundary.map(point => new THREE.Vector2(...point)) },
      zoneBlend: zones,
      soilSurface: { value: textures[0] },
      grassSurface: { value: textures[1] },
    });
    shader.vertexShader = 'varying vec2 groundPosition;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\ngroundPosition = position.xz;');
    shader.fragmentShader = `varying vec2 groundPosition;
      uniform vec2 parcelBoundary[${boundary.length}];
      uniform vec2 zoneBlend;
      uniform sampler2D soilSurface;
      uniform sampler2D grassSurface;
      float distanceFromParcel(vec2 p) {
        float distanceToEdge = 100000.0;
        bool inside = false;
        for(int i=0; i<${boundary.length}; i++) {
          vec2 a=parcelBoundary[i], b=parcelBoundary[(i+1)%${boundary.length}];
          vec2 segment=b-a;
          float t=clamp(dot(p-a,segment)/dot(segment,segment),0.0,1.0);
          distanceToEdge=min(distanceToEdge,length(p-a-t*segment));
          if((a.y>p.y)!=(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
        }
        return inside ? -distanceToEdge : distanceToEdge;
      }
      ` + shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        float edge = distanceFromParcel(groundPosition);
        vec3 soil = texture2D(soilSurface,groundPosition/5.0).rgb;
        vec3 broad = texture2D(soilSurface,groundPosition.yx/37.0).rgb;
        vec3 lawn = texture2D(grassSurface,groundPosition/4.0).rgb;
        float variation=.5+.5*sin(groundPosition.x*.031)*cos(groundPosition.y*.026);
        vec3 localGround = mix(soil*.68+broad*.32,lawn*.74,1.0-smoothstep(-10.0,3.0,edge));
        localGround *= .88+variation*.16;
        diffuseColor.rgb = mix(diffuseColor.rgb,localGround*diffuse,1.0-smoothstep(zoneBlend.x,zoneBlend.y,edge));
      `);
  };
  material.customProgramCacheKey = () => 'hybrid-parcel-' + Boolean(arc);
  const patchSize = 1024;
  for(let z=-terrain.radius; z<terrain.radius; z+=patchSize) {
    for(let x=-terrain.radius; x<terrain.radius; x+=patchSize) {
      const position=[], uv=[], tile=[], indices=[];
      const steps=patchSize/terrain.step;
      for(let j=0;j<=steps;j++) for(let i=0;i<=steps;i++) {
        const px=x+i*terrain.step, pz=z+j*terrain.step;
        position.push(px,terrain.heightAt(px,pz),pz);
        uv.push(px/7,pz/7);
        if(arc){
          const [tx,ty]=mercatorTile(...terrain.localToWGS84(px,pz),arc.projection.level);
          tile.push(tx-arc.projection.x,ty-arc.projection.y);
        }
        if(i<steps&&j<steps){const n=j*(steps+1)+i;indices.push(n,n+steps+1,n+steps+2,n,n+steps+2,n+1);}
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      if(arc)geometry.setAttribute('geoTile',new THREE.Float32BufferAttribute(tile,2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,material);
      mesh.receiveShadow=true;
      root.add(mesh);
    }
  }
  const roads=createRoads(THREE,terrain,invalidate);
  const buildings=createBuildings(THREE,terrain,{quality:mobile?'mobile':'desktop',maxDistance:1800,onChange:invalidate});
  const arrival=createArrival(THREE,terrain,invalidate);
  root.add(roads.root,buildings.root,arrival.root);
  await roads.startup;
  // Perimeter specimens stay in the published parcel. Existing masterplan plants
  // remain in the architecture GLB, including terrace palms and raised gardens.
  const positions=[[-55,36],[-54,42],[-48,49],[-41,54],[-29,59],[-18,64],[3,65],[21,64],[39,63],[54,53]];
  const inside=([x,z])=>{
    let value=false;
    for(let i=0,j=boundary.length-1;i<boundary.length;j=i++){
      const [a,b]=boundary[i],[c,d]=boundary[j];
      if((b>z)!=(d>z)&&x<(c-a)*(z-b)/(d-b)+a)value=!value;
    }
    return value;
  };
  loader.loadAsync(asset('showcase/specimen.glb')).then(({scene})=>{
    scene.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(scene), center=bounds.getCenter(new THREE.Vector3());
    const placement=new THREE.Object3D(), sites=positions.filter(inside);
    scene.traverse(source=>{
      if(!source.isMesh)return;
      if(disposed){source.geometry.dispose();for(const m of [].concat(source.material))m.dispose();return;}
      const geometry=source.geometry.clone().applyMatrix4(source.matrixWorld).translate(-center.x,-bounds.min.y,-center.z);
      source.geometry.dispose();
      const mesh=new THREE.InstancedMesh(geometry,source.material,sites.length);
      sites.forEach(([x,z],i)=>{
        placement.position.set(x,terrain.heightAt(x,z),z);
        placement.scale.setScalar(1.25+(i%3)*.16);placement.rotation.y=i*2.399963;placement.updateMatrix();
        mesh.setMatrixAt(i,placement.matrix);
      });
      mesh.computeBoundingSphere();mesh.castShadow=mesh.receiveShadow=true;
      root.add(mesh);
    });
    invalidate();
  }).catch(()=>{});
  let regionArc, regionMaterial;
  async function loadRegion() {
    const [location,grid]=await Promise.all([
      fetch(new URL('./data/location.json',import.meta.url)).then(response=>response.json()),
      fetch(asset('geography/region-dem.json')).then(response=>response.json()),
    ]);
    if(disposed)return;
    const [[west,north],,[east,south]]=location.region.corners;
    const regionTerrain={...terrain,radius:32768};
    regionArc=arc ? createArcGISOverlay(THREE,regionTerrain,{mobile,onChange:()=>invalidate(false),key:settings.arcgisApiKey,startLevel:10}):null;
    regionMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',map:textures[0],roughness:1});
    regionArc?.decorate(regionMaterial);
    function sample(x,z) {
      const [lon,lat]=terrain.localToWGS84(x,z);
      const gx=THREE.MathUtils.clamp((lon-west)/(east-west)*(grid.cols-1),0,grid.cols-1);
      const gy=THREE.MathUtils.clamp((north-lat)/(north-south)*(grid.rows-1),0,grid.rows-1);
      const a=Math.min(grid.cols-2,Math.floor(gx)),b=Math.min(grid.rows-2,Math.floor(gy));
      const tx=gx-a,ty=gy-b,k=b*grid.cols+a;
      const height=THREE.MathUtils.lerp(THREE.MathUtils.lerp(grid.heights[k],grid.heights[k+1],tx),
        THREE.MathUtils.lerp(grid.heights[k+grid.cols],grid.heights[k+grid.cols+1],tx),ty)-terrain.anchorElevationM;
      const distance=Math.max(Math.abs(x),Math.abs(z));
      return THREE.MathUtils.lerp(terrain.heightAt(x,z),height,THREE.MathUtils.smoothstep(distance,terrain.radius,terrain.radius+1024));
    }
    const axis=[];
    for(let value=-32768;value< -terrain.radius;value+=256)axis.push(value);
    for(let value=-terrain.radius;value<=terrain.radius;value+=terrain.step)axis.push(value);
    for(let value=terrain.radius+256;value<=32768;value+=256)axis.push(value);
    const points=[],tiles=[],coordinates=[],indices=[],width=axis.length;
    for(let row=0;row<width;row++)for(let col=0;col<width;col++){
      const x=axis[col],z=axis[row];
      points.push(x,sample(x,z),z);
      coordinates.push(x/96,z/96);
      if(regionArc){const [u,v]=mercatorTile(...terrain.localToWGS84(x,z),regionArc.projection.level);tiles.push(u-regionArc.projection.x,v-regionArc.projection.y);}
      if(row<width-1&&col<width-1 && (x< -terrain.radius || z< -terrain.radius || x>=terrain.radius || z>=terrain.radius)){
        const n=row*width+col;indices.push(n,n+width,n+width+1,n,n+width+1,n+1);
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(coordinates,2));
    if(regionArc)geometry.setAttribute('geoTile',new THREE.Float32BufferAttribute(tiles,2));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    root.add(new THREE.Mesh(geometry,regionMaterial));
    invalidate();
  }
  const regionReady=loadRegion().catch(()=>{});
  const localCamera=new THREE.PerspectiveCamera(), inverse=new THREE.Matrix4();
  const frustum=new THREE.Frustum(), clip=new THREE.Matrix4();
  return {
    root, terrain, regionReady,
    retryImagery(){arc?.retry();regionArc?.retry();},
    async prepareArrival(camera,height) {
      if(!arc)return false;
      await regionReady;
      const regionalCamera=camera.clone();
      regionalCamera.position.set(-3500,17500,-7500);
      regionalCamera.lookAt(-1800,0,-9000);
      regionalCamera.far=80000;regionalCamera.near=4;
      regionalCamera.updateProjectionMatrix();regionalCamera.updateMatrixWorld();
      this.update(regionalCamera,height);
      camera.updateMatrixWorld();
      this.update(camera,height);
      const deadline=performance.now()+4500;
      while(active && !disposed && performance.now()<deadline){
        if(arc.stats().visibleTiles && regionArc?.stats().visibleTiles)return true;
        await new Promise(resolve=>setTimeout(resolve,60));
      }
      return false;
    },
    setActive(value){active=value;root.visible=value;arc?.setActive(value);regionArc?.setActive(value);buildings.setActive(value);roads.setActive(value);},
    setMood(value){arrival.setMood(value);},
    setQuality(value){roads.setQuality(value);arrival.setQuality(value);buildings.setQuality(value);},
    update(camera,height){
      if(!active)return;
      root.updateWorldMatrix(true,false);
      inverse.copy(root.matrixWorld).invert();
      localCamera.matrix.multiplyMatrices(inverse,camera.matrixWorld);
      localCamera.matrix.decompose(localCamera.position,localCamera.quaternion,localCamera.scale);
      localCamera.projectionMatrix.copy(camera.projectionMatrix);
      localCamera.fov=camera.fov;localCamera.updateMatrixWorld();
      clip.multiplyMatrices(localCamera.projectionMatrix,localCamera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(clip);
      arc?.update(localCamera,localCamera.position,frustum,height);
      if(localCamera.position.y>600)regionArc?.update(localCamera,localCamera.position,frustum,height);
      buildings.update(localCamera);roads.update(localCamera);
    },
    stats:()=>({kind:'hybrid',anchor:terrain.localToWGS84(0,0),anchorElevationM:terrain.anchorElevationM,
      elevation:terrain.esriElevation??{provider:'open DEM'},
      regionalImagery:regionArc?.stats()??null,
      imagery:arc?.stats()??{provider:'architectural',reason:'Geographic imagery unavailable · architectural ground'},
      roads:roads.stats(),buildings:buildings.stats(),zones:{blendStartM:zones.value.x,blendEndM:zones.value.y}}),
    dispose(){disposed=true;arc?.dispose();regionArc?.dispose();regionMaterial?.dispose();roads.dispose();buildings.dispose();arrival.dispose();
      root.traverse(mesh=>{mesh.geometry?.dispose();if(mesh.isInstancedMesh)mesh.dispose();});
      const materials=new Set(),ownedTextures=new Set(textures);
      root.traverse(mesh=>{for(const material of [].concat(mesh.material||[]))materials.add(material);});
      for(const material of materials){for(const value of Object.values(material))if(value?.isTexture)ownedTextures.add(value);material.dispose();}
      for(const texture of ownedTextures)texture.dispose();root.clear();},
  };
}
