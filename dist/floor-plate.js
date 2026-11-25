// Traces from the printed drawing and numbered key on brochure page 15.
// Coordinates use the same crop for both original source sheets: a 680 × 620
// rendering of x=45..385, y=94..404 on a 431 × 610 reference sheet.
// Each entry records the main envelope, terrace side, terrace span and outer edge.
const typical={
  A1:[407,26,520,126,'N',420,509,13],A2:[543,26,647,126,'N',556,633,13],
  A3:[543,149,647,244,'E',158,214,659],A4:[543,265,647,360,'E',273,329,659],
  A5:[543,382,647,477,'E',390,445,659],A6:[543,499,647,599,'S',557,620,612],
  A7:[405,499,520,599,'S',417,491,612],
  B8:[297,354,408,443,'S',312,385,456],B9:[160,354,270,443,'S',176,247,455],
  B10:[32,321,139,443,'W',332,424,18],B11:[32,170,139,293,'W',182,274,18],
  B12:[160,170,269,269,'N',180,257,157],B14:[297,170,408,267,'N',312,385,157]
};
const refuge={
  A1:[403,38,512,135,'N',415,502,25],A2:[535,38,635,135,'N',547,622,25],
  A3:[535,157,635,247,'E',165,219,646],A4:[535,270,635,361,'E',278,331,646],
  A5:[535,382,635,474,'E',390,444,646],A6:[535,496,635,593,'S',547,609,605],
  B8:[297,354,404,442,'S',312,383,454],B9:[165,354,271,442,'S',179,251,454],
  B10:[41,322,143,442,'W',335,424,28],B11:[41,177,144,296,'W',189,278,28],
  B12:[165,176,269,273,'N',184,257,164],B14:[296,176,404,271,'N',311,381,164]
};
function outline([l,t,r,b,side,a,z,edge]){
  const pts=[[l,t]];
  if(side==='N')pts.push([a,t],[a,edge],[z,edge],[z,t]);
  pts.push([r,t]);if(side==='E')pts.push([r,a],[edge,a],[edge,z],[r,z]);
  pts.push([r,b]);if(side==='S')pts.push([z,b],[z,edge],[a,edge],[a,b]);
  pts.push([l,b]);if(side==='W')pts.push([l,z],[edge,z],[edge,a],[l,a]);
  return pts;
}
function button(text,fn){
  const btn=document.createElement('button');btn.type='button';btn.textContent=text;btn.addEventListener('click',fn);return btn;
}
export function mountFloorPlate(container,{floor,wing,template,onSelect,onEnlarge}){
  if(!template?.levels.includes(floor))return null;
  if(!document.querySelector('link[data-floor-plate]')){
    const l=document.createElement('link');l.rel='stylesheet';l.href=new URL('./floor-plate.css',import.meta.url).href;l.dataset.floorPlate='';document.head.append(l);
  }
  const traces=floor===12?refuge:typical;
  const frame=document.createElement('figure');frame.className='floor-plate';
  const drawing=document.createElement('div');drawing.className='floor-plate-drawing';
  const source=document.createElement('img');source.src=template.plan;source.alt='Brochure page 15, '+(floor===12?'refuge':'typical')+' floor plan';drawing.append(source);
  for(const code of template.layouts){
    if(!traces[code])continue;
    const trace=outline(traces[code]);
    const xs=trace.map(p=>p[0]),ys=trace.map(p=>p[1]),l=Math.min(...xs),r=Math.max(...xs),t=Math.min(...ys),b=Math.max(...ys);
    const control=button('',()=>onSelect?.(code));control.className='floor-plate-bay';
    control.dataset.wing=code[0];control.dataset.activeWing=String(wing===code[0]);control.dataset.design=code;
    control.setAttribute('aria-label','Explore design '+code+' on floor '+floor);control.title='Wing '+code[0]+' · '+code+' · Floor '+floor;
    Object.assign(control.style,{left:l/680*100+'%',top:t/620*100+'%',width:(r-l)/680*100+'%',height:(b-t)/620*100+'%',
      clipPath:'polygon('+trace.map(([x,y])=>((x-l)/(r-l)*100)+'% '+((y-t)/(b-t)*100)+'%').join(',')+')'});
    const label=document.createElement('span');label.textContent=code;control.append(label);drawing.append(control);
  }
  if(floor===12){
    const tag=document.createElement('span');tag.className='floor-plate-refuge';tag.textContent='Refuge';drawing.append(tag);
  }
  const caption=document.createElement('figcaption');
  const info=document.createElement('span');info.textContent='Floor '+floor+' · Select a design';caption.append(info);
  if(onEnlarge)caption.append(button('Source sheet',()=>onEnlarge(template.plan)));
  frame.append(drawing,caption);container.append(frame);return frame;
}
