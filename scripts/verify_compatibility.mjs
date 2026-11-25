// Runs with an installed Playwright Firefox build against the local static server.
import assert from 'node:assert/strict';
const {firefox}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BRIGADE_QA_URL||'http://127.0.0.1:5173/';
const browser=await firefox.launch(),profiles=[];
try{
 for(const [width,height] of [[1920,1080],[360,800],[390,844],[430,932],[820,1180],[1180,820]]){
  const touch=width<=1180;
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.__THREE_DEVTOOLS__=new EventTarget();
    window.__THREE_DEVTOOLS__.addEventListener('observe',({detail:renderer})=>{
      if(renderer.isWebGLRenderer){
        const draw=renderer.render;
        renderer.render=function(scene,camera){
          const value=draw.call(this,scene,camera);
          if(renderer.domElement.parentElement?.id==='scene')window.interiorTestRenderer=renderer;
          return value;
        };
      }
    });
  });
  await page.goto(new URL('experience?wing=A&floor=17&light=evening',base).href);
  await page.waitForFunction(async()=>((await import('/estate-scene.js')).sceneMetrics()?.triangles||0)>0);
  assert.equal(await page.locator('#estateLight').getAttribute('data-mood'),'evening');
  const floors=page.locator('#estatePanelContent');
  assert.equal(await floors.getByRole('button',{name:'Floor 17',exact:true}).getAttribute('aria-pressed'),'true');
  const click=async locator=>touch?locator.tap():locator.click();
  await click(floors.getByRole('button',{name:'Floor 18',exact:true}));
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('floor')==='18');
  const exterior=await page.evaluate(async()=>{
    const m=(await import('/estate-scene.js')).sceneMetrics(),gl=document.querySelector('#estateCanvas canvas').getContext('webgl2');
    return {wing:m.wing,floor:m.floor,webgl2:!!gl&&!gl.isContextLost(),gpu:gl.getParameter(gl.RENDERER),triangles:m.triangles,drawCalls:m.drawCalls,contextLoaded:m.geographicContext};
  });
  assert.equal(exterior.wing,'A');assert.equal(exterior.webgl2,true);
  await click(page.locator('#panelClose'));await page.locator('#reopenPanel').waitFor({state:'visible'});await click(page.locator('#reopenPanel'));
  await page.locator('#estatePanel').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.goto(new URL('experience?amenity=eco-deck',base).href);
  const legend=page.locator('#amenity-legend-eco-deck');await legend.selectOption('eco-deck-07');
  await click(page.getByRole('button',{name:'Eye-level view',exact:true}));await click(page.getByRole('button',{name:'Step forward',exact:true}));
  const ecoCamera=await page.evaluate(async()=>(await import('/estate-scene.js')).sceneMetrics()?.camera);
  assert.ok(ecoCamera?.every(Number.isFinite));assert.ok(ecoCamera[1]>15&&ecoCamera[1]<18.5);
  await page.goto(new URL('experience?layout=A3&room=kitchen',base).href);
  await page.waitForFunction(()=>window.interiorTestRenderer?.info.render.triangles>0&&document.querySelector('#roomName').textContent.toLowerCase().includes('kitchen'));
  const interior=await page.evaluate(()=>{
    const r=window.interiorTestRenderer,gl=r.getContext();return {room:document.querySelector('#roomName').textContent,webgl2:gl instanceof WebGL2RenderingContext&&!gl.isContextLost(),triangles:r.info.render.triangles,drawCalls:r.info.render.calls,fallback:document.body.classList.contains('rendered-fallback')};
  });
  assert.equal(interior.webgl2,true);assert.equal(interior.fallback,false);
  await click(page.locator('#planButton'));await page.locator('#planDialog[open]').waitFor();
  await click(page.getByRole('button',{name:'Close floor plan'}));
  assert.deepEqual(errors,[]);
  profiles.push({viewport:[width,height],input:touch?'emulated touch tap':'mouse',exteriorDeepLink:'Wing A, floor 17, evening',selectedFloor:18,collapsedAndReopened:true,noHorizontalOverflow:true,exterior,interiorDeepLink:'Walk → kitchen',interior,sourcePlanOpened:true,ecoEyeCamera:ecoCamera,pageErrors:errors});
  await context.close();
 }
 console.log(JSON.stringify({engine:'Gecko',browser:'Playwright Firefox '+browser.version(),profiles},null,2));
}finally{await browser.close()}
