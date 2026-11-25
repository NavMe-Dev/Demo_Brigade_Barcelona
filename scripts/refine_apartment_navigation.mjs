import { readFile, writeFile, readdir } from 'node:fs/promises';
import { makeNavigator } from '../dist/navigation.js';
// Regenerate traversal edges after changing wall traces, portals or furniture.
const directory = new URL('../dist/assets/apartments/', import.meta.url);
for (const code of await readdir(directory)) {
  const file = new URL(code + '/geometry.json', directory),
    data = JSON.parse(await readFile(file)),
    boxes = JSON.parse(await readFile(new URL(code + '/colliders.json', directory))),
    nav = makeNavigator(data, boxes);
  const targets = data.navigation_nodes.filter((n) => !n.id.startsWith('junction-'));
  const x0 = Math.min(...data.outline.map((p) => p[0])),
    z0 = Math.min(...data.outline.map((p) => p[1]));
  const step = 0.14,
    w = 1 + Math.ceil((Math.max(...data.outline.map((p) => p[0])) - x0) / step),
    h = 1 + Math.ceil((Math.max(...data.outline.map((p) => p[1])) - z0) / step);
  const xyz = (i) => [
    +(x0 + (i % w) * step).toFixed(4),
    1.6,
    +(z0 + Math.floor(i / w) * step).toFixed(4),
  ];
  const free = Uint8Array.from({ length: w * h }, (_, i) => {
    const [x, , z] = xyz(i);
    return nav.canStand(x, z);
  });
  function visibleNode(pos, seen) {
    let best = -1,
      dist = Infinity;
    for (let i = 0; i < free.length; i++)
      if (free[i] && (!seen || seen[i] !== -1)) {
        const p = xyz(i),
          d = Math.hypot(p[0] - pos[0], p[2] - pos[2]);
        if (d < dist && nav.lineClear(p, pos)) {
          dist = d;
          best = i;
        }
      }
    return best;
  }
  const entry = targets.find((n) => n.id === data.entrance_node),
    start = visibleNode(entry.position),
    parent = new Int32Array(free.length).fill(-1);
  if (start < 0) throw Error('No entrance ' + code);
  const queue = [start];
  parent[start] = start;
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i],
      p = xyz(at);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
    ]) {
      const x = (at % w) + dx,
        z = Math.floor(at / w) + dz,
        n = z * w + x;
      if (x < 0 || x >= w || z < 0 || z >= h || !free[n] || parent[n] !== -1) continue;
      if (!nav.lineClear(p, xyz(n))) continue;
      parent[n] = at;
      queue.push(n);
    }
  }
  const missing = [],
    points = new Map(),
    edges = new Map(),
    nodes = structuredClone(targets);
  function add(a, b) {
    if (a === b) return;
    const key = [a, b].sort().join('/');
    edges.set(key, { a, b, bidirectional: true });
  }
  function waypoint(pos) {
    const key = pos.join('/');
    if (points.has(key)) return points.get(key);
    const id = 'junction-' + (points.size + 1);
    points.set(key, id);
    nodes.push({ id, position: pos, look_at: [pos[0] + 1, pos[1], pos[2]] });
    return id;
  }
  for (const target of targets) {
    if (target === entry) continue;
    const dest = visibleNode(target.position, parent);
    if (dest < 0) {
      missing.push(target.id);
      continue;
    }
    let at = dest,
      path = [target.position, xyz(dest)];
    while (at !== start) {
      at = parent[at];
      path.push(xyz(at));
    }
    path.push(entry.position);
    path.reverse();
    let id = entry.id;
    for (let i = 0; i < path.length - 1; ) {
      let j = path.length - 1;
      while (j > i + 1 && !nav.lineClear(path[i], path[j])) j--;
      const destination = j === path.length - 1 ? target.id : waypoint(path[j]);
      add(id, destination);
      id = destination;
      i = j;
    }
  }
  console.log(
    code,
    'reachable grid',
    queue.length,
    'of',
    free.filter(Boolean).length,
    'unreachable',
    missing,
    'graph',
    nodes.length,
    edges.size,
  );
  if (missing.length)
    throw Error(code + ' contains disconnected room destinations: ' + missing.join(', '));
  // Directly visible neighbors keep transfers between adjacent rooms short.
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i],
        b = nodes[j];
      if (
        Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]) < 5 &&
        nav.lineClear(a.position, b.position)
      )
        add(a.id, b.id);
    }
  if (process.argv.includes('--write')) {
    data.navigation_nodes = nodes;
    data.navigation_edges = [...edges.values()];
    await writeFile(file, JSON.stringify(data, null, 1) + '\n');
  }
}
