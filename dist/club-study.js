// The brochure lists these rooms without a level schedule. This cutaway viewer
// presents independent furniture studies, each in its own local coordinate frame.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

export async function inspectClubStudy(host,feature){
  const dialog=document.createElement('dialog'),head=document.createElement('div');
  dialog.className='building-plan-dialog club-study-dialog';
  const title=document.createElement('h2');title.textContent=feature.name;
  const close=document.createElement('button');close.textContent='Close';close.onclick=()=>dialog.close();
  head.append(title,close);
  const viewport=document.createElement('div');viewport.className='club-study-viewport';
  const caption=document.createElement('p');caption.textContent='Illustrative room study · Clubhouse level and interior plan unconfirmed.';
  dialog.append(head,viewport,caption);host.append(dialog);dialog.showModal();
  let renderer,controls,scene,frame,observer,disposed=false;
  function dispose(){
    disposed=true;cancelAnimationFrame(frame);controls?.dispose();observer?.disconnect();
    scene?.traverse(o=>{o.geometry?.dispose();for(const mat of [].concat(o.material||[]))mat.dispose();});
    renderer?.dispose();renderer?.forceContextLoss();dialog.remove();
  }
  dialog.addEventListener('close',dispose,{once:true});
  const monitor=new MutationObserver(()=>{if(!dialog.isConnected){monitor.disconnect();if(!disposed)dispose();}});
  monitor.observe(host.parentNode||document.body,{childList:true,subtree:true});
  try {
    renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
    viewport.append(renderer.domElement);renderer.domElement.setAttribute('aria-label',feature.name+' three-dimensional cutaway; drag to rotate');
    const model=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('assets/clubhouse-studies.glb');
    scene=new THREE.Scene();scene.add(model.scene);
    if(disposed){scene.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[]))m.dispose();});return;}
    scene.background=new THREE.Color('#e9ddc9');
    model.scene.traverse(o=>{if(o.userData.amenityId)o.visible=o.userData.amenityId===feature.id;});
    scene.add(new THREE.HemisphereLight(0xfffbec,0xa89a80,2.5));
    const light=new THREE.DirectionalLight(0xffe1ac,3.1);light.position.set(-3,9,6);scene.add(light);
    const camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.set(7.5,5.8,9.8);
    controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.8,0);controls.maxPolarAngle=Math.PI*.49;
    controls.minDistance=5;controls.maxDistance=24;controls.enablePan=false;controls.update();
    const paint=()=>{if(disposed)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>renderer.render(scene,camera));};
    function resize(){const r=viewport.getBoundingClientRect();if(!r.height)return;renderer.setSize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();paint();}
    controls.addEventListener('change',paint);observer=new ResizeObserver(resize);observer.observe(viewport);resize();
  }catch{
    if(!disposed)viewport.textContent='The live room study could not load. Brochure artwork is available in the clubhouse view.';
  }
}
