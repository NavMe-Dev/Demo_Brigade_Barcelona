# Brigade Barcelona — immersive buyer concept

A brochure-grounded proof of concept for an off-plan residential buyer experience. The source is a 26-page raster project brochure and a supplied promotional reference video. This is a **design and engineering concept**, not an architect-approved sales model or a deployed sales backend.

## What works

- Branded arrival using the supplied brochure's exterior artist's impression.
- One real generated GLB: **Unit 3 — Wing A**, a three-bedroom design on PDF page 18.
- Roof-off dollhouse controls and first-person room-to-room navigation with manual movement collision checks.
- A guided tour, interruptible movement, reduced-motion support and daylight/evening presentation.
- Source plan, factual room dimension labels, source artwork amenity gallery.
- Browser-only saved-home state and a local enquiry-note download. No enquiry is sent, and no visitor analytics are collected.
- A still-rendered overview and room-image fallback if WebGL is unavailable. The fallback is expressly labelled and does not pretend to be live 3D.

## Start locally

Run any static HTTP server with `dist/` as its document root. ES modules require HTTP, not `file://`.

```sh
python3 -m http.server 5173 --directory dist
```

Then open `http://localhost:5173/` in a modern browser with WebGL 2 support. No keys or external network services are needed. Three.js 0.180.0 and the required addons are bundled locally, with the MIT license in `dist/vendor/THREE-LICENSE.txt`.

If editing dependencies, use `npm ci` with the provided lockfile. The app is buildless; `dist` is its deployable source. No framework/server is required for this concept. The production architecture is documented in the separate project blueprint and database foundation.

## Files

```text
dist/
  index.html                Accessible scene shell and dialogs
  styles.css                Responsive appearance and reduced motion
  app.js                    Modes, camera, tours, UI and honest fallback
  navigation.js             Plan-space collision and graph navigation
  assets/
    apartment-a3.glb         Generated 3D model, metres / Y-up
    apartment-geometry.json Source trace, rooms, walls and reviewed graph
    furniture-colliders.json Conservative furniture collision bounds
    brochure-manifest.json  Thirteen source-backed plan labels and areas
    room-*.webp             Still room fallback rendered from the same model
    plan-a3.webp             Unaltered source-plan crop
  vendor/                   Pinned local Three.js modules
scripts/
  generate_model.py          Reproduce Blender geometry and GLB
  validate_model_navigation.py  Offline path/geometry checks
  render_room_views.py       Reproduce still fallback views
qa/
  model-navigation-validation.json  Root GLTFLoader and route verification
```

## Regenerate the model

Use Blender with its glTF exporter installed. The generator accepts explicit input and output paths; default paths are relative to this project.

```sh
blender -b --python scripts/generate_model.py -- dist/assets/apartment-geometry.json dist/assets/apartment-a3.glb
python3 scripts/validate_model_navigation.py
```

Inspect the generator and render script for the installed Blender version. GLB export preserves right-handed metres, Y-up, X right and Z down the paper plan. Visibility groups `ceiling`, `walls_upper` and `lighting_fixtures` switch between dollhouse and walkthrough.

## Important source boundaries

The brochure states **2,790 sq ft TOTAL SBA** and **1,873 sq ft TOTAL CARPET AREA** for A3. Keep these labels separate. It gives metric room dimensions from unfinished surfaces excluding plaster/tile; it does not independently establish a regulatory carpet measurement. The hand trace, wall thickness, 3.0 m ceiling height, furniture, finishes, lighting and camera eye height remain illustrative.

A3 is a brochure design/stack label. It is not a verified apartment inventory identifier. Never infer 52 identical floorplates. The brochure typical floor plan is labelled for floors 17–20 and 22–26, with a separate refuge plan for floor 12.

This concept includes no actual floor inventory, prices, holds, bookings, payment processing, live CRM, exact balcony outlook or solar analysis. The proposed database and publication process are separate deliverables and have not been connected or applied to any external environment.

## Verification and remaining gates

The final GLB parsed successfully with the same Three.js GLTFLoader used by the app. It has 29 mesh primitives and 89,532 triangles and is 3,561,188 bytes. All 28 graph edges passed wall/furniture clearance checks; all 56 directed routes between the eight primary room destinations exist. This is approximate geometry verification, not architectural approval.

The available cloud browser has WebGL disabled. Desktop source-plan and room-image fallback flows and the 390×844 Chromium iframe arrival layout were visually checked. A later browser URL-policy restriction prevented further reload, saved-state and mobile interaction checks; a real GPU browser, Safari/iOS, Android, accessibility audit, interaction frame-rate testing and long-session memory checks remain release gates. No live WebGL browser pass is claimed.

## Production extension

Use a trusted API in front of the separate PostgreSQL foundation. Public clients receive only an approved immutable release manifest and an independently refreshed availability response. Source assets remain private. Validate every architectural source and exported model before sales publication. Do not expose database credentials or trusted tenant-setting functions to browser clients.
