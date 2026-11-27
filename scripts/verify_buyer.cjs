const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BRIGADE_QA_URL || 'http://127.0.0.1:5173/experience/';
const qa = process.env.BRIGADE_BUYER_QA_DIR || path.join(__dirname,'../qa');
fs.mkdirSync(path.join(qa,'evidence'), { recursive: true });
const report = {browser:'',date:new Date().toISOString(),arrival:{},checks:[],screens:[],devices:[],errors:[]};
const metrics = page => page.evaluate(async()=> (await import(new URL('estate-scene.js',document.baseURI))).sceneMetrics());
const source = (page,query='') => page.goto(base+query);
const ready = page => page.waitForFunction(async()=>Boolean((await import(new URL('estate-scene.js',document.baseURI))).sceneMetrics()?.triangles));
const check=(name,value)=>{assert.ok(value,name);report.checks.push(name);};
const nav=(page,key)=>page.locator('.estate-nav [data-section='+key+']').click();
const button=(page,name)=>(/^Wing [AB]$/.test(name)?page.locator('#estatePanelContent'):page).getByRole('button',{name,exact:true});
const shot=async(p,name)=>{await p.screenshot({path:path.join(qa,'evidence',name+'.png')});report.screens.push(name);};
const legacySatelliteAsset = url => /\/(?:sentinel\/|hyderabad-region\.webp|kokapet-color\.webp)/.test(new URL(url).pathname);
const wide = [475,335,540], wideTarget = [0,20,0];
const heroOverview = {camera:[-173,116,297],target:[0,85,8]};
const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
const isPose = (scene,pose) => distance(scene.camera,pose.camera)<.01&&distance(scene.target,pose.target)<.01;
const skipIntro = page => page.getByRole('button',{name:'Skip introduction',exact:true});
const replayIntro = page => page.getByRole('button',{name:'Replay introduction',exact:true});

async function observeExterior(page){
 const requests=[];
 page.on('request',r=>requests.push(r.url()));
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{
   const observed=window.entryObservation={frames:[],mapSeen:false,skipSeen:false};
   window.__THREE_DEVTOOLS__=new EventTarget();
   window.__THREE_DEVTOOLS__.addEventListener('observe',({detail:renderer})=>{
     if(!renderer.isWebGLRenderer)return;
     const render=renderer.render;
     renderer.render=function(scene,camera){
       const now=performance.now();
       const result=render.call(this,scene,camera);
       if(renderer.domElement.parentElement?.id==='estateCanvas'&&renderer.info.render.triangles>10000){
         const playing=document.querySelector('#introControl')?.getAttribute('aria-label')==='Skip introduction';
         observed.frames.push({t:now,position:camera.position.toArray(),direction:camera.getWorldDirection(camera.position.clone()).toArray(),playing});
       }
       return result;
     };
   });
   new MutationObserver(()=>{
     const surface=document.querySelector('#regionalMap');
     if(surface?.querySelector('canvas')&&!surface.hidden)observed.mapSeen=true;
     const skip=document.querySelector('#introControl[aria-label="Skip introduction"]');
     if(skip&&!skip.hidden&&skip.getClientRects().length)observed.skipSeen=true;
   }).observe(document,{subtree:true,attributes:true,childList:true});
 });
 return requests;
}

