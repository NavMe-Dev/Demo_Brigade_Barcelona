# A3 apartment master

The furnished interior retains the source-traced, metre-scale apartment and reviewed navigation graph in `dist/assets/apartment-geometry.json`. Open `models/apartment-a3.blend` in Blender 4.3.2 to inspect the furnished scene, cameras, packed materials, presentation lights and diffuse irradiance atlas. The deployable home is `dist/assets/apartment-a3-web.glb`. The original uncompressed `apartment-a3.glb` remains the reproducible input mesh.

## Rebuild

Install Blender 4.3.2, Python 3 with NumPy and Pillow, and the native gltfpack 1.0 CLI with Basis Universal support. Run from the project root. The gltfpack WebAssembly npm CLI and the native distribution have different texture encoder capabilities.

```sh
python3 scripts/finish_apartment.py /tmp/brigade-a3-dressed.glb
BRIGADE_INTERIOR_GLB=/tmp/brigade-a3-dressed.glb \
BRIGADE_BAKED_GLB=/tmp/brigade-a3-baked.glb \
BRIGADE_BLEND_PATH="$PWD/models/apartment-a3.blend" \
blender -b -t 4 --python scripts/render_room_views.py
gltfpack -cc -ce ext -vtf -tc -tj 2 -kn -km -ke \
  -i /tmp/brigade-a3-baked.glb -o dist/assets/apartment-a3-web.glb
blender -b models/apartment-a3.blend -t 4 --python scripts/render_dollhouse.py
```

The finish pass maps the supplied surfaces to real-scale marble, timber and bouclé textures, creates folded linen panels at bedroom windows, and computes floor contact occlusion from the traced walls and furniture bounds. The Blender pass unwraps the shell into a 1024² atlas and bakes direct and indirect diffuse illumination with Cycles. The web renderer uses the baked shell map for indirect illumination and occlusion, with independently adjustable day and evening lights, dynamic shadows, and a prefiltered sky HDR environment (plus a procedural room environment during loading). The original collision footprint and ceiling/wall visibility groups carry through export.

The thirteen WebP room views come from the same dressed model. Each has a camera position, look direction, room ID and byte count in `dist/assets/room-views.json`. The thumbnail strip, still-image fallback and live walkthrough use the same room identifiers. The labelled roof-off overview is rendered separately from the same editable master.

The deck button loads the separate mapped neighborhood. The camera uses a representative 70 m offset above the neighborhood plane. Its height, orientation and outlook illustrate a possible experience. No apartment unit, floor, bearing or future view has been verified.

## Browser verification

Run a static server with `dist` as its root and install Playwright with a local Chrome channel available. The test exercises the app through the served HTML and writes real renderer and browser measurements to `qa/interior-browser.json`. Override the origin or Playwright installation with `BRIGADE_QA_URL` and `PLAYWRIGHT_MODULE` when needed.

```sh
node scripts/check_interior.mjs
node scripts/check_interior_navigation.mjs
python3 scripts/validate_model_navigation.py
```
