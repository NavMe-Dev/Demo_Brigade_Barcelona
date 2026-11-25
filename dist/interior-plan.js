const svgNS = 'http://www.w3.org/2000/svg';
function vector(tag, attrs) {
  const el = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}
export function installInteractivePlan(geometry, plan, visit) {
  const wrapper = document.querySelector('#planDialog .plan-image-wrap');
  const img = document.createElement('img');
  img.src = plan;
  img.alt = 'Source floor plan for ' + geometry.layout_code;
  const image = geometry.coordinate_system?.plan_image || {
    width: 890,
    height: 860,
    origin: [52, 60],
    pixels_per_meter: 51,
  };
  const sourceX = (x) => image.origin[0] + x * image.pixels_per_meter;
  const sourceY = (z) => image.origin[1] + z * image.pixels_per_meter;
  const frame = document.createElement('div');
  frame.className = 'interactive-plan-frame';
  const svg = vector('svg', {
    viewBox: '0 0 ' + image.width + ' ' + image.height,
    'aria-label': 'Select a room on the brochure plan',
  });
  const regions = new Map();
  for (const room of geometry.rooms) {
    const zone = vector('polygon', {
      points: room.polygon.map(([x, z]) => [sourceX(x), sourceY(z)].join(',')).join(' '),
      role: 'button',
      tabindex: 0,
      'aria-label': 'Take me to ' + room.label,
    });
    zone.addEventListener('click', () => visit(room.id));
    zone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        visit(room.id);
      }
    });
    regions.set(room.id, zone);
    svg.append(zone);
  }
  const entrance = geometry.navigation_nodes.find((n) => n.id === (geometry.entrance_node || 'entry'));
  if (entrance) {
    const mark = vector('circle', {
      cx: sourceX(entrance.position[0]),
      cy: sourceY(entrance.position[2]),
      r: 6,
      fill: '#a34c35',
      stroke: 'white',
      'stroke-width': 2,
      'pointer-events': 'none',
    });
    const title = vector('title', {});
    title.textContent = 'Entrance';
    mark.append(title);
    svg.append(mark);
  }
  const position = vector('g', {
    'aria-label': 'Your position and viewing direction',
    'pointer-events': 'none',
  });
  position.append(
    vector('path', { d: 'M0 -24L12 0H-12Z', fill: '#8f5328', stroke: '#fff8e9', 'stroke-width': 2 }),
    vector('circle', { r: 7, fill: '#493c2c', stroke: '#fff8e9', 'stroke-width': 3 }),
  );
  svg.append(position);
  frame.style.setProperty('--plan-ratio', image.width / image.height);
  wrapper.replaceChildren(frame);
  frame.append(img, svg);
  return (point, angle, room) => {
    position.style.display = point ? '' : 'none';
    if (point)
      position.setAttribute(
        'transform',
        'translate(' + sourceX(point[0]) + ' ' + sourceY(point[2]) + ') rotate(' + angle + ')',
      );
    for (const [id, zone] of regions) zone.setAttribute('aria-pressed', String(id === room));
  };
}
