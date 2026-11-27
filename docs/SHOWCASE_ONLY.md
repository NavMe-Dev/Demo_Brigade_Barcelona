# Brigade Barcelona architectural showcase

Open the [live local building view](http://127.0.0.1:5173/?scene=towers) or the [opening cinematic](http://127.0.0.1:5173/). The property address is Plot No 20, Neopolis, Kokapet, Hyderabad, Telangana 500075, India.

The existing towers, clubhouse and apartment model files remain the architectural source. The separate setting uses designed hills and meadow terrain, a two-loop access network with a connecting route, and two drives attached at the brochure masterplan entry and exit markers. Textured asphalt, stone paving, raised kerbs, lane markings, roadside lamps, entry planters, textured specimen trees and ferns are part of the illustrative setting. The display label identifies the exterior as an artist’s impression. [Brochure reference board](../qa/evidence/exterior-rebuild/references/reference-board.jpg) · [Asset credits](../dist/assets/showcase/CREDITS.txt)

## Browser views

| View | Browser evidence |
| --- | --- |
| Golden-hour hero and comparison | [Hero](../qa/evidence/showcase-only/hero-golden-hour.jpg) · [Before and after](../qa/evidence/showcase-only/before-after.jpg) |
| Aerial and rear surroundings | [Masterplan](../qa/evidence/showcase-only/aerial-masterplan.jpg) · [Rear](../qa/evidence/showcase-only/rear-surroundings.jpg) · [360° orbit](../qa/evidence/showcase-only/orbit.jpg) |
| Road and arrival | [Front road](../qa/evidence/showcase-only/front-road.jpg) · [Main entrance](../qa/evidence/showcase-only/entrance.jpg) · [Street level](../qa/evidence/showcase-only/street.jpg) |
| Amenities | [Clubhouse](../qa/evidence/showcase-only/clubhouse.jpg) · [Rooftop pool](../qa/evidence/showcase-only/pool.jpg) · [Eco Deck](../qa/evidence/showcase-only/eco-deck.jpg) · [Sky Deck](../qa/evidence/showcase-only/sky-deck.jpg) |
| Night and mobile | [Night](../qa/evidence/showcase-only/night.jpg) · [Mobile](../qa/evidence/showcase-only/mobile.jpg) |

The browser starts with Golden hour, followed by a roughly 14.5-second landscaped approach and orbit on the main entry route. Skip settles on the hero and Replay starts at the wide camera. Reduced-motion users see the hero directly. The mobile Building sheet opens on demand. The four exterior lighting choices are Morning, Daylight, Golden hour and Night. The address panel and the apartment outlook work using local assets. Historic property and journey URLs resolve to property information or the Building view. [Runtime and network observations](../qa/evidence/showcase-only/capture.json)

The 10:22:27 a.m. screenshot was unavailable in the attachments and workspace. The comparison pairs the preceding archived live hero with the new live hero, which uses a slightly revised pose.

## Model, rendering and limitations

The [editable landscape master](../models/showcase-landscape.blend) and [landscape GLB](../dist/assets/showcase/landscape.glb) are separate from [the building master](../models/masterplan.blend). The landscape GLB uses Meshopt and KTX2. The planting placement list and instanced near and distant canopy batches load progressively. Performance and mobile Auto use the simplified canopy. Desktop Auto, High and Cinematic add the licensed approach specimens. Daylight shadows, contact, tone mapping and environment reflections run in the existing Three.js renderer.

Blender Cycles baked diffuse indirect illumination for the landscape terrain. The live browser binds it as a light map on the secondary UV set. The existing podium ambient-occlusion bake remains active. A complete indirect atlas for the towers, roads and amenity spaces is still outstanding. The scenery still falls short of the brochure’s photorealistic reference, particularly at close range in the planting, landscape material transitions, entrance entourage and horizon density. The distant canopy is simplified, and the scene uses stationary architectural fixtures. The setting and modeled road grades are illustrative, with documented project access points retained.

Rebuild the landscape with Blender 4.5 LTS and native gltfpack.

```sh
GLTFPACK=/path/to/gltfpack blender -b --python-exit-code 1 --python scripts/build_showcase.py
```

The retired GIS modules and licensed geographic assets are retained for historical reuse. [Archive index](../previous-release/gis/README.md)
