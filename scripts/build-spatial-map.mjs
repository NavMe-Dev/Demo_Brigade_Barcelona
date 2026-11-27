import { readFile, writeFile } from 'node:fs/promises';
import { insidePolygon, makeNavigator } from '../dist/navigation.js';

const dist=new URL('../dist/',import.meta.url);
const read=async file=>JSON.parse(await readFile(new URL(file,dist),'utf8'));
const [scene,templates,catalog]=await Promise.all([
  read('assets/scene-map.json'),read('data/floor-templates.json'),read('data/unit-layouts.json'),
]);
const midpoint=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const move=(p,v,d)=>[p[0]+v[0]*d,p[1]+v[1]*d];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const clamp=(v,a,b)=>Math.min(Math.max(v,a),b);
const neighborVolumes=Object.values(scene.wings).flatMap(wing=>wing.footprints);
function normal(a,b){
 const d=distance(a,b);
 return [-(b[1]-a[1])/d,(b[0]-a[0])/d];
}
const placements={};
for(const layout of catalog.layouts){
 const code=layout.code, wing=code[0], geometry=await read(layout.geometry);
 const navigator=makeNavigator(geometry,await read(layout.collisions));
 const [x0,z0,x1,z1]=scene.designFootprints[code];
 const center=midpoint([x0,z0],[x1,z1]);
 const min=[Infinity,Infinity],max=[-Infinity,-Infinity];
 for(const p of geometry.outline)for(let i=0;i<2;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
 const localCenter=midpoint(min,max);
 const entry=geometry.openings.find(o=>o.id==='entry'||o.connects?.includes('outside'));
 if(!entry)throw Error('Missing traced entrance for '+code);
 const e=entry.center||midpoint(entry.a,entry.b);
 let outward=normal(entry.a,entry.b);
 if(insidePolygon(move(e,outward,.45),geometry.outline))outward=outward.map(n=>-n);
 const cores=scene.wings[wing].footprints.slice(-2);
 const nearest=cores.map(([a,b,c,d])=>[clamp(center[0],a,c),clamp(center[1],b,d)])
   .sort((a,b)=>distance(a,center)-distance(b,center))[0];
 const core=[nearest[0]-center[0],nearest[1]-center[1]];
 const turns=[0,1,2,3].map(i=>{
   const yaw=i*Math.PI/2,c=Math.cos(yaw),s=Math.sin(yaw);
   return {yaw,score:dot([c*outward[0]+s*outward[1],-s*outward[0]+c*outward[1]],core)};
 }).sort((a,b)=>b.score-a.score);
 const {yaw}=turns[0];
 const cosine=Math.cos(yaw), sine=Math.sin(yaw);
 const rotate=([x,z])=>[cosine*x+sine*z,cosine*z-sine*x];
 const neighbors=neighborVolumes.filter(box=>box.some((value,index)=>value!==scene.designFootprints[code][index]));
 function railingClearance(anchor){
   const local=[anchor.position[0]-localCenter[0],anchor.position[2]-localCenter[1]];
   const offset=rotate(local);
   const position=[center[0]+offset[0],center[1]+offset[1]];
   const direction=rotate([anchor.outward[0],anchor.outward[2]]);
   for(let depth=.5;depth<=30;depth+=.5){
     const [x,z]=move(position,direction,depth);
     if(neighbors.some(([left,front,right,back])=>x>=left&&x<=right&&z>=front&&z<=back))return depth;
   }
   return 30;
 }
 const floors=templates.flatMap(t=>t.layouts.includes(code)?t.levels.map(floor=>({floor,
    elevation: +(scene.floorBase+(floor-1)*scene.floorHeight).toFixed(3),template:t.id,page:t.sourcePage})):[]);
 const anchors=[];
 function anchor(id,kind,a,b,width,height,sill,related=[]){
   if(distance(a,b)<.01)return;
   const center=midpoint(a,b),n=normal(a,b);
   for(const side of [n,n.map(v=>-v)]){
    const rooms=geometry.rooms.filter(room=>{
      const deck=/deck|balcony/i.test(room.label);
      return (kind==='balcony'?deck:!deck)&&(kind!=='window'||!related.length||related.includes(room.id))&&
        [.19,.38,.63].some(d=>insidePolygon(move(center,side,d),room.polygon));
    });
    for(const room of rooms){
     const outward=side.map(v=>-v);
     const candidate=[];
     const tangent=[side[1],-side[0]];
     for(const setback of [.56,.8,1.04,1.32,1.65,2.1,2.6])
       for(const shift of [0,.28,-.28,.55,-.55,1,-1]){
         const p=move(move(center,side,setback),tangent,shift);
         if(!insidePolygon(p,room.polygon)||!navigator.canStand(...p))continue;
         const eye=[p[0],1.57,p[1]];
         if([...navigator.nodes.values()].some(v=>v.room_id===room.id&&navigator.lineClear(v.position,eye)))candidate.push(eye);
       }
     if(!candidate.length&&kind==='window'){
       for(const node of navigator.nodes.values()){
         const eye=node.position;
         const p=[eye[0],eye[2]];
         if(node.room_id!==room.id||!insidePolygon(p,room.polygon)||!navigator.canStand(...p))continue;
         const offset=[p[0]-center[0],p[1]-center[1]];
         if(dot(offset,side)>.25 && Math.abs(dot(offset,tangent))<dot(offset,side)*1.55)
           candidate.push([eye[0],eye[1],eye[2]]);
       }
     }
     anchors.push({id:code+'-'+id+'-'+room.id,layout:code,opening:id,kind,room:room.id,position:[center[0],sill+height/2,center[1]],
        outward:[outward[0],0,outward[1]], eye:candidate[0]||null, candidates:candidate.slice(0,8),
        target:[center[0]+outward[0]*8,1.35,center[1]+outward[1]*8],
        width,height,sill, facadeOpening:null,sourcePage:geometry.source_pdf_page,
        status:'Brochure trace · exterior opening correspondence unverified'});
    }
   }
 }
 for(const o of geometry.openings)if(o.type==='window'||(o.type==='sliding_door'&&o.connects.some(r=>/deck|balcony/.test(r))))
   anchor(o.id,'window',o.a,o.b,o.width_m,o.height_m,o.sill_m,o.connects);
 for(const [i,r] of geometry.railings.entries())anchor(r.id||'rail-'+i,'balcony',r.a,r.b,distance(r.a,r.b),r.height_m,0);
 anchors.sort((a,b)=>a.kind==='balcony'&&b.kind==='balcony'
   ?railingClearance(b)-railingClearance(a)||b.width-a.width:0);
 placements[code]={code,wing,yaw,scale:1,center,localCenter,entry:e,localBounds:[min,max],footprint:[x0,z0,x1,z1],
   floors,anchors,status:'Conceptual rigid registration to brochure bay'};
}
await writeFile(new URL('data/apartment-spatial.json',dist),JSON.stringify({units:'metres',axis:'Y up',placements})+'\n');
