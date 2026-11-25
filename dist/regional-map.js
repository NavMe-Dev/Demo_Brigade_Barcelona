// The location map is loaded when a visitor opens the regional view.
const resource = path => new URL(path, document.baseURI).href;
const host = () => document.getElementById('regionalMap');
let modules, instance, loading, runId=0, marker, fading, registration;
function library() {
  if (!modules) modules=new Promise((resolve,reject)=>{
    const css=document.createElement('link');
    css.rel='stylesheet';css.href=resource('vendor/maplibre/maplibre-gl.css');
    const styleReady=new Promise((ok,fail)=>{css.onload=ok;css.onerror=fail;});
    const script=document.createElement('script');script.src=resource('vendor/maplibre/maplibre-gl.js');
    const scriptReady=new Promise((ok,fail)=>{script.onload=ok;script.onerror=fail;});
    Promise.all([styleReady,scriptReady]).then(()=>resolve(window.maplibregl)).catch(()=>{
      modules=null;script.remove();css.remove();reject(Error('Regional map renderer unavailable'));
    });
    document.head.append(css,script);
  });
  return modules;
}
function styleFor(data) {
 const imagery=o=>({type:'image',url:resource(o.image),coordinates:o.corners});
 return {version:8,sources:{region:imagery(data.region),neighborhood:imagery(data.neighborhood),
   context:{type:'geojson',data:resource(data.context)},parcel:{type:'geojson',data:resource(data.boundary)}},
   layers:[{id:'ground',type:'background',paint:{'background-color':'#a3a096'}},
   {id:'regional-aerial',type:'raster',source:'region',paint:{'raster-saturation':-.17,'raster-fade-duration':0}},
   {id:'neighborhood-aerial',type:'raster',source:'neighborhood',minzoom:12,paint:{'raster-opacity':['interpolate',['linear'],['zoom'],12,0,14,1],'raster-fade-duration':0}},
   {id:'roads',type:'line',layout:{visibility:'none'},source:'context',filter:['has','highway'],minzoom:13,paint:{'line-color':'#f6e7bf','line-opacity':.55,'line-width':['interpolate',['linear'],['zoom'],13,.65,18,3]}},
   {id:'parcel-fill',type:'fill',source:'parcel',paint:{'fill-color':'#bd6c50','fill-opacity':.52}},
   {id:'parcel-edge',type:'line',source:'parcel',paint:{'line-color':'#ffe4ab','line-width':2.5}}]};
}
async function ensureMap(data,onProject,id) {
 if(instance&&loading){await loading;return instance;}
 const lib=await library();if(id!==runId)return null;
 if(instance&&loading){await loading;return instance;}
 registration=data;
 const el=host();el.hidden=false;
 instance=new lib.Map({container:el,style:styleFor(data),center:data.region.center,zoom:12,
   maxBounds:[[78.20,17.20],[78.735,17.605]],maxZoom:19,minZoom:10,
   attributionControl:false,canvasContextAttributes:{antialias:false,powerPreference:'low-power'},maxTileCacheSize:28});
 const map=instance;
 const button=document.createElement('button');button.setAttribute('aria-label','Explore Brigade Barcelona');button.className='plot-pin';button.textContent='Brigade Barcelona';button.onclick=onProject;
 marker=new lib.Marker({element:button,anchor:'bottom',offset:[0,-3]}).setLngLat(data.projectCenter).addTo(map);
 loading=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Regional map timed out')),12000);
    map.once('load',()=>{clearTimeout(timer);resolve();});});
 await loading;return map;
}
const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
export async function openRegion(data,onProject){
 clearTimeout(fading);const id=++runId;
 const map=await ensureMap(data,onProject,id);if(id!==runId||!map)return;
 host().hidden=false;host().classList.add('map-visible','interactive');map.resize();
 map.stop();map.jumpTo({center:data.projectCenter,zoom:14.35,pitch:43,bearing:12});
}
export function locatePoint(lngLat,zoom=16) {
 if(instance)instance.easeTo({center:lngLat,zoom,pitch:48,duration:reduced()?0:900});
}
export function locateLocal([x,,z]){
 if(!registration)return;
 const d=registration,rad=Math.PI/180;
 locatePoint([d.projectCenter[0]+(x*d.eastXZ[0]+z*d.eastXZ[1])/(111320*Math.cos(d.projectCenter[1]*rad)),d.projectCenter[1]+(x*d.northXZ[0]+z*d.northXZ[1])/111320]);
}
export function hideMap(){
 ++runId;const el=host();el.classList.remove('map-visible','interactive');instance?.stop();clearTimeout(fading);
 fading=setTimeout(()=>{if(el.classList.contains('map-visible'))return;el.hidden=true;marker?.remove();instance?.remove();marker=null;instance=null;loading=null;},500);
}
