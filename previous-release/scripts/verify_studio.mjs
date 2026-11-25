// A fresh browser context per run leaves existing browser drafts untouched.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.BRIGADE_LOCAL_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const results=[];
 for(const [width,height] of [[390,844],[360,800],[820,1180]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/admin/');
  await page.getByRole('button',{name:'Add record'}).waitFor();
  await page.locator('#collection').selectOption('amenities');
  await page.getByRole('button',{name:'Add record'}).click();
  await page.getByLabel('Identifier',{exact:true}).fill('COURT');
  await page.getByLabel('Display name',{exact:true}).fill('Court preview');
  await page.getByLabel('Source citation',{exact:true}).fill('Local QA fixture');
  await page.getByLabel('Description',{exact:true}).fill('Concept for a local review.');
  await page.getByRole('button',{name:'Save draft'}).click();
  await page.getByText('Draft saved.',{exact:true}).waitFor();
  await page.reload();await page.locator('#collection').selectOption('amenities');
  await page.getByRole('heading',{name:'Court preview'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(width===390){
   await page.locator('#collection').selectOption('scene_assets');await page.getByRole('button',{name:'Add record'}).click();
   await page.getByLabel('Identifier',{exact:true}).fill('SHELL');
   await page.getByLabel('Display name',{exact:true}).fill('A3 review');
   await page.getByLabel('Source citation',{exact:true}).fill('Repository source GLB');
   await page.locator('input[type=file]').setInputFiles(fileURLToPath(new URL('../dist/assets/apartment-a3.glb',import.meta.url)));
   await page.getByRole('button',{name:'Save draft'}).click();await page.getByRole('heading',{name:'A3 review'}).waitFor();
  }
  await page.getByRole('button',{name:'Review & publish'}).click();await page.getByRole('button',{name:'Create preview'}).click();
  await page.getByText('Preview created from the current draft.').waitFor();await page.getByRole('button',{name:'Open buyer preview'}).click();
  await page.waitForURL(/studio-preview=/);
  const release=await page.evaluate(async()=>(await import('/sales.js')).loadPublication());
  assert.equal(release.manifest.amenities[0].title,'Court preview');
  assert.equal(release.manifest.apartment_types.length,13);
  assert.equal(await page.evaluate(async()=>(await import('/sales.js')).salesConnected()),false);
  await page.locator('#estateMenu').click();await page.getByRole('button',{name:'Review draft collection'}).click();
  await page.locator('#releaseCollection select').selectOption('amenities');
  await page.getByText('COURT · Court preview',{exact:true}).click();await page.getByText('Concept for a local review.',{exact:true}).waitFor();
  if(width===390){
   await page.locator('#releaseCollection select').selectOption('scene_assets');
   await page.getByText('SHELL · A3 review',{exact:true}).click();
   await page.getByRole('button',{name:'View asset',exact:true}).click();await page.locator('#releaseCollection canvas').waitFor();
   assert.ok(await page.locator('#releaseCollection canvas').evaluate(c=>c.width>10 && c.height>10 && !!c.getContext('webgl2')));
  }
  assert.deepEqual(errors,[]);
  results.push({viewport:[width,height],saveReloadPreview:true,reviewedSource:true,liveSalesInPreview:false,uploadedGlbRendered:width===390?'WebGL2':'not exercised',pageErrors:errors});
  await page.context().close();
 }
 console.log(JSON.stringify({browser:await browser.version(),service:'browser-local IndexedDB studio',results},null,2));
}finally{await browser.close()}
