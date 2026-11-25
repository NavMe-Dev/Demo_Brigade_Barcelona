// Run against a local static server with Playwright and a WebGL2-enabled browser.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const base=process.env.BASE_URL||'http://127.0.0.1:5173';
  const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,headless:true});
  try{
    const page=await browser.newPage({viewport:{width:960,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/__amenity-proof',r=>r.fulfill({contentType:'text/html',body:`<base href="/"><script type="importmap">{"imports":{"three":"./vendor/three/three.module.js","three/addons/":"./vendor/addons/"}}</script><main style="width:400px;max-width:100%"></main>`}));
    await page.goto(base+'/__amenity-proof');
    const report=await page.evaluate(async()=>{
      const {mountAmenityPlan}=await import('./amenity-plan.js');
      window.cues=[];window.ui=await mountAmenityPlan(document.querySelector('main'),{onFocus:v=>window.cues.push(v)});
      const T=await import('three'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
      const {MeshoptDecoder}=await import('three/addons/libs/meshopt_decoder.module.js');
      const r=new T.WebGLRenderer({antialias:true}),gl=r.getContext(),driver=gl.getExtension('WEBGL_debug_renderer_info');
      const scene=new T.Scene(),camera=new T.PerspectiveCamera(46,1,.05,6500);
      scene.add(new T.HemisphereLight(0xffffff,0xcac2a9,2));
      const models={};
      const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      for(const id of ['brigade-barcelona','exterior-lod','wing-a','wing-b','podium','landscape','eco-deck','sky-deck','clubhouse','clubhouse-studies']){
        const root=(await loader.loadAsync('assets/'+id+'.glb')).scene;scene.add(root);const features=new Set();
        root.traverse(o=>{if(o.userData.amenityId)features.add(o.userData.amenityId);});
        const box=new T.Box3().setFromObject(root),center=box.getCenter(new T.Vector3()),d=box.getSize(new T.Vector3()).length();
        if(!(d>0&&Number.isFinite(d)))throw Error('Invalid model bounds '+id);
        camera.position.copy(center).add(new T.Vector3(d*.8,d*.54,d*.9));camera.lookAt(center);r.render(scene,camera);
        if(!r.info.render.triangles)throw Error('No triangles rendered: '+id);
        models[id]={verticesBounds:[box.min.toArray(),box.max.toArray()],draws:r.info.render.calls,triangles:r.info.render.triangles,amenityIds:[...features].sort(),bytes:(await fetch('assets/'+id+'.glb',{method:'HEAD'})).headers.get('content-length')};
        scene.remove(root);root.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[]))m.dispose();});
      }
      const gpu=driver?gl.getParameter(driver.UNMASKED_RENDERER_WEBGL):'unavailable';r.dispose();
      return {gpu,models,catalog:await (await fetch('assets/amenity-plans.json')).json()};
    });
    const checks={};
    for(const section of report.catalog.sections){
      await page.evaluate(s=>window.ui.setSection(s),section.id);
      for(const feature of section.features){
        await page.locator('select').selectOption(feature.id);
        const cue=await page.evaluate(()=>window.cues.at(-1));
        if(cue.id!==feature.id||!cue.target.every(Number.isFinite))throw Error('Selection mismatch '+feature.id);
      }
      checks[section.id]=section.features.length;
    }
    await page.evaluate(()=>window.ui.select('clubhouse-03'));
    await page.getByRole('button',{name:'View room study'}).click();
    await page.locator('.club-study-viewport canvas').waitFor();
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.evaluate(()=>window.ui.setSection('eco-deck'));
    await page.getByRole('button',{name:'Expand plan'}).click();
    await page.locator('dialog button[aria-label^="7. Water body"]').click();
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('button',{name:'Eye-level view'}).click();
    if(!(await page.evaluate(()=>window.cues.at(-1).eyeLevel)))throw Error('Eye-level cue failed');
    await page.getByRole('button',{name:'Guided tour'}).click();
    await page.getByRole('button',{name:'Stop tour'}).click();
    const alignment=await page.evaluate(()=>document.querySelector('.amenity-feature-title').textContent);
    if(alignment!=='Entrance')throw Error('Guided tour first stop mismatch');
    await page.setViewportSize({width:360,height:800});
    const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
    if(!fits||errors.length)throw Error(JSON.stringify({fits,errors}));
    delete report.catalog;
    const result={tested:new Date().toISOString(),...report,checkedFeatures:checks,expandedMapSelection:true,eyeLevelSelection:true,startedAndStoppedTour:true,clubStudyCanvas:true,fits360:true,exceptions:errors};
    fs.writeFileSync(path.resolve(__dirname,'../qa/amenity-models.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({gpu:report.gpu,checks,errors}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
