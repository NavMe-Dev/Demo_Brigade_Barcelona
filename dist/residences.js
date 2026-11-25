import {matchingLayouts, designsOnFloor} from './project-data.js';

const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==null)e.textContent=text;if(cls)e.className=cls;return e;};
const button=(text,fn,cls)=>{const b=element('button',text,cls);b.type='button';b.onclick=fn;return b;};
const fmt=n=>n.toLocaleString('en-IN');
export const configuration=a=>a.bedrooms+' BHK'+(a.has_study?' + study':'');
export const defaultFilters=()=>({wings:[],configs:[],floors:[],sbaMin:0,sbaMax:Infinity,carpetMin:0,carpetMax:Infinity});
function chipGroup(parent,title,choices,set,current,update){
 const g=element('fieldset',null,'filter-group');g.append(element('legend',title));
 const row=element('div',null,'filter-chips');
 for(const [value,name] of choices){
  const b=button(name,()=>{
    const old=current[set];
    current[set]=value==null?[]:old.includes(value)?old.filter(v=>v!==value):[...old,value];
    for(const c of row.children)c.setAttribute('aria-pressed',String(c.value==='all'?!current[set].length:current[set].some(v=>String(v)===c.value)));
    update();
  });
  b.value=value??'all';b.setAttribute('aria-pressed',String(value==null?!current[set].length:current[set].includes(value)));row.append(b);
 }
 g.append(row);parent.append(g);
}
function range(parent,name,lo,hi,filters,update){
 const set=element('fieldset',null,'range-group');set.append(element('legend',name+' · sq ft'));
 for(const [key,label,initial] of [[lo,'Minimum',0],[hi,'Maximum',Infinity]]){
  const l=element('label',label),input=element('input');input.type='number';input.min='0';input.inputMode='numeric';input.placeholder=label==='Minimum'?'Min':'Max';
  input.ariaLabel=name+' '+label;input.value=Number.isFinite(filters[key])&&filters[key]!==0?filters[key]:'';
  input.oninput=()=>{filters[key]=input.value===''?initial:Math.max(0,input.valueAsNumber);update();};l.append(input);set.append(l);
 }parent.append(set);
}
export function mountFilters(root,{project,filters,selected,onResults,onChoose}){
 const form=element('div',null,'residence-filters');
 const filtersMore=element('details',null,'more-filters');filtersMore.append(element('summary','Floor and area filters'));
 const summary=element('p','', 'match-count');summary.setAttribute('role','status');
 const cards=element('div',null,'layout-cards');cards.setAttribute('aria-label','Matching layouts');
 let selectedCode=selected;
 function update(){
   let results=matchingLayouts(project,filters);
   const chosen=results.find(a=>a.code===selectedCode)||results[0];selectedCode=chosen?.code;
   summary.textContent=results.length+' matching '+(results.length===1?'layout':'layouts');
   cards.replaceChildren();
   for(const a of results){
     const b=button('',()=>{selectedCode=a.code;cards.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.code===selectedCode)));onChoose(a);},'layout-pick');
     b.dataset.code=a.code;b.setAttribute('aria-pressed',String(selectedCode===a.code));
     const img=element('img');img.src=a.plan;img.alt='';img.loading='lazy';const wrap=element('span');wrap.append(element('strong',a.code+' · '+configuration(a)),element('small',fmt(a.total_sba_sqft)+' sq ft SBA'));b.append(img,wrap);cards.append(b);
   }
   if(!results.length)cards.append(element('p','Adjust a filter to see more layouts.','panel-note'));
   onResults(chosen);
 }
 chipGroup(form,'Wing',[[null,'All wings'],['A','Wing A'],['B','Wing B']],'wings',filters,update);
 chipGroup(form,'Configuration',[['three','3 BHK'],['study','3 BHK + study'],['four','4 BHK']],'configs',filters,update);
 chipGroup(filtersMore,'Documented floors',project.templates.flatMap(t=>t.levels).sort((a,b)=>a-b).map(n=>[n,n===12?'12 · Refuge':String(n)]),'floors',filters,update);
 range(filtersMore,'Total SBA','sbaMin','sbaMax',filters,update);range(filtersMore,'Carpet area','carpetMin','carpetMax',filters,update);
 root.append(form,filtersMore,summary,cards);update();
}
export function modelCard(root,a,{details,onEnter,onSave,onCompare,onViewPlan,saved,compared,floor,onClose,onBuilding}){
 root.replaceChildren();if(!a)return;
 const heading=element('div',null,'panel-top');const copy=element('div');copy.append(element('p','WING '+a.wing+(floor?' · FLOOR '+floor:''),'estate-kicker'),element('h2','Residence '+a.code));
 heading.append(copy,button('×',onClose,'plain-icon'));heading.lastElementChild.ariaLabel='Collapse apartment details';
 const plan=button('',()=>onViewPlan(a),'design-preview');const img=element('img');img.src=a.plan;img.alt='Brochure floor plan for '+a.code;plan.append(img);
 const program=element('p',configuration(a)+' · '+a.washrooms+' washrooms','design-config');
 const areas=element('div',null,'estate-areas');
 for(const [name,val] of [['Total SBA',a.total_sba_sqft],['Total carpet',a.total_carpet_area_sqft]]){const d=element('div');d.append(element('strong',fmt(val)),element('span',name+' · sq ft'));areas.append(d);}
 const aux=element('div',null,'estate-aux');
 aux.append(button(saved.includes(a.code)?'Saved':'Save apartment',()=>onSave(a.code)),button(compared.includes(a.code)?'Remove comparison':'Add to compare',()=>onCompare(a.code)));
 aux.append(button('Back to building',onBuilding));
 root.append(heading,program,plan,areas,element('p','Brochure page '+a.source_pdf_page+' · Illustrative 3D interior','source'),button('Explore apartment in 3D',()=>onEnter(a.code),'estate-action'),aux);
}
export function mountCompare(root,{project,ids,onToggle,onOpen,onPlan,balconies,previews}){
 if(!ids.length)root.append(element('p','Choose up to three designs to compare their rooms, areas and floor plans.','panel-copy'));
 const grid=element('div',null,'comparison-grid');
 if(ids.length)root.append(grid);
 for(const code of ids){
  const a=project.layouts.find(x=>x.code===code);if(!a)continue;const row=element('section',null,'compare-design');const head=element('div',null,'compare-head');
  head.append(element('h3',a.code+' · Wing '+a.wing),button('Remove',()=>onToggle(code)));row.append(head,element('p',configuration(a),'panel-label'));
  const dl=element('dl',null,'compare-facts');
  for(const [name,v] of [['Total SBA',fmt(a.total_sba_sqft)+' sq ft'],['Carpet area',fmt(a.total_carpet_area_sqft)+' sq ft'],['Bedrooms / washrooms',a.bedrooms+' / '+a.washrooms],['Study',a.has_study?'Yes':'No'],['Balcony / deck',balconies?.[code]||'Shown on source plan']])dl.append(element('dt',name),element('dd',v));
  const actions=element('div',null,'comparison-previews');for(const [label,src,fn] of [['Floor plan',a.plan,()=>onPlan(a)],['3D preview',previews?.[code]||a.plan,()=>onOpen(code,'dollhouse')]]){
    const b=button('',fn);const img=element('img');img.src=src;img.alt='';b.append(img,element('span',label));actions.append(b);
  }row.append(dl,actions);grid.append(row);
 }
 if(ids.length<3){const label=element('label','Add a layout');label.htmlFor='compareChoice';const select=element('select');select.id='compareChoice';select.add(new Option('Choose a layout',''));for(const a of project.layouts.filter(a=>!ids.includes(a.code)))select.add(new Option(a.code+' · '+configuration(a),a.code));select.onchange=()=>{if(select.value)onToggle(select.value);};root.append(label,select);}
}
