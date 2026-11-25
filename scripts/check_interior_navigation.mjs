import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeNavigator} from '../dist/navigation.js';

const data = file => JSON.parse(readFileSync(new URL('../dist/assets/'+file,import.meta.url)));
const geometry=data('apartment-geometry.json');
const furniture=data('furniture-colliders.json');
const nav=makeNavigator(geometry,furniture);
let directedRoutes=0;
for (const from of geometry.navigation_nodes) {
  for (const to of geometry.navigation_nodes) {
    const route=nav.route(from.position,to.id);
    assert.ok(route,from.id+' to '+to.id);
    for(let i=1;i<route.length;i++) assert.ok(nav.lineClear(route[i-1],route[i]),from.id+' to '+to.id);
    directedRoutes++;
  }
}
const slider=geometry.openings.find(o=>o.type==='sliding_door');
const p=slider.a.map((v,i)=>v+.1*(slider.b[i]-v));
assert.equal(nav.canStand(...p),false);
assert.equal(nav.canStand(...slider.center),true);
const rail=geometry.railings[0];
assert.equal(nav.canStand((rail.a[0]+rail.b[0])/2,(rail.a[1]+rail.b[1])/2),false);
assert.equal(nav.canStand(-1,4),false);
for(const node of geometry.navigation_nodes)assert.ok(nav.canStand(node.position[0],node.position[2]));
const report={status:'pass',nodes:nav.nodes.size,directedRoutesIncludingIdentity:directedRoutes,
 capsuleRadiusMetres:nav.radius,furnitureBoxes:furniture.boxes.length,
 checks:['All authored points and each segment of every directed graph route are collision-free.',
 'The partial sliding-glass panel blocks movement and its clear opening admits the camera.',
 'The deck rail and a point outside the footprint block movement.']};
writeFileSync(new URL('../qa/interior-navigation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(report);
