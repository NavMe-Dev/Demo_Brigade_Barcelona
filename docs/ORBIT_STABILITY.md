# Exterior orbit and rendering stability

## Reproduction and diagnosis

The original Desktop recording is 17.13 seconds at 1308 × 954. AVFoundation decoded all 1,028 video frames and measured adjacent-frame differences. A visual sample covers the aerial drag, façade approach, changes of direction and return to a high angle. That recording shows the previous geographic build. The two comparison recordings below use the same architectural showcase, Chrome viewport, initial camera pose and automatic orbit route. The post-fix orbit deliberately takes 24 seconds.

- OrbitControls updated on pointer events and again in the exterior frame loop. Scripted flights also wrote to the same camera while the controls could still apply residual input. Wheel input during an active drag was ignored by the Three.js wheel handler.
- Wing labels projected before the camera's world matrix was refreshed. During a moving render this gave the DOM anchors the previous camera pose. The labels also lacked occlusion and overlap checks.
- The compact GLB packs the old frontage under `Low_Courts_pergolas_and_approach`. The existing filter checked only the immediate parent, so the old approach surfaces and frontage stripes could remain visible over the showcase. Both compact and detailed GLBs were inspected for the relevant mesh, parent and material names. The original sports courts and entry drive use separate geometry.
- The floor and wing highlights extruded each traced bay and core rectangle independently. Intersecting rectangles produced stacked transparent faces and repeated edges. The replacement builds one perimeter from the rectangle union.
- Building LODs already had a distance buffer. Podium screens and vegetation switched at a single threshold, so small changes around the threshold could flip visibility repeatedly. The directional shadow projection was already fixed in world space and static shadow updates were already event-driven. There was no evidence that a moving shadow camera or a second active exterior render loop caused the issue.

## Changes

| File | Change |
| --- | --- |
| [estate-scene.js](../dist/estate-scene.js) | Single camera writer per exterior frame, bounded manual damping, authored timing, interruptible 24-second orbit, visibility and frame lifecycle, tighter depth range, current camera matrices for pins, footprint-union highlights, packed frontage filtering and screen LOD hysteresis |
| [exterior-orbit-controls.js](../dist/exterior-orbit-controls.js) | Accumulates pointer and wheel input, smooths zoom and makes damping depend on elapsed time |
| [showcase-landscape.js](../dist/showcase-landscape.js) | Hysteresis for plant detail and distance visibility |
| [estate.js](../dist/estate.js) | Pause and resume control |
| [app.js](../dist/app.js) | Increased apartment near clip from 0.05 m to 0.10 m |
| [verify_orbit_stability.cjs](../scripts/verify_orbit_stability.cjs) | Browser checks for drag, zoom, transitions, touch and endurance |

The exterior far plane is 6.8 km, which contains the authored terrain and sky at supported distances. The shadows, foliage, façade meshes, and showcase roads remain visible. The loaded architecture LOD stays fixed during an automatic lap. The viewer uses the existing KTX2 mip chains, anisotropic filtering, and hardware anti-aliasing where enabled by the quality profile.

## Recordings and frame delivery

[Before](../qa/evidence/orbit-stability/before.webm) · [After](../qa/evidence/orbit-stability/after.webm) · [Decoded frame samples](../qa/evidence/orbit-stability/orbit-frames.jpg) · [Night wing selection](../qa/evidence/orbit-stability/night-wing.jpg)

Chrome 158 on the local Apple Silicon Mac measured completed renders at 1280 × 800. Render intervals come from animation-frame timestamps and the app's rendered-frame counter. A gap over 25 ms indicates a missed 60 Hz delivery interval. These figures measure browser frame delivery and do not isolate GPU execution time.

| Run | Mean rendered FPS | p95 | p99 | Gaps over 25 ms |
| --- | ---: | ---: | ---: | ---: |
| Before, recorded path | 44.1 | 33.4 ms | 33.4 ms | 204 |
| After, recorded path | 59.9 | 16.7 ms | 16.8 ms | 1 |
| After, 60-second endurance | 59.9 | 16.8 ms | 16.8 ms | 2 |
| After, 390 px touch emulation | 60.0 | 16.7 ms | 16.8 ms | 0 |
| After, 820 px touch emulation | 60.0 | 16.8 ms | 16.8 ms | 0 |

Two full endurance laps each covered 360° in approximately 24 seconds at constant elevation and target. The preceding 750 ms move to the orbit pose is separate. The endurance capture recorded approximately one camera pose update per displayed frame. Its last frame submitted 734 draw calls and 4.41 million triangles. The settled before/after capture endpoints each submitted 749 calls and 4.44/4.53 million triangles respectively. The 390 px and 820 px touch runs submitted 272/448 calls and 0.41/1.45 million triangles at their sampled endpoints. Endurance ended at 89.7 MB of browser JS heap with 396 geometries and 75 textures reported by Three.js. Touch JS heap samples were 64.3 MB and 60.8 MB. These are browser counters and JS heap snapshots. GPU memory remains unmeasured.

[Before telemetry](../qa/evidence/orbit-stability/before.json) · [After telemetry](../qa/evidence/orbit-stability/after.json) · [Endurance telemetry](../qa/evidence/orbit-stability/scenarios.json) · [Touch telemetry](../qa/evidence/orbit-stability/touch-performance.json)

## Regression results

- **Passed in Chrome** — Slow and fast drag in both directions, full 360° orbit, 60-second repeated orbit, aerial-to-street motion, rapid reversal, wheel zoom in and out during a drag, pause and resume, manual interruption, wing selection during movement, night lighting, touch drag and pinch at two viewport sizes, and B14 entry, window view and return. No uncaught page errors or GIS requests were recorded in the orbit run. [Orbit scenarios](../qa/evidence/orbit-stability/scenarios.json)
- **Passed after correction** — The first buyer run caught an opening sequence extended to 18.6 seconds by the manual frame clamp. Authored transitions now use visible elapsed time independently. The rerun passed all 53 buyer checks, all 13 residence checks, and all 13 spatial view checks. [Buyer report](../qa/evidence/orbit-stability/buyer.json) · [Residence report](../qa/all-residences.json) · [Spatial report](../qa/evidence/spatial-views/report.json)
- **Unverified** — Physical phone, tablet and trackpad hardware, GPU memory, and worst-case shimmering at every façade angle. Chrome pointer and wheel events and touch emulation were used. Source assets were checked through their Blender generators and exported GLB data. The authored Blender files were left intact.
