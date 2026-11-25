# Apartment source models and registration

The buyer can enter 13 brochure designs. The package includes 182 room destinations with corresponding Blender-rendered room views and one roof-off overview for each apartment. A3 retains its reviewed original graph and its existing asset paths. Each other design has its own metric trace, registered source sheet, constrained navigation graph, furnished model, Blender master and thumbnail set.

| Wing | Layout | Brochure page | Bedrooms | Washrooms | Additional room | Room destinations |
|---|---|---:|---:|---:|---|---:|
| A | A1 | 17 | 3 | 3 | Study | 14 |
| A | A2 | 17 | 3 | 3 | | 13 |
| A | A3 | 18 | 3 | 3 | | 13 |
| A | A4 | 18 | 3 | 3 | | 13 |
| A | A5 | 19 | 3 | 3 | | 13 |
| A | A6 | 19 | 3 | 3 | | 13 |
| A | A7 | 20 | 3 | 3 | Study | 14 |
| B | B8 | 20 | 3 | 3 | | 13 |
| B | B9 | 21 | 3 | 3 | | 13 |
| B | B10 | 21 | 4 | 4 | Puja, storage | 18 |
| B | B11 | 22 | 4 | 4 | Puja, storage | 18 |
| B | B12 | 22 | 3 | 3 | | 13 |
| B | B14 | 23 | 3 | 3 | Two closets | 14 |

## Architectural interpretation

The authoring drawings use the individual plan panels on brochure pages 17–23. Each plan sheet has a separately digitized perimeter, room partitions and named access points. The plotting frame is 840 pixels wide and starts 69 pixels below the top of the individual sheet at that scale. The delivered 1120 × 1584 source image uses the affine registration stored with the geometry. The origin and pixels per metre map 3D X and Z directly onto that sheet. Z increases down the drawing. The drawing compass is retained in the image.

Room dimensions are transcribed from the printed metric annotations. For a deck with several labelled returns, the displayed pair refers to its main seating section. Some bathrooms also have separately dimensioned compartments. Consult the printed plan for the complete dimension chains and unfinished-surface measurement notes. Area figures retain the brochure’s Total SBA and Total carpet area labels.

The model uses an approximate scale from the wall spans and printed bedroom dimensions. It includes traceable window and entry positions, sliding openings, partition walls, independent upper-wall and ceiling groups, deck railings and internal cupboards. Small wall returns, door reveals, shafts, built-in services and joinery are simplified. Doors are held open for navigation. Service shafts and external equipment ledges are excluded as walkable destinations. The three-metre ceiling and representative furniture are illustrative.

The paired plans for A4/A5, B8/B9 and B10/B11 repeat their respective room schedules. Each model still uses its own plan-space landmark coordinates, and each fallback image comes from that design’s master. Page 24 describes finish families. The illustrative web materials use the locally packaged CC0 fabric, marble and wood scans documented in [material sources](../models/materials/README.md).

## Files and reproduction

- `dist/assets/plans/CODE.webp` contains the full individual brochure sheet, its apartment label, area statements and drawing compass.
- `dist/assets/apartments/CODE/geometry.json` records the room outlines, source-page references, dimensions, freestanding furniture footprints, wall segments, portals, deck railings, camera nodes and graph. The package also contains the collider list, per-room views, GLB and WebP renders.
- `models/apartments/apartment-code.blend` contains the editable furnished scene, material imagery, presentation lights and the baked diffuse map. A3 uses `models/apartment-a3.blend`.
- `qa/apartment-assets.json` reports unique model hashes, byte sizes, triangle counts, source figures, room counts and render checks for all 13 layouts.
- [Source plan overlays](../qa/evidence/apartment-traces.webp) show traced structural walls in red, windows in green, doors in amber and camera routes in blue. [Dollhouse contact sheet](../qa/evidence/apartment-dollhouses.webp) shows all 13 masters from an elevated viewpoint.

Use Python with Shapely 2, Pillow, NumPy and PyMuPDF, Node.js, Blender 4.3.2 and the native gltfpack CLI with Basis Universal support. The supplied brochure is the input to the extraction step. The repository includes the registered sheets used for generation. The following commands rebuild the twelve additional layouts from the project root. Consult [A3 authoring](apartment-authoring.md) for the original layout’s pipeline.

```sh
python3 scripts/architectural/extract_plans.py "/path/to/Brigade Barcelona.pdf"
python3 scripts/architectural/trace_apartments.py
node scripts/refine_apartment_navigation.mjs --write
blender -b -t 4 --python-exit-code 1 --python scripts/architectural/build_apartments.py -- \
  A1 A2 A4 A5 A6 A7 B8 B9 B10 B11 B12 B14
blender -b -t 4 --python-exit-code 1 --python scripts/architectural/render_apartment_cameras.py -- \
  A1 A2 A4 A5 A6 A7 B8 B9 B10 B11 B12 B14
python3 scripts/architectural/validate_apartments.py
```

Set `GLTFPACK` to the native binary if it is outside the system path. Each Blender build constructs walls and openings, fits room furnishings with door clearance, unwraps the shell, bakes direct and indirect diffuse lighting, saves the packed authoring file, then emits the Meshopt/KTX2 GLB. The baked atlas is 512 × 512 in the twelve compact layouts. A3 retains its 1024 × 1024 atlas. The room render pass uses every camera’s saved position and look direction. Its separate overview pass hides walls above the cut height and the overhead fixtures.
