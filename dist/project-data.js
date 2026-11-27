const pending=new Map();
export function readJSON(path) {
 if(!pending.has(path))pending.set(path,fetch(new URL(path,document.baseURI)).then(r=>{
   if(!r.ok)throw Error('Project resource unavailable: '+path);
   return r.json();
 }).catch(e=>{pending.delete(path);throw e;}));
 return pending.get(path);
}
export async function getProject(){
 const index=await readJSON('data/project.json');
 const [catalog,scene,location,templates]=await Promise.all(['catalog','scene','location','templates'].map(k=>readJSON(index.resources[k])));
 const layouts=catalog.layouts.map(a=>({...a,id:a.code,plan:'assets/plans/'+a.code+'.webp',configuration:a.bedrooms===4?'four':a.has_study?'study':'three'}));
 return {index,layouts,scene,location,templates};
}
export function designsOnFloor(project,floor){
 if(floor==null)return project.layouts;
 const template=project.templates.find(t=>t.levels.includes(floor));
 return template?project.layouts.filter(a=>template.layouts.includes(a.code)):[];
}
export function matchingLayouts(project,filters){
 const allowed=filters.floors.length?new Set(filters.floors.flatMap(n=>designsOnFloor(project,n).map(a=>a.code))):null;
 const source=allowed?project.layouts.filter(a=>allowed.has(a.code)):project.layouts;
 return source.filter(a=>(!filters.wings.length||filters.wings.includes(a.wing))&&(!filters.configs.length||filters.configs.includes(a.configuration))
  &&a.total_sba_sqft>=filters.sbaMin&&a.total_sba_sqft<=filters.sbaMax&&a.total_carpet_area_sqft>=filters.carpetMin&&a.total_carpet_area_sqft<=filters.carpetMax);
}
export function compareIds(values,layouts){
 const codes=new Set(layouts.map(a=>a.code));
 return [...new Set(Array.isArray(values)?values:[])].filter(id=>codes.has(id)).slice(0,3);
}
