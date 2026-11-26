# Architectural rendering

The reconstruction uses the six [supplied views and developer brochure](ARCHITECTURAL_REFERENCE_ANALYSIS.md). The [Blender masterplan](../models/masterplan.blend) and the browser scene share the registered footprint, both wing envelopes and the checked-in amenity coordinates.

- The terracotta upper bays use deep, punched glazing. The ivory bays use wider balcony openings, interior shadow surfaces, slab edges and inset tinted guards. Layered mouldings define the stepped crowns. The B10-facing crown sign uses a crop of the logo panel on brochure page 3.
- The podium uses staggered clay screen geometry at close range. The clubhouse has three raked glazing assemblies, segmented copper fascia and a roof terrace with a lowered pool bed, clear edge and separate deck furniture.
- The Sky Deck has planted islands, modeled leaves, stone frames, garden spheres and a warm evening accent light. The Eco Deck includes inlaid paths, a curved seating detail and a fire garden. The app also retains the plan-based amenity tours.
- The browser uses ACES, a shared CC0 sky HDR, textured roughness and normals, adaptive pixel ratio and four simulated Hyderabad lighting presets. Close clubhouse views animate a small normal texture for ripples. The pool reflection uses the existing environment map. The Performance profile reduces render resolution, shadows and exterior geometry.
- The live 3D scene waits for its first terrain frame before revealing the building. The home intro starts after the fade. The Masterplan panel adds an optional architectural flythrough and the individual amenity panels expose dedicated viewpoints.

## Reproduce

Run the texture generator with Python and Pillow, then export with Blender 4.5 and gltfpack. Environment variables permit exporting to a staging directory before replacing the browser assets.

```sh
python3 scripts/generate_architectural_textures.py
GLTFPACK=/path/to/gltfpack   BRIGADE_ASSET_OUTPUT=/tmp/brigade-assets   BRIGADE_MODEL_OUTPUT=/tmp/brigade-models   blender -b --python-exit-code 1 --python scripts/generate_exterior.py
npm run build
```

`render_architectural_views.py` uses the six poses in [architectural-views.json](../scripts/architectural-views.json). It generates 1920 × 1080 Cycles renders using HDR lighting and a directional sun. The web views use the matching camera poses, real GIS and the local solar presets. The two renderers produce different light transport and backdrops. Run the browser capture against the local app with Playwright and Chrome available.

```sh
blender -b models/masterplan.blend --python-exit-code 1   --python scripts/render_architectural_views.py -- qa/evidence/architectural-comparison
node scripts/capture_architectural_views.cjs
python3 scripts/compare_architectural_views.py
```

The texture maps are procedural. The browser uses dynamic shadows and environmental lighting. Per-surface baked shadow lightmaps and compressed KTX2 textures remain outside this implementation. See the [comparison](VISUAL_COMPARISON_REPORT.md) and [architectural limits](KNOWN_LIMITATIONS.md).
