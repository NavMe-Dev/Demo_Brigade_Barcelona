// All plan, legend and eye-level selections share the same source marker record.
import {readJSON} from './project-data.js';
const data=()=>readJSON('assets/amenity-plans.json');
function node(tag,text,cls){
  const e=document.createElement(tag);
  if(text!==undefined)e.textContent=text;
  if(cls)e.className=cls;
  return e;
}
function button(label,fn,cls){
  const b=node('button',label,cls);b.type='button';b.addEventListener('click',fn);return b;
}
function nearestLocation(feature,previous){
  if(!previous)return 0;
  let shortest=Infinity,index=0;
  feature.locations.forEach(({world},i)=>{const d=Math.hypot(world[0]-previous[0],world[2]-previous[2]);if(d<shortest){index=i;shortest=d;}});
  return index;
}
function view(feature,section,index,eye){
  const [x,y,z]=feature.locations[index].world;
  const indoors=section.id==='clubhouse'&&feature.number!==15&&feature.number!==16;
  const rooftop=section.id==='sky-deck',eco=section.id==='eco-deck';
  let position,target;
  if(indoors&&feature.positionStatus?.startsWith('individual')){
    position=[70,22,88];target=[41,10,42];
  }else if(eye){
    // Center the eyes at 1.62 m in the open deck level, close to its selected feature.
    const offset=eco?1.8:3.4;
    position=[x+offset,y+1.62,z+offset];target=[x,y+1.18,z];
  }else if(eco){
    // Observe from the same open gallery to avoid an intervening residential floor.
    const sign=x<0?-1:1;position=[x+sign*6.6,y+3.25,z+5.5];target=[x,y+.35,z];
  }else{
    const d=rooftop?14:section.id==='clubhouse'?23:18;
    position=[x+d*.78,y+d*.96,z+d];target=[x,y+.4,z];
  }
  return {id:feature.id,section:section.id,target,position,eyeLevel:eye};
}
export async function mountAmenityPlan(container,options={}){
  if(!document.querySelector('link[data-amenity-plan]')){
    const link=node('link');link.rel='stylesheet';link.href=new URL('./amenity-plan.css',import.meta.url).href;link.dataset.amenityPlan='';document.head.append(link);
  }
  const catalog=await data();
  let section=catalog.sections.find(s=>s.id===options.section)||catalog.sections[0];
  let selected=section.features.find(f=>f.id===options.selectedId)||null,occurrence=0,eye=false,tour=false,timer=0,dead=false,modal;
  let walked=null,turn=0;
  const root=node('div',undefined,'amenity-atlas');container.append(root);
  function stop(){tour=false;clearTimeout(timer);timer=0;}
  function focus(){
    if(!selected)return;
    options.onFocus?.(view(selected,section,occurrence,eye));
  }
  function select(id,{focus:move=true,location,notify=true}={}){
    if(dead)return false;walked=null;turn=0;
    const next=catalog.sections.find(s=>s.features.some(f=>f.id===id));if(!next)return false;
    const old=selected?.locations[occurrence]?.world;
    if(next!==section){section=next;eye=false;stop();options.onSectionChange?.(section.id);}
    selected=section.features.find(f=>f.id===id);
    occurrence=(Number.isInteger(location)&&selected.locations[location])?location:nearestLocation(selected,old);
    paint();
    if(modal?.open){const plate=modal.querySelector('.amenity-plate');if(plate)plate.replaceWith(plateView(true));}
    if(move)focus();
    if(notify)options.onChange?.({section:section.id,id,location:occurrence});
    return true;
  }
  function walk(step,angle){
    stop();eye=true;
    const route=section.walkRoute;if(!route?.length)return;
    const samples=[];
    for(let i=0;i<route.length;i++){
      const a=route[i],b=route[(i+1)%route.length];
      const count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/1.2));
      for(let k=0;k<count;k++)samples.push(a.map((v,j)=>v+(b[j]-v)*k/count));
    }
    if(walked===null){
      const a=selected?.locations[occurrence]?.world||samples[0];
      walked=samples.reduce((best,v,i)=>Math.hypot(v[0]-a[0],v[2]-a[2])<Math.hypot(samples[best][0]-a[0],samples[best][2]-a[2])?i:best,0);
    }
    walked=(walked+step+samples.length)%samples.length;turn+=angle;
    const a=samples[walked],b=samples[(walked+1)%samples.length];
    const heading=Math.atan2(b[0]-a[0],b[2]-a[2])+turn;
    const position=[a[0],a[1]+1.62,a[2]];
    const target=[a[0]+4*Math.sin(heading),a[1]+1.57,a[2]+4*Math.cos(heading)];
    const near=section.features.flatMap(f=>f.locations.map((loc,i)=>({f,i,d:Math.hypot(loc.world[0]-a[0],loc.world[2]-a[2])}))).sort((a,b)=>a.d-b.d)[0];
    selected=near.f;occurrence=near.i;
    options.onFocus?.({id:selected.id,section:section.id,position,target,eyeLevel:true,walk:true});
    options.onChange?.({id:selected.id,section:section.id,location:occurrence});paint();
  }
  function goSection(id){
    if(dead)return;
    const next=catalog.sections.find(s=>s.id===id);if(!next||next===section)return;
    stop();walked=null;turn=0;section=next;selected=null;occurrence=0;eye=false;options.onSectionChange?.(id);paint();
  }
  function plateView(large=false){
    const plate=node('div',undefined,'amenity-plate');
    const image=node('img');image.src=section.plan;image.alt=section.title+' source drawing, brochure page '+section.sourcePage;image.draggable=false;plate.append(image);
    for(const f of section.features)f.locations.forEach(({uv},i)=>{
      if(!uv)return;
      const pin=button(String(f.number),()=>{stop();select(f.id,{location:i});},'amenity-point');
      const active=f===selected&&i===occurrence;
      pin.setAttribute('aria-label',f.number+'. '+f.name+(f.locations.length>1?' · position '+(i+1):''));
      pin.title=f.name;pin.setAttribute('aria-pressed',String(active));
      pin.style.left=(uv[0]*100)+'%';pin.style.top=(uv[1]*100)+'%';
      if(!large&&!active)pin.tabIndex=-1;
      plate.append(pin);
    });
    return plate;
  }
  function expand(){
    modal=node('dialog',undefined,'building-plan-dialog');const head=node('div');head.append(node('h2',section.title),button('Close',()=>modal.close()));
    modal.append(head,plateView(true));root.append(modal);modal.addEventListener('close',()=>{modal.remove();modal=null;},{once:true});modal.showModal();
  }
  function nextTour(){
    if(!tour||dead)return;
    const route=section.id==='eco-deck'?[1,9,10,16,17,12]:section.id==='sky-deck'?[1,2,5,7,13,15]:[1,6,9,12,16,20,11];
    const idx=route.indexOf(selected?.number);
    if(idx===route.length-1){stop();paint();return;}
    const f=section.features.find(f=>f.number===route[idx+1]);select(f.id);
    timer=setTimeout(nextTour,matchMedia('(prefers-reduced-motion:reduce)').matches?4200:5200);
  }
  function paint(){
    if(dead)return;
    // Keep an expanded plate mounted during selection inside its native dialog.
    for(const child of [...root.children])if(child!==modal)child.remove();
    const controls=node('div',undefined,'amenity-tablist');controls.setAttribute('aria-label','Explore amenity levels');
    for(const s of catalog.sections){
      const b=button(s.id==='clubhouse'?'Clubhouse':s.title,()=>goSection(s.id));
      b.setAttribute('aria-pressed',String(section===s));controls.append(b);
    }
    root.append(controls);
    if(section.plan){
      const frame=node('div',undefined,'amenity-map-frame');frame.append(plateView(),button('Expand plan',expand,'amenity-expand'));root.append(frame);
    }else{
      const image=node('img',undefined,'amenity-club-art');image.src=section.image;image.alt='Clubhouse roof pool, brochure artist’s impression';root.append(image);
    }
    const id='amenity-legend-'+section.id,lab=node('label',section.plan?'Plan legend':'Clubhouse amenities');
    const picker=node('select');lab.htmlFor=id;picker.id=id;
    picker.add(new Option('Choose a feature',''));
    for(const f of section.features)picker.add(new Option((f.number?String(f.number).padStart(2,'0')+' · ':'')+f.name,f.id));
    picker.value=selected?.id||'';picker.onchange=()=>{stop();if(picker.value)select(picker.value);};root.append(lab,picker);
    if(selected){
      const caption=node('p',undefined,'amenity-feature-title');caption.setAttribute('aria-live','polite');caption.textContent=selected.name;root.append(caption);
      if(selected.locations.length>1){
        const points=node('div',undefined,'amenity-tablist');
        selected.locations.forEach((_,i)=>{const b=button('Position '+(i+1),()=>{stop();select(selected.id,{location:i});});b.setAttribute('aria-pressed',String(i===occurrence));points.append(b);});
        root.append(points);
      }
    }
    const actions=node('div',undefined,'amenity-actions');
    if(section.plan){
      const human=button(eye?'Aerial view':'Eye-level view',()=>{stop();eye=!eye;if(!selected){select(section.features[0].id);}else{focus();paint();}});actions.append(human);
      actions.append(button(tour?'Stop tour':'Guided tour',()=>{
        if(tour){stop();paint();return;}selected=null;eye=section.id!=='masterplan';tour=true;nextTour();
      }));
      if(section.id==='sky-deck'&&options.onLighting)actions.append(button('Sunset',()=>options.onLighting('sunset')));
    }else if(selected){
      if(selected.positionStatus?.startsWith('individual')){
        actions.append(button('View room study',async()=>{const {inspectClubStudy}=await import('./club-study.js');if(!dead)inspectClubStudy(root,selected);}));
      }else actions.append(button('Pool deck view',()=>{eye=true;focus();}));
    }
    root.append(actions);
    if(eye&&section.walkRoute?.length){
      const nav=node('div',undefined,'amenity-walk');nav.setAttribute('role','group');nav.setAttribute('aria-label','Walk along the landscape path');
      for(const [label,step,angle] of [['Turn left',0,-Math.PI/6],['Step back',-2,0],['Step forward',2,0],['Turn right',0,Math.PI/6]]){
        nav.append(button(label,()=>walk(step,angle)));
      }
      root.append(nav);
    }
    const notes=section.plan?'Marked positions follow brochure page '+section.sourcePage+'. Heights and finishes are illustrative.':
      selected?.activities?selected.activities.join(' · ')+'. Individual rooms have no published floor assignment.':
      selected?.spaceProvisioned?'The brochure identifies this as provisioned space. Its level is unconfirmed.':'Facilities are listed on page 13. The rooftop pool is pictured on page 12. Other room locations are unconfirmed.';
    root.append(node('p',notes+(section.id==='sky-deck'?' Skyline views are simulated.':''),'amenity-source-note'));
  }
  paint();
  return {select,setSection:goSection,destroy(){stop();dead=true;modal?.close();root.querySelectorAll('dialog').forEach(d=>d.close());root.remove();}};
}
