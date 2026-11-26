import * as site from './estate-scene.js';
import {geoCredits} from './geo-world.js';
import {preloadInterior,enterInterior,leaveInterior,openInteriorPlan} from './app.js';
import {getProject,readJSON,designsOnFloor,compareIds} from './project-data.js';
import {defaultFilters,mountFilters,mountCompare,modelCard,configuration} from './residences.js';
import {lightingModes} from './solar.js';
import {mountFloorPlate} from './floor-plate.js';
const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => {
  const item = document.createElement(tag);
  if (text != null) item.textContent = text;
  if (cls) item.className = cls;
  return item;
};
const action = (text, onClick, cls = '') => {
  const b = el('button', text, cls);
  b.type = 'button';
  b.onclick = onClick;
  return b;
};
const pathIcons = {
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M20 15a8.5 8.5 0 0 1-11-11 8.8 8.8 0 1 0 11 11Z',
  skip: 'm5 5 10 7-10 7V5Zm13 0v14',
  reset: 'M4 9a8 8 0 1 1-.4 5M4 4v5h5',
  plus: 'M5 12h14M12 5v14',
  minus: 'M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
};
function icons(scope = document) {
  for (const i of scope.querySelectorAll('[data-icon]'))
    i.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + pathIcons[i.dataset.icon] + '"/></svg>';
}
icons();
const names={overview:'Explore',masterplan:'Masterplan',towers:'Building',apartments:'Apartments',amenities:'Amenities',location:'Location',compare:'Compare',interiors:'Interiors',tour:'Guided tour',enquire:'Enquire'};
const amenityNames={'eco-deck':'Eco Deck','sky-deck':'Sky Deck',clubhouse:'Clubhouse'};
const shell=$('estatePanel'),content=$('estatePanelContent'),detail=$('layoutInfo');
const small=()=>innerWidth<=680;
const isInside=()=>document.body.classList.contains('exploring');
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let introPlaying=false,cityPlaying=false,featuresVisible=false;
let project,section='overview',wing=null,floor=null,selected='A3',mood='day',amenity='eco-deck',cameraView='aerial';
let queuedSection=null,live=false,regional=false,job=0,panelVersion=0,planWidget,detailOpen=false,returnSection='apartments',pendingNav=null,skip=false;
const exteriorViews = [
 ['aerial','Aerial masterplan'], ['front','Hero exterior'], ['rear','Rear façade'],
 ['crown','Roofline and signage'], ['balcony','Balcony detail'], ['podium','Podium'],
 ['street','Street level'], ['entrance','Main entrance'],
];
let saved=[],compared=[],filters=defaultFilters(),toastId=0,collectionMeta={},previewImages={};
function loadIds(key){try{const v=JSON.parse(localStorage.getItem(key));return Array.isArray(v)?v:[];}catch{return [];}}
function store(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
function notice(message){const t=$('toast'),id=++toastId;t.textContent=message;t.classList.add('show');setTimeout(()=>{if(id===toastId)t.classList.remove('show');},3500);}
function current(){return project?.layouts.find(a=>a.code===selected);}
function validFloor(value){return project.templates.some(t=>t.levels.includes(Number(value)))?Number(value):null;}
function query(push=false){
 if(isInside())return;
 const q=new URLSearchParams();
 if(cityPlaying)q.set('scene','journey');else if(section!=='overview')q.set('scene',section);
 if(wing&&['towers','apartments'].includes(section))q.set('wing',wing);
 if(floor&&['towers','apartments'].includes(section))q.set('floor',floor);
 if(section==='apartments'&&selected)q.set('design',selected);
 if(section==='amenities')q.set('amenity',amenity);
 if(mood!=='day')q.set('light',mood);
 const url=location.pathname+(q.size?'?'+q:'');
 if(url!==location.pathname+location.search)history[push?'pushState':'replaceState'](null,'',url);
}
function showExteriorStatus(){
 if(live)$('estateStatus').textContent=cityPlaying?'Hyderabad to Plot 20':introPlaying?'Cinematic introduction':'Live 3D · Concept exterior';
}
function syncIntroControl(){
 const control=$('introControl');
 control.hidden=!live||section!=='overview'||reduced();
 control.title=control.ariaLabel=introPlaying?'Skip introduction':'Replay introduction';
 control.querySelector('.intro-label').textContent=introPlaying?'Skip intro':'Replay intro';
 control.firstElementChild.dataset.icon=introPlaying?'skip':'reset';
 icons(control);
}
function setIntroPlaying(playing){
 introPlaying=playing;syncIntroControl();showExteriorStatus();
}
function setMood(value,write=true){
 mood=lightingModes.includes(value)?value:'day';site.setMood(mood);
 $('estateLight').dataset.mood=mood;$('estateLight').title=$('estateLight').ariaLabel='Time of day · '+mood;
 $('estateLight').firstElementChild.dataset.icon=mood==='evening'?'moon':'sun';icons($('estateLight'));
 for(const b of $('estateMoods').children)b.setAttribute('aria-pressed',String(b.dataset.mood===mood));
 if(isInside())document.querySelector('#lightingModes [data-light="'+mood+'"]')?.click();if(write)query();
}
function panelVisible(open){
 shell.hidden=!open;$('reopenPanel').hidden=open||section==='overview';$('reopenPanel').lastElementChild.textContent=names[section];
 site.setSection(section,amenity);
}
function detailsVisible(open){
 detailOpen=Boolean(open&&section==='apartments'&&selected);detail.hidden=!detailOpen;
 $('showLayout').hidden=section!=='apartments'||detailOpen||!selected;
 if(detailOpen&&small()){shell.hidden=true;$('reopenPanel').hidden=true;}
}
function p(text,cls='panel-copy'){content.append(el('p',text,cls));}
function rows(pairs){const list=el('div',null,'panel-row-list');for(const [text,cb] of pairs){const b=action(text,cb);b.ariaLabel=text;list.append(b);}content.append(list);}
function choices(label,pairs,active,cb){content.append(el('p',label,'panel-label'));const g=el('div',null,'choice-grid');g.setAttribute('role','group');g.ariaLabel=label;for(const [key,name] of pairs){const b=action(name,()=>cb(key));b.setAttribute('aria-pressed',String(key===active));g.append(b);}content.append(g);}
function showSheet(title,src){
 const d=el('dialog',null,'estate-plan-dialog');const h=el('div',null,'panel-top');h.append(el('h2',title),action('Close',()=>d.close(),'sheet-close'));
 const im=el('img');im.src=src;im.alt=title;d.append(h,im);document.body.append(d);d.onclose=()=>d.remove();d.showModal();
}
function save(code){
 saved=loadIds('brigade-designs');const has=saved.includes(code);saved=has?saved.filter(id=>id!==code):[...saved,code];store('brigade-designs',saved);
 if(code==='A3')store('brigade-a3-saved',!has);refreshDetails();notice(has?'Apartment removed from saved designs.':'Apartment saved on this device.');
}
function compare(code){
 const included=compared.includes(code);
 if(!included&&compared.length>=3){notice('Your comparison has three designs. Remove one to add another.');return;}
 compared=included?compared.filter(id=>id!==code):[...compared,code];store('brigade-compare',compared);
 if(section==='compare')renderPanel();else refreshDetails();
 if(!included)notice('Design '+code+' added to Compare.');
}
function refreshDetails(){
 const a=current();if(section!=='apartments'||!a){detail.hidden=true;return;}
 modelCard(detail,a,{saved,compared,floor,onSave:save,onCompare:compare,onEnter:openDesign,onViewPlan:v=>showSheet('Wing '+v.wing+' · '+v.code,v.plan),
 onBuilding:()=>navigate('towers'),onClose:()=>{detailsVisible(false);if(small())panelVisible(true);}});
}
function pickDesign(code,openDetails=true){
 const a=project.layouts.find(x=>x.code===code);if(!a)return;
 if(floor&&!designsOnFloor(project,floor).some(x=>x.code===code)){notice('This bay is a refuge area on floor 12.');return;}
 selected=code;wing=a.wing;site.highlight(wing,floor,selected);
 if(section==='apartments'){refreshDetails();if(openDetails)detailsVisible(true);if(floor)site.focusDesign(code,floor);query();}
 else{filters={...defaultFilters(),wings:[wing],floors:floor?[floor]:[]};navigate('apartments');if(openDetails)detailsVisible(true);}
}
function pickWing(id){wing=id;floor=null;selected=id==='A'?'A3':'B8';filters={...defaultFilters(),wings:[id]};navigate('towers');}
function pickFloor(id,n){wing=id;floor=validFloor(n);if(!floor){notice('The floor-specific layout is awaiting confirmation.');return;}if(floor===12&&selected==='A7')selected='A3';
 filters={...defaultFilters(),wings:[wing],floors:[floor]};section='towers';panelVisible(true);renderPanel();site.highlight(wing,floor);site.focusFloor(wing,floor);query();}
function areaPlan(){
 const plate=project.templates.find(t=>t.levels.includes(floor));if(!plate)return;
 mountFloorPlate(content,{floor,wing,template:plate,onSelect:code=>pickDesign(code),onEnlarge:src=>showSheet('Floor '+floor+' · '+plate.id,src)});
}
function unitsOnFloor(){
 const g=el('div',null,'choice-grid unit-chips');const units=designsOnFloor(project,floor).filter(a=>a.wing===wing);
 for(const a of units)g.append(action(a.code,()=>pickDesign(a.code)));
 content.append(el('p',floor?'Apartments on this plate':'Wing designs','panel-label'),g);
}
let selectedFeature,regionalMap;
async function panelPlan(id,token){
 const holder=el('div',null,'amenity-host');content.append(holder);
 try{const {mountAmenityPlan}=await import('./amenity-plan.js');if(token!==panelVersion)return;
 const widget=await mountAmenityPlan(holder,{section:id,selectedId:selectedFeature,onFocus:cue=>{if(token!==panelVersion)return;selectedFeature=cue.id;site.authorView(cue.position,cue.target,cue.eyeLevel);},onLighting:value=>setMood(value),onSectionChange:newId=>{
   if(newId==='masterplan'){if(section!=='masterplan')navigate('masterplan');}
   else if(amenityNames[newId]&&(section!=='amenities'||amenity!==newId)){amenity=newId;navigate('amenities');}
 }});
 if(token!==panelVersion){widget?.destroy();return;}planWidget=widget;
 }catch(error){if(token===panelVersion){console.warn(error);holder.textContent='The plan could not be loaded.';}}
}
function finishCity(){
 cityPlaying=false;$('cityFlightHud').hidden=true;showExteriorStatus();syncIntroControl();
 document.body.classList.remove('city-flight');
}
function landAtBuilding(){
 navigate('overview',{push:false,motion:false});
 if(reduced())site.goView('landing',0);else site.playIntroduction();
}
async function startCity(push=true){
 navigate('overview',{push:false,motion:false,write:false});
 if(!live)return;
 const token=job;cityPlaying=true;query(push);document.body.classList.add('city-flight');
 $('cityFlightHud').hidden=false;$('cityFlightStage').textContent='Preparing Hyderabad';showExteriorStatus();
 try{await site.playCityFlight(()=>cityPlaying&&token===job,landAtBuilding);}
 catch{if(token===job){finishCity();landAtBuilding();notice('The regional terrain could not load. Showing Plot 20.');}}
}
$('skipCityFlight').onclick=landAtBuilding;
$('neighborhoodReturn').onclick=()=>navigate('location');
function showImagerySource(){
 const node=$('locationImagery');if(!node)return;
 const imagery=site.sceneMetrics()?.gis?.imagery;
 const source=imagery?.provider==='arcgis'?'Esri World Imagery':'Copernicus Sentinel-2 · 10 m near the site';
 node.textContent=regional?'Regional imagery · Copernicus Sentinel-2':'Satellite imagery · '+source;
}
addEventListener('brigade:geo-change',showImagerySource);
function locationPanel(){
 $('estatePanelTitle').textContent='Neopolis, Kokapet';p(project.location.address);
 const flightButton=action('Fly from Hyderabad',()=>startCity(),'estate-action');flightButton.id='cityFlight';content.append(flightButton);
 choices('Geographic view',[['terrain','3D terrain'],['map','Regional map']],regional?'map':'terrain',key=>{regional=key==='map';renderPanel();if(regional)showRegion();else{regionalMap?.hideMap();site.activate(true);showExteriorStatus();site.goView('location');}});
 if(!regional){
   const toggle=action('Mapped roads, paths and land use',()=>{featuresVisible=!featuresVisible;site.mapFeatures(featuresVisible);toggle.setAttribute('aria-pressed',String(featuresVisible));});
   toggle.className='map-features';toggle.setAttribute('aria-pressed',String(featuresVisible));content.append(toggle);
   rows([['Orbit building 360°',()=>site.orbitBuilding()],['Street-level inspection',()=>site.goView('street')]]);
 }
 rows(project.landmarks.map(l=>[l.name,()=>{if(regional)regionalMap?.locateLocal(l.point);else site.authorView([l.point[0]+180,l.point[1]+155,l.point[2]+200],l.point); }]));
 p('The plot boundary follows HMDA’s 16 published survey points. Tower siting and neighboring building heights are approximate.','panel-note');
 const source=el('p',null,'panel-note');source.id='locationImagery';content.append(source);showImagerySource();
 p('Neighboring buildings follow mapped footprints. Most heights are estimated.','panel-note');
}
async function showRegion(){
 const token=job;
 try{
   regionalMap=await import('./regional-map.js');
   if(token!==job||!regional)return;
   site.activate(false);await regionalMap.openRegion(project.location,()=>navigate('towers'));
   if(token===job&&regional){$('estateStatus').textContent='Regional satellite map · Sentinel-2';geoCredits($('geoCredits'));}
 }catch{
   if(token!==job||!regional)return;
   regional=false;regionalMap?.hideMap();site.activate(true);notice('Use the 3D terrain to explore the neighborhood.');renderPanel();
 }
}
function renderPanel(){
 if(!project)return;const token=++panelVersion;planWidget?.destroy();planWidget=null;
 content.replaceChildren();shell.scrollTop=0;$('estatePanelTitle').textContent=names[section];$('estatePanelKicker').textContent='Brigade Barcelona';
 $('experienceDock').hidden=section==='overview';if(section!=='apartments'){detailsVisible(false);$('showLayout').hidden=true;}
 if(section==='towers'){
  $('estatePanelTitle').textContent=wing?'Wing '+wing:'The building';
  choices('Select a wing',[['A','Wing A'],['B','Wing B']],wing,pickWing);
  if(!wing){p('Choose either wing on the model to inspect its floor plates.');rows([['Aerial view',()=>site.goView('aerial')],['Orbit building 360°',()=>site.orbitBuilding()],['Street-level view',()=>site.goView('street')],['Main entrance',()=>site.goView('entrance')]]);return;}
  const scroll=el('div',null,'floor-rail');scroll.ariaLabel='Documented floor levels';const floors=project.templates.flatMap(t=>t.levels).sort((a,b)=>b-a);
  for(const n of floors){const b=action('',()=>pickFloor(wing,n));b.ariaLabel='Floor '+n;b.setAttribute('aria-pressed',String(n===floor));b.append(el('strong',String(n)),el('span',n===12?'Refuge plate':'Typical plate'));scroll.append(b);}
  content.append(el('p','Select a documented floor','panel-label'),scroll);
  areaPlan();unitsOnFloor();p('Other floor-specific arrangements await confirmation. Displayed elevations are illustrative.','panel-note');
  content.append(action('Browse Wing '+wing+' designs',()=>navigate('apartments'),'estate-action'));
 }else if(section==='apartments'){
  $('estatePanelKicker').textContent='Residence collection';
  let mounting=true;mountFilters(content,{project,filters,selected,onResults:a=>{
    selected=a?.code||null;wing=filters.wings.length===1?filters.wings[0]:null;floor=filters.floors.length===1?filters.floors[0]:null;
    refreshDetails();detailsVisible(Boolean(a)&&(!small()||detailOpen));site.highlight(a?.wing||wing,floor,selected);if(!mounting)query();
  },onChoose:a=>pickDesign(a.code)});mounting=false;
 }else if(section==='compare'){
   mountCompare(content,{project,ids:compared,onToggle:compare,onOpen:openDesign,onPlan:a=>showSheet('Design '+a.code,a.plan),balconies:collectionMeta,previews:previewImages});
 }else if(section==='amenities'){
  $('estatePanelTitle').textContent=amenityNames[amenity];$('estatePanelKicker').textContent='Amenities';
  const views=amenity==='clubhouse'?[['clubhouse','Clubhouse exterior'],['pool','Rooftop pool']]:
    amenity==='sky-deck'?[['sky','Sky Deck overview'],['skyGarden','Sky Deck garden']]:
    [['eco','Eco Deck overview'],['ecoGarden','Eco Deck fire garden']];
  rows(views.map(([key,label])=>[label,()=>site.goView(key)]));
  panelPlan(amenity,token);
 }else if(section==='masterplan'){
  choices('Viewpoint',exteriorViews,cameraView,key=>{cameraView=key;site.goView(key);renderPanel();});
  rows([['Select a wing',()=>navigate('towers')]]);
  let touring=false;
  const tour=action('Architectural flythrough',async()=>{
    if(touring){site.stopIntroduction();return;}
    touring=true;tour.textContent='Stop flythrough';
    await site.tourArchitecture();
    touring=false;tour.textContent='Architectural flythrough';
  },'estate-action');
  content.append(tour);
  panelPlan('masterplan',token);
 }else if(section==='location')locationPanel();
}
function askEnquiry(){
 const a=current();$('enquiryForm').dataset.layout=a?.code||'A3';document.querySelector('[data-enquiry-layout]').textContent=a?'Design '+a.code+' · Wing '+a.wing:'Brigade Barcelona';$('enquiryDialog').showModal();
}
function sectionCamera(duration){
 if(['towers','apartments'].includes(section)&&wing)return floor?site.focusFloor(wing,floor,duration):site.focusWing(wing,duration);
 const key=section==='amenities'?({'eco-deck':'eco','sky-deck':'sky',clubhouse:'clubhouse'})[amenity]:({overview:'overview',masterplan:cameraView,location:'location'})[section]||'aerial';
 return site.goView(key,duration);
}
function navigate(next,{push=true,motion=true,write=true}={}){
 if(!project){queuedSection=next;return;}if(!names[next])next='overview';$('estateNavDialog').close();$('lightingSheet').hidden=true;
 if(cityPlaying)finishCity();site.stopIntroduction();
 if(next==='enquire'){askEnquiry();return;}
 if(['tour','interiors'].includes(next)){openDesign(selected||'A3',next==='tour'?'tour':'walk');return;}
 if(isInside()){pendingNav={next,push};leaveInterior({cinematic:true});return;}
 ++job;$('skipApproach').hidden=true;$('sceneDissolve').classList.remove('active');regionalMap?.hideMap();regional=false;section=next;syncIntroControl();showExteriorStatus();
 document.body.classList.toggle('estate-detail',next!=='overview');document.body.dataset.section=section;
 for(const b of document.querySelectorAll('.estate-nav button')){if(b.dataset.section===section)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
 if(next==='apartments'&&wing&&!filters.wings.length)filters.wings=[wing];
 site.activate(true);if(next!=='location'){featuresVisible=false;site.mapFeatures(false);}panelVisible(next!=='overview');detailOpen=!small();renderPanel();
 site.highlight(['towers','apartments'].includes(next)?(wing||current()?.wing):null,floor,next==='apartments'?selected:null);
 if(live&&motion)sectionCamera();if(write)query(push);
}
async function openDesign(code,view='walk',room=null,{push=true}={}){
 const a=project?.layouts.find(item=>item.code===code);if(!a)return;
 if(isInside()&&current()?.code===code){if(view==='tour')$('tourButton').click();else $(view==='dollhouse'?'dollhouseButton':'walkButton').click();return;}
 const token=++job;if(cityPlaying)finishCity();site.stopIntroduction();regionalMap?.hideMap();site.activate(true);returnSection=['apartments','towers','compare'].includes(section)?section:'apartments';
 selected=code;if(wing&&wing!==a.wing)floor=null;wing=a.wing;skip=false;$('skipApproach').hidden=reduced();
 $('estateStatus').textContent='Preparing residence '+code;
 try{
  await preloadInterior(code);if(token!==job)return;
  site.highlight(wing,floor,code);
  if(!skip&&live){await site.focusWing(wing,460);if(token!==job)return;if(floor&&!skip)await site.focusDesign(code,floor,650);}
  if(token!==job)return;
  const veil=$('sceneDissolve');if(!reduced()&&!skip){veil.classList.add('active');await delay(260);}
  if(token!==job)return;
  const q=new URLSearchParams();q.set('layout',code);if(floor)q.set('floor',floor);if(room)q.set('room',room);if(mood!=='day')q.set('light',mood);
  if(view==='dollhouse')q.set('view','dollhouse');
  history[push?'pushState':'replaceState'](null,'',location.pathname+'?'+q);
  await enterInterior({design:code,room,floor,cinematic:view==='walk'&&!skip,lighting:mood});
  if(skip&&view==='walk')$('walkButton').click();
  if(view==='tour')$('tourButton').click();
 }catch(error){if(job===token){console.warn(error);notice('Residence '+code+' could not be loaded. Select it again to retry.');}}
 finally{if(job===token){$('skipApproach').hidden=true;$('sceneDissolve').classList.remove('active');showExteriorStatus();}}
}
async function route(q,initial=false){
 const shared=q.get('layout'),legacy=q.get('design'),room=q.get('room'),view=q.get('view');
 const code=shared||legacy||'A3';const design=project.layouts.find(a=>a.code===code);
 const requestedWing=q.get('wing');wing=['A','B'].includes(requestedWing)?requestedWing:design&&shared?design.wing:null;
 floor=validFloor(q.get('floor'));if(floor&&!wing)wing=design?.wing||'A';filters=defaultFilters();if(wing)filters.wings=[wing];if(floor)filters.floors=[floor];
 selected=design?.code||(wing==='B'?'B8':'A3');if(wing&&selected[0]!==wing)selected=wing==='A'?'A3':'B8';
 const key=q.get('amenity');amenity=amenityNames[key]?key:({sky:'sky-deck',gardens:'eco-deck'})[key]||'eco-deck';
 setMood(q.get('light')==='daylight'?'day':q.get('light')||'day',false);
 const invalid=(shared||legacy)&&!design;if(invalid)notice('That design could not be found. Browse the brochure collection.');
 let next=invalid?'apartments':q.get('scene')||(key?'amenities':requestedWing?'towers':'overview');
 if((shared||view==='walk'||view==='dollhouse')&&!invalid){next='apartments';filters.wings=[design.wing];}
 if(next==='journey'){await startCity(false);return;}
 navigate(next,{push:false,motion:false});
 if((shared||view==='walk'||view==='dollhouse')&&!invalid){if(floor===12&&code==='A7'){notice('A7 is replaced by a refuge area on this floor.');return;}await openDesign(code,view==='dollhouse'?'dollhouse':'walk',room,{push:false});}
 else if(live){
   if(section!=='overview')sectionCamera(initial?0:undefined);
   else if(initial&&!reduced())site.playIntroduction();
   else site.goView(reduced()?'landing':'overview',0);
 }
}
$('introControl').onclick=()=>{if(introPlaying)site.goView('overview',0);else site.playIntroduction();};
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>{
 if(reduced()&&cityPlaying)landAtBuilding();else if(reduced())site.stopIntroduction();
 syncIntroControl();
});
$('estateMenu').onclick=()=>$('estateNavDialog').showModal();
for(const [key,name] of Object.entries(names))$('estateNavDialog').querySelector('nav').append(action(name,()=>navigate(key)));
$('previewInfo').onclick=()=>{$('estateNavDialog').close();$('aboutDialog').showModal();};
for(const b of document.querySelectorAll('[data-section]'))b.onclick=()=>navigate(b.dataset.section);
$('panelClose').onclick=()=>{panelVisible(false);$('reopenPanel').focus();};$('reopenPanel').onclick=()=>{detailsVisible(false);panelVisible(true);};
$('showLayout').onclick=()=>detailsVisible(true);
$('estateLight').onclick=()=>{$('lightingSheet').hidden=!$('lightingSheet').hidden;};
for(const v of lightingModes){const b=action(v==='day'?'Daylight':v[0].toUpperCase()+v.slice(1),()=>{setMood(v);$('lightingSheet').hidden=true;});b.dataset.mood=v;$('estateMoods').append(b);}
$('estateQuality').onchange=event=>site.setQuality(event.target.value);
$('estateRetry').onclick=()=>location.reload();
$('estateReset').onclick=()=>sectionCamera();$('estateZoomIn').onclick=()=>site.zoom(.8);$('estateZoomOut').onclick=()=>site.zoom(1.25);
$('skipApproach').onclick=()=>{skip=true;site.finishFlight();$('skipApproach').hidden=true;};
$('homeButton').addEventListener('click',event=>{if(!isInside()){event.stopImmediatePropagation();navigate('overview');}},true);
$('experienceDock').onclick=e=>{const v=e.target.closest('button')?.dataset.view;if(!v)return;
 if(v==='fullscreen')$('fullscreenButton').click();else if(v==='neighborhood')navigate('location');else if(v==='exterior')navigate('towers');else if(v==='masterplan')navigate(v);
 else if(v==='plan')openInteriorPlan(selected||'A3');else openDesign(selected||'A3',v);
};
window.addEventListener('brigade:interior-enter',e=>{selected=e.detail.design;site.activate(false);$('skipApproach').hidden=true;});
window.addEventListener('brigade:interior-exit',e=>{
 selected=e.detail.design;wing=selected[0];filters.wings=[wing];saved=loadIds('brigade-designs');site.activate(true);
 const next=pendingNav||{next:returnSection,push:false};pendingNav=null;
 navigate(next.next,{push:next.push,motion:false});
 if(floor)site.focusDesign(selected,floor,0);sectionCamera();showExteriorStatus();
});
const firstQuery=new URLSearchParams(location.search);
async function run(){
 project=await getProject();compared=compareIds(loadIds('brigade-compare'),project.layouts);store('brigade-compare',compared);saved=loadIds('brigade-designs');
 try{if(localStorage.getItem('brigade-a3-saved')==='true'&&!saved.includes('A3'))saved.push('A3');}catch{}
 for(const a of project.layouts){previewImages[a.code]=a.preview;collectionMeta[a.code]=a.balcony;}
 readJSON(project.index.resources.amenities).then(data=>site.registerAmenities(data.sections)).catch(()=>{});
 const initialJob=job;if(queuedSection){navigate(queuedSection);queuedSection=null;}
 live=await site.initScene({intro:setIntroPlaying,cityStage:stage=>{$('cityFlightStage').textContent=stage;},cityEnd:()=>{finishCity();query();},wing:pickWing,floor:pickFloor,design:pickDesign,
 amenity:id=>{amenity=amenityNames[id]?id:'eco-deck';navigate('amenities');},feature:id=>{selectedFeature=id;planWidget?.select(id,{focus:true});},
 unsupported:()=>notice('The floor-specific layout is awaiting confirmation.'),
 fallback:message=>{live=false;$('estateRetry').hidden=false;$('estateScene').classList.add('estate-rendering-fallback');syncIntroControl();$('estateStatus').textContent=message;$('sceneQualification').textContent='Illustrative exterior rendering';for(const b of document.querySelectorAll('.estate-orbit-tools button'))b.disabled=true;}});
 if(job===initialJob)await route(firstQuery,true);else if(live&&!isInside())sectionCamera(0);
 addEventListener('popstate',async()=>{const q=new URLSearchParams(location.search);if(isInside())await leaveInterior();route(q);});
}
run().catch(e=>{console.error(e);$('estateStatus').textContent='Unable to load the project · reload to retry';});
