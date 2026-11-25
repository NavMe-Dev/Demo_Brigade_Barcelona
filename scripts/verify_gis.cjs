const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.BRIGADE_QA_URL||'http://127.0.0.1:5173/experience/';
const qa=path.join(__dirname,'../qa');
const report={date:new Date().toISOString(),url,checks:[],errors:[]};
const check=(name,condition)=>{assert.ok(condition,name);report.checks.push(name);};
const metrics=page=>page.evaluate(async()=>(await import(new URL('estate-scene.js',document.baseURI))).sceneMetrics());
const state=page=>page.evaluate(()=>document.body.dataset.section);
async function prepareMetrics(page){
 await page.evaluate(async()=>{window.readGISMetrics=(await import(new URL('estate-scene.js',document.baseURI))).sceneMetrics;});
}
async function ready(page){
 await prepareMetrics(page);
 await page.waitForFunction(()=>{
  const g=window.readGISMetrics()?.gis;
  return g?.buildings?.ready&&g.buildings.visibleBuildings>0&&g.imagery.localNativeTiles>0;
 },null,{timeout:30000});
}
const role=(page,label)=>page.getByRole('button',{name:label,exact:true});
const section=(page,id)=>page.locator('.estate-nav [data-section="'+id+'"]').click();
const cors={'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'Authorization'};
const apiRe=/^https:\/\/[^/]*\.arcgis\.com\//i;

async function inspectLiveTerrain(page){
 const result=await page.evaluate(async()=>{
   const terrain=await (await import(new URL('geo-terrain.js',document.baseURI))).loadTerrain();
   const parcel=await fetch(new URL('assets/geography/plot-20.geojson',document.baseURI)).then(r=>r.json());
   const group=window.gisTerrainScene.getObjectByName('RegisteredTerrain');
   const elevations=new Map();
   let seamErrorM=0,demErrorM=0,samples=0,sharedEdgeVertices=0;
   const v=group.position.clone();
   group.traverse(mesh=>{
     if(!mesh.name.startsWith('DEM '))return;
     const pos=mesh.geometry.attributes.position;
     for(let i=0;i<pos.count;i++){
       v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
       const key=v.x+','+v.z;
       if(elevations.has(key)){
         seamErrorM=Math.max(seamErrorM,Math.abs(v.y-elevations.get(key)));sharedEdgeVertices++;
       }else elevations.set(key,v.y);
       demErrorM=Math.max(demErrorM,Math.abs(v.y-terrain.heightAt(v.x,v.z)));samples++;
     }
   });
   const parcelElevations=parcel.geometry.coordinates[0].map(([lon,lat])=>terrain.heightAt(...terrain.wgs84ToLocal(lon,lat)));
   const roundTripM=Math.max(...[[0,0],[-4100,1200],[4800,-2900],[379,284]].map(([x,z])=>{
     const [u,v]=terrain.wgs84ToLocal(...terrain.localToWGS84(x,z));
     return Math.hypot(u-x,v-z);
   }));
   return {origin:terrain.localToWGS84(0,0),anchorElevationM:terrain.anchorElevationM,stepM:terrain.step,demErrorM,seamErrorM,samples,
     sharedEdgeVertices,roundTripM,maxParcelElevationRelativeM:Math.max(...parcelElevations.map(Math.abs))};
 });
 check('Rendered local terrain matches its DEM and adjacent mesh seams',result.samples>100000&&result.sharedEdgeVertices>1000&&result.demErrorM<.005&&result.seamErrorM<.001);
 check('Plot 20 sits at the local elevation origin and geographic coordinates round-trip within 1 cm',result.maxParcelElevationRelativeM<.05&&result.roundTripM<.01&&Math.hypot(result.origin[0]-78.312086932,result.origin[1]-17.402192529)<1e-7);
 report.terrain=result;
}

function observe(page){
 const activity={api:[],requests:[],failed:[]};
 page.on('request',r=>{
   const u=new URL(r.url());
   if(apiRe.test(r.url()))activity.api.push(u.origin+u.pathname);
   if(u.protocol.startsWith('http'))activity.requests.push(u.pathname);
 });
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{
   if(r.status()>=400&&!apiRe.test(r.url()))activity.failed.push([r.status(),new URL(r.url()).pathname]);
 });
 return activity;
}
function useOpenImagery(page){
 return page.route('**/data/arcgis-runtime.json',route=>route.fulfill({json:{arcgisImageryEnabled:false,arcgisApiKey:''}}));
}
async function testBuyer(browser){
 const page=await browser.newPage({viewport:{width:1920,height:1080},reducedMotion:'reduce'});
 await useOpenImagery(page);
 const log=observe(page);
 try{
  await page.addInitScript(()=>{
   window.__THREE_DEVTOOLS__=new EventTarget();
   window.__THREE_DEVTOOLS__.addEventListener('observe',({detail:r})=>{
     if(!r.isWebGLRenderer)return;
     const draw=r.render;
     r.render=function(scene,camera){
       const result=draw.call(this,scene,camera);
       if(r.domElement.parentElement?.id==='estateCanvas'){window.gisTerrainScene=scene;window.gisDraw={r,scene,camera};}
       return result;
     };
   });
  });
  await page.goto(url);
  await ready(page);
  await inspectLiveTerrain(page);
  const config=await page.evaluate(async()=>{
   const settings=await fetch(new URL('data/arcgis-runtime.json',document.baseURI)).then(r=>r.json());
   return {enabled:settings.arcgisImageryEnabled,hasKey:Boolean(settings.arcgisApiKey)};
  });
  check('Open-imagery fixture contains no ArcGIS credential',!config.hasKey);
  const atStart=await metrics(page),credits=page.locator('#geoCredits');
  check('Landing draws the building and local spatial datasets before geographic navigation',await state(page)==='overview'&&atStart.triangles>10000&&!log.requests.some(n=>n.includes('maplibre-gl')));
  check('No-key imagery uses Sentinel without ArcGIS network calls',atStart.gis.imagery.provider==='sentinel'&&log.api.length===0);
  check('Bundled footprint tiles and native-scale terrain are present',atStart.gis.buildings.visibleBuildings>0&&Number.isFinite(atStart.gis.anchorElevationM));
  check('Visible geographic attribution identifies imagery and footprint sources',await credits.isVisible()&&/Sentinel|Copernicus/i.test(await credits.innerText())&&/Overture/i.test(await credits.innerText()));
  const credit=await credits.innerText();
  const terrainPixel=()=>page.evaluate(()=>{
   const {r,scene,camera}=window.gisDraw;r.render(scene,camera);
   const c=document.createElement('canvas');c.width=96;c.height=54;
   const ctx=c.getContext('2d');ctx.drawImage(r.domElement,0,0,96,54);
   const data=ctx.getImageData(0,30,96,24).data,avg=[0,0,0];
   for(let i=0;i<data.length;i+=4)for(let j=0;j<3;j++)avg[j]+=data[i+j]/(data.length/4);
   return avg.map(n=>+n.toFixed(1));
  });
  const dayRGB=await terrainPixel();
  await page.locator('#estateLight').click();await page.locator('#estateMoods [data-mood=sunset]').click();
  await page.waitForTimeout(200);const sunsetRGB=await terrainPixel();
  check('Sunset visibly changes the local exterior framebuffer',Math.hypot(...sunsetRGB.map((v,i)=>v-dayRGB[i]))>9&&(await metrics(page)).mood==='sunset');
  await page.screenshot({path:path.join(qa,'evidence/gis/sunset-exterior.png')});
  await page.locator('#estateLight').click();await page.locator('#estateMoods [data-mood=day]').click();
  await page.locator('.estate-hero [data-section=towers]').click();
  for(const [wing,floor,design] of [['A',12,'A3'],['B',22,'B10']]){
   await page.locator('#estatePanelContent').getByRole('button',{name:'Wing '+wing,exact:true}).click();
   await role(page,'Floor '+floor).click();
   const m=await metrics(page);
   check('Wing '+wing+' highlights its selected floor '+floor,m.wing===wing&&m.floor===floor);
   await role(page,'Explore design '+design+' on floor '+floor).click();
   check('Floor '+floor+' opens residence '+design,await page.locator('#layoutInfo h2').innerText()==='Residence '+design);
   if(wing==='A'){await page.locator('#layoutInfo').getByRole('button',{name:'Back to building',exact:true}).click();continue;}
   await role(page,'Explore apartment in 3D').click();
   await page.waitForFunction(()=>document.body.classList.contains('walking')&&document.querySelector('#sceneStatus')?.textContent.includes('Design B10'));
   await page.locator('#interiorFilmstrip [data-room=kitchen]').click();
   await page.waitForFunction(()=>new URLSearchParams(location.search).get('room')==='kitchen');
   await page.locator('#planButton').click();
   const plan=page.locator('#planDialog');
   check('B10 kitchen and interactive floor plan remain available',await plan.isVisible()&&await plan.locator('svg polygon').count()>6);
   await plan.locator('.close-dialog').click();await page.locator('#dollhouseButton').click();
   check('B10 dollhouse remains interactive',await page.locator('#dollhouseButton').getAttribute('aria-pressed')==='true');
   await page.locator('#buildingReturn').click();
   await page.waitForFunction(()=>!document.body.classList.contains('walking')&&!document.querySelector('#buildingReturn').getClientRects().length);
   const returned=await metrics(page);
   check('Return from B10 restores the selected wing and floor',returned.wing===wing&&returned.floor===floor);
  }
  check('No unexpected response errors during the offline-capable buyer flow',!log.failed.length);
  report.noKey={config,credits:credit,dayRGB,sunsetRGB,provider:atStart.gis.imagery.provider,anchorElevationM:atStart.gis.anchorElevationM,buildings:atStart.gis.buildings,arcgisRequests:log.api.length};
 }finally{await page.close();}
}
async function testCityFlight(browser){
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'}),network=observe(page);
 await useOpenImagery(page);
 try{
  await page.goto(url);await ready(page);await section(page,'location');
  await page.evaluate(()=>{
   const log=window.observedStages=[];
   const read=()=>{
    const node=document.querySelector('#cityFlightStage');
    const text=node?.textContent.trim();
    if(node?.getClientRects().length&&text&&log.at(-1)?.text!==text)log.push({text,ms:Math.round(performance.now())});
   };
   new MutationObserver(read).observe(document.body,{subtree:true,attributes:true,childList:true,characterData:true});
   read();
  });
  const overlay=page.locator('.map-features');await overlay.click();
  await page.waitForFunction(()=>{const g=window.readGISMetrics()?.gis?.infrastructure;return g?.ready||g?.features>0;},null,{timeout:15000});
  const overlayStats=(await metrics(page)).gis.infrastructure;
  check('Location can display the mapped infrastructure layer',await overlay.getAttribute('aria-pressed')==='true'&&Boolean(overlayStats));
  await overlay.click();await page.locator('#cityFlight').click();
  await page.waitForFunction(()=>document.getElementById('cityFlightStage').textContent==='Hyderabad');
  await page.screenshot({path:path.join(qa,'evidence/gis/hyderabad-flight.png')});
  await page.waitForFunction(()=>window.observedStages.some(s=>/Hyderabad/i.test(s.text)),null,{timeout:20000});
  await page.waitForFunction(()=>window.observedStages.some(s=>/Kokapet/i.test(s.text)),null,{timeout:30000});
  await page.waitForFunction(()=>window.observedStages.some(s=>/Neopolis/i.test(s.text)),null,{timeout:30000});
  await page.screenshot({path:path.join(qa,'evidence/gis/neopolis-arrival.png')});
  await page.waitForFunction(()=>document.body.dataset.section==='overview'&&!document.body.classList.contains('city-flight'),null,{timeout:30000});
  await role(page,'Replay introduction').waitFor({timeout:22000});
  const stages=await page.evaluate(()=>window.observedStages),m=await metrics(page);
  check('Location flight visits Hyderabad, Kokapet and Neopolis sequentially',stages.findIndex(s=>/Hyderabad/i.test(s.text))<stages.findIndex(s=>/Kokapet/i.test(s.text))&&stages.findIndex(s=>/Kokapet/i.test(s.text))<stages.findIndex(s=>/Neopolis/i.test(s.text)));
  check('Regional flight hands off to the live settled exterior',m.triangles>10000&&Math.hypot(...m.camera.map((n,i)=>n-[183,152,298][i]))<.01);
  await page.goto(new URL('?scene=journey',url).href);
  await page.locator('#skipCityFlight').waitFor();await page.locator('#skipCityFlight').click();
  await page.waitForFunction(()=>!document.querySelector('#regionalMap')?.classList.contains('map-visible')&&document.body.dataset.section==='overview');
  check('The journey deep link starts the manual tour and Skip returns to the building',await state(page)==='overview');
  check('City tour had no failed local assets',!network.failed.length);
  report.city={stages,overlay:overlayStats,finalCamera:m.camera,finalTarget:m.target,arcgisRequests:network.api.length};
 }finally{await page.close();}
}
async function testFailure(browser){
 const page=await browser.newPage({viewport:{width:1024,height:768},reducedMotion:'reduce'});
 const log=observe(page);
 try{
  await page.route('**/data/arcgis-runtime.json',r=>r.fulfill({json:{arcgisImageryEnabled:true,arcgisApiKey:'local-test-placeholder'}}));
  // A deterministic denied service response from the intercept. No token or request leaves the machine.
  await page.route(apiRe,r=>r.request().method()==='OPTIONS'?r.fulfill({status:204,headers:cors}):r.fulfill({status:403,headers:cors,json:{error:{code:403,message:'Simulated service denial'}}}));
  await page.goto(url);await ready(page);
  await page.waitForFunction(()=>{
    const s=window.readGISMetrics()?.gis?.imagery;
    return s?.provider==='sentinel'&&s.localNativeTiles>0&&/denied|unavailable|authorization/i.test(s.reason);
  });
  const m=await metrics(page);
  assert.ok(log.api.length>0,`The simulated service received no requests. Imagery diagnostics: ${JSON.stringify(m.gis.imagery)}`);
  check('Service denial preserves bundled imagery, terrain and selectable wings',m.gis.imagery.provider==='sentinel'&&m.gis.buildings.visibleBuildings>0);
  await page.locator('.estate-hero [data-section=towers]').click();
  await page.locator('#estatePanelContent').getByRole('button',{name:'Wing B',exact:true}).click();
  check('After simulated service failure the user can still select Wing B',(await metrics(page)).wing==='B');
  check('The fallback displays its active geographic source credit',/Sentinel|Copernicus/i.test(await page.locator('#geoCredits').innerText()));
  report.deniedService={fixture:'Simulated HTTP 403; no real provider request',apiPathsWithoutQuery:log.api,source:m.gis.imagery,failedLocalAssets:log.failed};
 }finally{await page.close();}
}
async function testBalcony(browser){
 const p=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await useOpenImagery(p);
 const activity=observe(p);
 try{
  await p.goto(new URL('?layout=A3&floor=20&room=deck',url).href);
  await p.locator('#balconyView').waitFor({timeout:20000});
  await p.locator('#balconyView').click();
  await p.locator('#balconyCredits').waitFor();
  await prepareMetrics(p);
  await p.waitForFunction(()=>window.readGISMetrics()?.gis?.buildings.visibleBuildings>0&&window.readGISMetrics()?.gis?.imagery.localNativeTiles>0);
  await p.waitForTimeout(1250);
  const caption=await p.locator('.view-source').innerText();
  check('Deep-linked A3 deck outlook describes the selected floor and estimated orientation',/floor 20/i.test(caption)&&/simulated/i.test(caption)&&/approximate/i.test(caption));
  check('Balcony displays its geographic sources',/Sentinel/i.test(caption)&&/Overture/i.test(caption));
  const m=await metrics(p);
  await p.screenshot({path:path.join(qa,'evidence/gis/a3-floor20-outlook.png')});
  await p.locator('#neighborhoodReturn').click();
  await p.waitForFunction(()=>document.body.dataset.section==='location');
  await ready(p);
  await p.waitForTimeout(200);
  const back=await metrics(p);
  check('Returning from the deck restores the geographic exterior and Location controls',back.drawCalls>0&&back.triangles>10000&&back.gis.buildings.visibleBuildings>0&&await p.locator('#cityFlight').isVisible());
  check('No local asset errors during balcony entry and return',!activity.failed.length);
  report.balcony={caption,visibleFootprints:m.gis.buildings.visibleBuildings,localImageryTiles:m.gis.imagery.localNativeTiles,backTo:'location',drawCallsAfterReturn:back.drawCalls};
 }finally{await p.close();}
}
async function testTileProtocol(browser){
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
 const activity=observe(page);
 try{
  const image64=await page.evaluate(()=>{
    const el=document.createElement('canvas');el.width=el.height=256;
    const ctx=el.getContext('2d');ctx.fillStyle='#ec00db';ctx.fillRect(0,0,256,256);
    ctx.fillStyle='#cc04a3';ctx.fillRect(0,0,128,128);ctx.fillRect(128,128,128,128);
    return el.toDataURL().split(',')[1];
  });
  const png=Buffer.from(image64,'base64'),authHeaderPresent=[],tokenInURL=[];
  await page.addInitScript(()=>{
   window.__THREE_DEVTOOLS__=new EventTarget();
   window.__THREE_DEVTOOLS__.addEventListener('observe',({detail:r})=>{
    if(!r.isWebGLRenderer)return;
    const original=r.render;
    r.render=function(scene,camera){
     const result=original.call(this,scene,camera);
     if(r.domElement.parentElement?.id==='estateCanvas')window.fixtureScene={scene,camera,r};
     return result;
    };
   });
  });
  await page.route('**/data/arcgis-runtime.json',r=>r.fulfill({json:{arcgisImageryEnabled:true,arcgisApiKey:'local-test-placeholder'}}));
  await page.route(apiRe,route=>{
    const req=route.request(),u=new URL(req.url());
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
    authHeaderPresent.push(req.headers().authorization==='Bearer local-test-placeholder');
    tokenInURL.push(u.href.includes('local-test-placeholder'));
    if(u.pathname.includes('/tilemap/'))return route.fulfill({headers:cors,json:{data:Array(64).fill(1)}});
    if(u.pathname.includes('/tile/'))return route.fulfill({headers:cors,contentType:'image/png',body:png});
    if(u.pathname.endsWith('/4/query'))return route.fulfill({headers:cors,json:{features:[{attributes:{SRC_RES:.31,MaxMapLevel:19}}]}});
    return route.fulfill({headers:cors,json:{copyrightText:'Local protocol test attribution',tileInfo:{rows:256,cols:256,spatialReference:{wkid:3857},lods:[{level:12},{level:19}]}}});
  });
  await page.goto(url);await prepareMetrics(page);
  await page.waitForFunction(()=>{
    const s=window.readGISMetrics()?.gis?.imagery;
    return s?.provider==='arcgis'&&s.visibleTiles>0&&s.highestVisibleZoom>12&&s.loading===0;
  },null,{timeout:30000});
  const m=await metrics(page);
  const pixels=await page.evaluate(()=>{
    const {r,scene,camera}=window.fixtureScene;
    r.render(scene,camera);
    const c=document.createElement('canvas');c.width=96;c.height=60;
    const ctx=c.getContext('2d');ctx.drawImage(r.domElement,0,0,96,60);
    const data=ctx.getImageData(0,0,96,60).data;let count=0;
    for(let i=0;i<data.length;i+=4)if(data[i]>100&&data[i+2]>90&&data[i]>data[i+1]*1.65&&data[i+2]>data[i+1]*1.5)count++;
    return count;
  });
  check('Mock tile service requests metadata, availability and native 256 px tiles',activity.api.some(n=>n.endsWith('/4/query'))&&activity.api.some(n=>n.includes('/tilemap/'))&&activity.api.some(n=>n.includes('/tile/')));
  check('Mock tiles actually reach the exterior framebuffer',pixels>150&&m.gis.imagery.maxZoom===19&&m.gis.imagery.visibleTiles>0);
  check('Source credit changes with the displayed mock tile provider',await page.locator('#geoCredits').innerText().then(s=>s.includes('Local protocol test attribution')));
  check('The mock credential travels only through the Authorization request header',authHeaderPresent.every(Boolean)&&!tokenInURL.some(Boolean));
  report.tileProtocol={fixture:'Local synthetic checkerboard; this test does not establish real service coverage',requests:activity.api.length,matchingPixelsIn96x60:pixels,
    visibleTiles:m.gis.imagery.visibleTiles,highestVisibleZoom:m.gis.imagery.highestVisibleZoom,maxZoom:m.gis.imagery.maxZoom,estimatedTextureBytes:m.gis.imagery.estimatedTextureBytes};
 }finally{await page.close();}
}
async function testLicensed(browser){
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
 try{
   const config=await page.request.get(new URL('../data/arcgis-runtime.json',url).href);
   const settings=await config.json();
   const licensed={checked:new Date().toISOString(),status:'awaiting local credential',tileResponses:0};
   const save=()=>fs.writeFileSync(path.join(qa,'gis-licensed.json'),JSON.stringify(licensed,null,2)+'\n');
   if(!settings.arcgisImageryEnabled || !settings.arcgisApiKey){
     save();console.log('Licensed imagery check pending. Add the restricted key to the local configuration and refresh.');return;
   }
   page.on('response',response=>{
     const u=new URL(response.url());
     if(u.hostname==='ibasemaps-api.arcgis.com' && u.pathname.includes('/tile/') && response.ok()
        && (response.headers()['content-type']||'').startsWith('image/'))licensed.tileResponses++;
   });
   await page.goto(url);await prepareMetrics(page);
   try{
     await page.waitForFunction(()=>window.readGISMetrics()?.gis?.imagery?.provider==='arcgis',null,{timeout:60000});
     const imagery=(await metrics(page)).gis.imagery;
     assert.ok(licensed.tileResponses>0&&imagery.visibleTiles>0);
     Object.assign(licensed,{status:'verified',visibleTiles:imagery.visibleTiles,maxZoom:imagery.maxZoom,attribution:imagery.attribution});
   }catch{
     const imagery=(await metrics(page))?.gis?.imagery;
     Object.assign(licensed,{status:'unable to verify',reason:imagery?.reason||'No geographic frame received'});
     process.exitCode=1;
   }
   save();console.log('Live World Imagery:',licensed.status);
 }finally{await page.close();}
}
async function main(){
 const b=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome'});
 try{
  report.browser=b.version();
  if(process.argv[2]==='licensed'){await testLicensed(b);return;}
  const cases={buyer:testBuyer,city:testCityFlight,balcony:testBalcony,failure:testFailure,protocol:testTileProtocol};
  const names=process.argv.slice(2);
  for(const name of (names.length?names:Object.keys(cases))){
    assert.ok(Object.hasOwn(cases,name),'Unknown test '+name);
    await cases[name](b);
  }
  assert.deepEqual(report.errors,[]);
  if(!names.length)fs.writeFileSync(path.join(qa,'gis-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(report.checks.length+' GIS checks passed');
 }finally{await b.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