async function verifyDirectEntry(page,pathname,overview,label){
 const requests=await observeExterior(page);
 await page.goto(new URL(pathname,base).href);
 await skipIntro(page).waitFor({timeout:10000});
 await ready(page);
 await replayIntro(page).waitFor({timeout:24000});
 await page.waitForTimeout(450);
 const scene=await metrics(page);
 const observed=await page.evaluate(()=>({
   ...window.entryObservation,section:document.body.dataset.section,
   webgl2:!!document.querySelector('#estateCanvas canvas')?.getContext('webgl2')
 }));
 const {frames,mapSeen,skipSeen}=observed,first=frames[0],last=frames.at(-1);
 const firstDirection=wideTarget.map((v,i)=>(v-wide[i])/distance(wide,wideTarget));
 check(label+' first exterior frame uses the wide approach pose and points at the original target',
       distance(first.position,wide)<.01&&distance(first.direction,firstDirection)<.0001);
 check(label+' automatically draws the local exterior with no interaction',observed.webgl2&&scene.triangles>10000&&observed.section==='overview');
 const finalIndex=frames.findIndex(f=>!f.playing&&distance(f.position,overview.camera)<.00001);
 const settled=frames[finalIndex];
 const duration=settled?settled.t-first.t:0;
 assert.ok(settled,`No settled frame rendered. Last frame: ${JSON.stringify(last)}`);
 assert.ok(duration>14000&&duration<17500,`Unexpected arrival duration: ${duration.toFixed(0)} ms. First and last frame times: ${first.t.toFixed(0)} and ${last.t.toFixed(0)}.`);
 report.checks.push(label+' completes the 14.5-second architectural approach');
 const lateral=frames.reduce((max,f)=>Math.max(max,Math.abs((f.position[0]-wide[0])*(overview.camera[2]-wide[2])-(f.position[2]-wide[2])*(overview.camera[0]-wide[0]))/Math.hypot(overview.camera[0]-wide[0],overview.camera[2]-wide[2])),0);
 check(label+' follows a moving orbit between endpoints',frames.length>15&&lateral>10);
 const orbitKeys=[[330,240,434],[152,176,335],[-12,123,316],[-109,113,313]];
 let previous=-1;
 const waypointErrors=orbitKeys.map(key=>{
   let nearest=previous+1;
   for(let i=nearest+1;i<frames.length;i++)if(distance(frames[i].position,key)<distance(frames[nearest].position,key))nearest=i;
   previous=nearest;
   return frames[nearest]?distance(frames[nearest].position,key):Infinity;
 });
 check(label+' passes the four revised orbit waypoints in sequence',waypointErrors.every(error=>error<12));
 check(label+' settles on the responsive overview',isPose(scene,overview)&&frames.slice(finalIndex).every(f=>distance(f.position,overview.camera)<.02));
 check(label+' shows Skip during motion and Replay after settling',skipSeen&&await replayIntro(page).isVisible());
 const regional=requests.filter(legacySatelliteAsset).map(u=>new URL(u).pathname);
 const apartments=requests.filter(u=>/\/apartment-[ab]\d+(?:-web)?\.glb$/.test(new URL(u).pathname));
 check(label+' never displays or downloads a regional map or apartment during arrival',!mapSeen&&regional.length===0&&apartments.length===0);
 const samples=[0,.25,.5,.75,1].map(fraction=>{
   const mark=first.t+duration*fraction;
   const frame=frames.reduce((best,f)=>Math.abs(f.t-mark)<Math.abs(best.t-mark)?f:best,first);
   return {ms:Math.round(frame.t-first.t),camera:frame.position.map(v=>+v.toFixed(2))};
 });
 report.arrival[label]={pathname,firstExteriorFrameMs:Math.round(first.t),firstPosition:first.position,firstDirection:first.direction,
   approachMs:Math.round(duration),frames:frames.length,samples,waypointErrorsMetres:waypointErrors.map(n=>+n.toFixed(2)),lateralDisplacementMetres:+lateral.toFixed(2),finalCamera:last.position,
   finalTarget:scene.target,triangles:scene.triangles,webgl2:observed.webgl2,skipSeen,mapSeen,cityMapRequests:regional,apartmentModelRequests:apartments.length};
}
async function verifyReplay(page,overview){
 await replayIntro(page).click();
 await skipIntro(page).waitFor();
 const reset=await metrics(page);
 check('Replay returns to the wide end of the approach',distance(reset.camera,wide)<10&&distance(reset.target,wideTarget)<1);
 await page.waitForTimeout(1100);
 check('Replayed approach advances before Skip',distance((await metrics(page)).camera,wide)>1);
 await skipIntro(page).click();
 await replayIntro(page).waitFor();
 check('Skip lands on the settled overview',isPose(await metrics(page),overview));
 await replayIntro(page).click();await skipIntro(page).waitFor();
 await page.locator('#estateCanvas canvas').press('ArrowLeft');
 await replayIntro(page).waitFor();await page.waitForTimeout(350);
 const steered=await metrics(page);
 check('Keyboard orbit immediately takes control of the introduction',distance(steered.camera,wide)>10&&!isPose(steered,overview));
 await replayIntro(page).click();await skipIntro(page).waitFor();
 await page.locator('.estate-hero [data-section=towers]').click();
 await button(page,'Wing A').click();
 await page.waitForTimeout(1400);
 const selected=await metrics(page);
 check('Selecting a wing during the approach takes control immediately',await page.locator('#estatePanelTitle').innerText()==='Wing A'&&selected.wing==='A'&&!await skipIntro(page).isVisible()&&!await replayIntro(page).isVisible()&&!isPose(selected,overview));
 await nav(page,'overview');
}
async function verifyReduced(browser){
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 try{
  const requests=await observeExterior(page);
  await source(page);
  await ready(page);await page.waitForTimeout(1100);
  const observed=await page.evaluate(()=>window.entryObservation),scene=await metrics(page);
  check('Reduced motion opens the hero directly with introduction controls hidden',isPose(scene,heroOverview)&&!observed.skipSeen&&!await page.locator('#introControl').isVisible());
  check('Reduced-motion arrival uses no legacy satellite fallback',!observed.mapSeen&&!requests.some(legacySatelliteAsset));
  report.arrival.reducedMotion={viewport:'390×844',firstPosition:observed.frames[0].position,finalCamera:scene.camera,finalTarget:scene.target,skipSeen:observed.skipSeen,mapSeen:observed.mapSeen};
 }finally{await page.close();}
}
async function verifyApartmentShare(browser) {
 const page=await browser.newPage({reducedMotion:'no-preference'});
 try{
   const requests=await observeExterior(page);
   await source(page,'?layout=B10&room=kitchen');
   await page.waitForFunction(()=>document.body.classList.contains('walking')&&document.querySelector('#sceneStatus')?.textContent.includes('Design B10')&&document.querySelector('#roomName')?.textContent.toLowerCase().includes('kitchen')&&!!document.querySelector('#scene canvas')?.getContext('webgl2'));
   const intro=await page.evaluate(()=>window.entryObservation);
   check('Apartment share opens the live B10 kitchen and bypasses the building introduction',!intro.skipSeen&&!intro.mapSeen&&!requests.some(legacySatelliteAsset));
 }finally{await page.close();}
}
async function share(browser,query,title){
 const page=await browser.newPage({reducedMotion:'no-preference'});
 try{
  const requests=await observeExterior(page);
  await source(page,query);await page.waitForFunction(t=>document.querySelector('#estatePanelTitle').textContent===t,title);
  const state=await page.evaluate(()=>({skip:window.entryObservation.skipSeen,map:window.entryObservation.mapSeen}));
  check('Public link '+query+' bypasses the introduction',!state.skip&&!state.map&&!requests.some(legacySatelliteAsset)&&!await page.locator('#introControl').isVisible());
 }finally{await page.close();}
}
async function gestures(page){
 const cd=await page.context().newCDPSession(page);
 const send=(type,xy)=>cd.send('Input.dispatchTouchEvent',{type,touchPoints:xy.map(([x,y],i)=>({x,y,id:i+1}))});
 const m=await metrics(page);
 await send('touchStart',[[92,255],[225,255]]);
 for(let i=1;i<=6;i++)await send('touchMove',[[92-i*6,255],[225+i*6,255]]);
 await send('touchEnd',[]);await page.waitForTimeout(240);
 const z=await metrics(page);await send('touchStart',[[164,243]]);
 for(let i=1;i<=9;i++)await send('touchMove',[[164+i*9,243+i*2]]);
 await send('touchEnd',[]);await page.waitForTimeout(250);
 const o=await metrics(page),dist=v=>Math.hypot(...v.camera.map((c,i)=>c-v.target[i]));
 assert.ok(Math.abs(dist(z)-dist(m))>1,'touch pinch changes radius');assert.ok(Math.hypot(...o.camera.map((c,i)=>c-z.camera[i]))>4,'touch drag changes orbit');
 return {pinchRadiusDelta:Math.round(dist(z)-dist(m)),dragMetres:Math.round(Math.hypot(...o.camera.map((c,i)=>c-z.camera[i])))};
}
async function main(){
 const b=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome'});
 const originalNewPage=b.newPage.bind(b);
 b.newPage=async options=>{const page=await originalNewPage(options);await page.route('**/data/arcgis-runtime.json',route=>route.fulfill({json:{arcgisImageryEnabled:false,arcgisApiKey:''}}));return page;};
 report.browser=b.version();
 try{
 const p=await b.newPage({viewport:{width:1920,height:1080}});
 p.on('response',r=>{if(r.status()>=400){const u=new URL(r.url());report.errors.push(r.status()+' '+u.origin+u.pathname);}});
 const rootPage=await b.newPage({viewport:{width:1920,height:1080},reducedMotion:'no-preference'});
 try{await verifyDirectEntry(rootPage,'/',heroOverview,'desktop /');}finally{await rootPage.close();}
 await verifyDirectEntry(p,'/experience/',heroOverview,'desktop /experience/');
 await shot(p,'exterior-1920');
 await verifyReplay(p,heroOverview);
 const phone=await b.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'no-preference'});
 try{await verifyDirectEntry(phone,'/experience/',heroOverview,'phone /experience/');}finally{await phone.close();}
 await verifyReduced(b);
 await p.emulateMedia({reducedMotion:'reduce'});
 await p.locator('.estate-hero [data-section=towers]').click();await button(p,'Wing A').click();await button(p,'Floor 12').click();
 check('Wing A refuge has six residential choices, with A7 removed',await p.locator('.unit-chips button').count()===6&&!(await p.locator('.unit-chips').innerText()).includes('A7'));
 check('Selected refuge geometry is active',(await metrics(p)).floor===12);await button(p,'Floor 17').click();check('Typical Wing A has all seven designs',await p.locator('.unit-chips button').count()===7);
 await button(p,'Wing B').click();await button(p,'Floor 22').click();check('Wing B floor selects six numbered brochure bays',await p.locator('.unit-chips button').count()===6&&(await metrics(p)).wing==='B');
 await shot(p,'wing-b-floor-22');await button(p,'Explore design B10 on floor 22').click();check('Floor-plate hotspot opens B10 in the apartment panel',await p.locator('#layoutInfo h2').textContent()==='Residence B10');await button(p,'All wings').click();
 const group=p.locator('.more-filters');await group.locator('summary').click();await group.getByRole('button',{name:'22',exact:true}).click();
 await button(p,'3 BHK + study').click();await button(p,'4 BHK').click();check('OR across study and four-bedroom configurations',await p.locator('.layout-pick').count()===4);
 await button(p,'Wing B').click();check('AND with wing B returns only B10 and B11',JSON.stringify(await p.locator('.layout-pick').evaluateAll(es=>es.map(e=>e.dataset.code)))===JSON.stringify(['B10','B11']));
 await p.getByRole('spinbutton',{name:'Carpet area Minimum'}).fill('25000');check('Area filter updates to empty state',await p.locator('.layout-pick').count()===0);await p.getByRole('spinbutton',{name:'Carpet area Minimum'}).fill('');
 await p.locator('.layout-pick[data-code=B10]').click();await button(p,'Save apartment').click();await button(p,'Add to compare').click();await nav(p,'compare');await p.locator('#compareChoice').selectOption('A3');await p.locator('#compareChoice').selectOption('A1');
 await shot(p,'comparison-1920');check('Three saved comparison rows show plans, rendered previews and decks',await p.locator('.compare-design').count()===3&&await p.locator('#compareChoice').count()===0&&await p.locator('.comparison-previews img').count()===6&&/Expansive deck/i.test(await p.locator('#estatePanelContent').innerText()));
 await p.reload();await p.waitForSelector('.compare-design');check('Compare and saved apartment survive reload',await p.locator('.compare-design').count()===3&&await p.evaluate(()=>JSON.parse(localStorage.getItem('brigade-designs')).includes('B10')));
 await nav(p,'location');
 const info = p.locator('#estatePanelContent');
 check('Property information shows the documented address', /Plot No 20.*Neopolis.*Kokapet/i.test(await info.innerText()));
 const forbidden = await p.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name));
 check('Property information retains the hybrid ground without low-resolution satellite fallback',!forbidden.some(legacySatelliteAsset)&&(await metrics(p)).landscape?.kind==='hybrid');
 await shot(p,'property-info-1920');await nav(p,'amenities');
 await p.goBack();await p.waitForFunction(()=>document.body.dataset.section==='location');check('Back restores the previous public scene',true);
 const sun=[];for(const mood of ['morning','day','sunset','night']){await p.locator('#estateLight').click();await p.locator('[data-mood='+mood+']:is(#estateMoods button)').click();const m=await metrics(p);assert.equal(m.mood,mood);sun.push(m.solarDirection.map(a=>a.toFixed(3)).join(','));}
 check('Four architectural sunlight directions change the rendered scene',new Set(sun).size===4);
 await p.close();
 for(const [q,t] of [['?wing=A','Wing A'],['?wing=B','Wing B'],['?amenity=sky-deck','Sky Deck'],['?amenity=eco-deck','Eco Deck'],['?amenity=clubhouse','Clubhouse'],['?layout=invalid','Apartments']])await share(b,q,t);
 await verifyApartmentShare(b);
 for(const [w,h] of [[360,800],[390,844],[430,932],[820,1180],[1180,820],[1920,1080]]){
 const mobile=w<1200;const ctx=await b.newContext({viewport:{width:w,height:h},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:mobile?2:1,reducedMotion:'reduce'});
 const pg=await ctx.newPage();try{await source(pg,'?wing=A');await ready(pg);await button(pg,'Floor 12').waitFor();const row={width:w,height:h};
 const viewport=await pg.evaluate(()=>({body:document.documentElement.scrollWidth,visible:innerWidth,canvas:document.querySelector('#estateCanvas canvas').clientHeight,viewport:innerHeight}));
 assert.ok(viewport.body<=viewport.visible+1&&viewport.canvas>=viewport.viewport-2,'Viewport is usable '+w);row.viewport=viewport;
 if(w===390){await button(pg,'Floor 12').click();await shot(pg,'refuge-390');}
 await pg.locator('#panelClose').click();await pg.locator('#reopenPanel').waitFor();if(w===390)row.touch=await gestures(pg);
 if(w===360||w===820)await shot(pg,'exterior-'+w);
 row.renderer=await metrics(pg);report.devices.push(row);
 }finally{await ctx.close();}}
 check('Six responsive viewports, collapsible panels and real touch input',report.devices.length===6);assert.deepEqual(report.errors,[]);
 fs.writeFileSync(path.join(qa,'buyer-browser.json'),JSON.stringify(report,null,2)+'\n');
 }finally{await b.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
