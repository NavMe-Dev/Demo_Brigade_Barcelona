# Loading and rendering performance

## Geographic exterior

Chrome 158.0.8127.37 rendered the local project on Apple M2 through ANGLE Metal. Both builds used a cold cache, 20 Mbps downstream, 5 Mbps upstream and 40 ms network latency. The phone profile used a 390 × 844 viewport, touch input and device scale factor 2 on the same Mac. These are local browser measurements. Physical handset thermals, memory ceilings, mobile networks and live Esri transfer times were outside this run.

| Build and viewport | First usable control | First building draw | Camera movement | p95 interval | Transfer through neighborhood route | JS heap after return and GC |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Before, 1920 × 1080 | 1.42 s | 1.97 s | 60.0 FPS | 17.5 ms | 6.89 MB | 8.27 MiB |
| Before, 390 × 844 | 1.38 s | 1.88 s | 59.8 FPS | 17.6 ms | 6.09 MB | 7.10 MiB |
| After, 1920 × 1080 | 1.54 s | 2.05 s | 59.9 FPS | 18.6 ms | 12.07 MB | 9.77 MiB |
| After, 390 × 844 | 1.45 s | 1.95 s | 59.9 FPS | 17.7 ms | 10.32 MB | 8.26 MiB |

The first building draw is the first actual exterior WebGL frame above 10,000 triangles. The FPS sample counts completed exterior draws on the same 4.5-second camera path after the opening settles. Transfer includes the four neighborhood inspection stops and return. Heap is the renderer process’s JavaScript heap reported by Chrome after explicit collection. The raw files include additional heap snapshots, typed-array backing storage, resource counts and the GPU identifier. [Before measurements](../qa/gis-performance-before.json) · [After measurements](../qa/gis-performance-after.json)

### Streaming and memory

| Profile | Visible footprint tiles at settled overview | Highest resident footprint cache at four stops | Largest resident geometry buffer sample | Largest local imagery texture estimate | Exterior triangles at settled overview |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop | 70 | 92 tiles | 12.74 MiB | 4.59 MiB | 749,296 |
| Phone | 26 | 42 tiles | 4.67 MiB | 3.57 MiB | 206,442 |

The footprint limits are 70 visible and 92 cached tiles on desktop, or 33 visible and 42 cached tiles on phone. As the camera moved, the number of visible buildings changed, and the cache stayed inside its configured limit. Geometry byte counts sum the actual resident vertex and index typed arrays. Local imagery texture estimates include mip levels. Browser and GPU driver overhead is additional. Neither cold-load run requested an apartment GLB. [Configuration and implementation](../dist/geo-buildings.js) · [Tile and memory observations](../qa/gis-performance-after.json)

The distributed build rendered Copernicus Sentinel imagery without an ArcGIS key. A separate intercepted 403 response confirmed fallback to that source while Wing B remained selectable. A synthetic 256 px checkerboard validated the active ArcGIS protocol, shader, capped zoom and attribution. No provider credentials or live commercial pixels were used for those measurements or the archived screenshots. [Browser evidence](../qa/gis-browser.json) · [Independent geographic coverage checks](GEOGRAPHIC_COVERAGE_REPORT.md)

### Matched views

The wide opening, settled overview and outward neighborhood views retain the same camera and target coordinates, field of view, projection offsets and viewport for each before/after pair. The close neighborhood view looks away from the tower. The hero captures retain the original page controls and wide opening pose. Compared with the previous washed-out horizon, more mapped blocks and the lake shore are visible; the near ground remains soft at the bundled imagery’s nominal 10 m sample spacing. The block shapes describe footprints, and neighboring building heights can be estimated. [Desktop hero](../qa/evidence/gis/hero-desktop.png) · [Phone hero](../qa/evidence/gis/hero-phone.png) · [Desktop comparison](../qa/evidence/gis/desktop-comparison.webp) · [Phone comparison](../qa/evidence/gis/phone-comparison.webp) · [Original cameras](../qa/gis-before.json) · [New cameras](../qa/gis-after.json)

The manual city flight passed Hyderabad, Kokapet, Kokapet Lake and Neopolis before handing off to the building. The A3 deck uses the selected twentieth floor, qualifies its orientation and elevation, and returned to the geographic exterior. All 9999 sampled shared terrain edge positions had matching elevations. [City flight](../qa/evidence/gis/hyderabad-flight.png) · [Neopolis arrival](../qa/evidence/gis/neopolis-arrival.png) · [A3 deck](../qa/evidence/gis/a3-floor20-outlook.png) · [Sunset view](../qa/evidence/gis/sunset-exterior.png) · [Terrain and balcony checks](../qa/gis-browser.json)

### Reproduce

With the current local server running, use a Chrome-compatible Playwright installation. Set `PLAYWRIGHT_MODULE` to its absolute module path when required. The baseline used the pre-GIS release ZIP with SHA-256 `611a62eaa320e60c6489db64a055e953de9298b8c9b27c22cd87b8d55328b519`. Serve its extracted `dist` on another loopback port for the original measurements.

```sh
BRIGADE_QA_URL=http://127.0.0.1:5179/experience/ node scripts/capture_gis.cjs before
BRIGADE_QA_URL=http://127.0.0.1:5179/experience/ node scripts/measure_gis.cjs before
node scripts/verify_gis.cjs
node scripts/measure_gis.cjs after
node scripts/capture_gis.cjs after
python3 scripts/compare_gis.py
```

## Historical buyer-flow measurements

Before the GIS update, Chrome 158 on an Apple M2 Mac loaded the static site from its Python HTTP server. Chrome DevTools applied 20 Mbps downstream, 5 Mbps upstream and 40 ms latency with a cold cache. The test activated **Explore building**, then selected Wing B after the exterior rendered. Times start at navigation. The render sample counted actual exterior draws during a continuous 4.5-second camera move after loading settled. [Raw measurements](../qa/performance.json)

| Profile | Buyer control usable | Wing B selectable in 3D | Rendered FPS | Draws per frame | Visible triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1920 × 1080 desktop, detailed exterior | 1.66 s | 1.71 s | 60.0 | 204 | 567,835 |
| 390 × 844 phone emulation, compact exterior | 1.62 s | 1.67 s | 60.1 | 110 | 159,601 |

These pre-GIS measurements met the approximate 3-second UI and 8-second exterior targets. The mobile profile used the desktop GPU with touch emulation, a device scale factor of 2 and a scene pixel ratio of 1.35. These are two cold-load samples and one short moving-camera measurement per profile. They do not establish a 60 FPS result for physical phones.

In the pre-GIS test, the desktop profile transferred 6.88 MB and the compact profile 6.09 MB through the end of the measurement. Both requested zero apartment models. The test opened the interactive exterior. The regional map was available from Location. [Landing view checks](../qa/buyer-browser.json)

## Model and memory behavior

The pre-GIS build used a 743,332-byte detailed exterior, a 514,164-byte compact exterior and a 311,016-byte neighborhood GLB. Optimized residence GLBs range from 823,236 to 1,419,240 bytes and total 11,584,068 bytes across all 13. The runtime loads one residence on demand. Actual GPU measurements include an exterior with neighborhood and UI state, while the standalone component counts use a different camera and exclude those additions. [Component measurements](../qa/exterior-geometry.json) · [Apartment packages](../qa/apartment-assets.json)

A single browser session visited all thirteen designs and requested exactly thirteen corresponding GLBs. Each switch left one active interior WebGL context. The document remained loaded throughout. The geographic map disposes its independent context on exit. A3’s room navigation test measured frame intervals while turning the camera. B10’s internal arrival and panoramic reveal took 7.26 seconds after the exterior handoff. Additional model transfer and exterior approach time depend on cache, chosen floor and GPU. [Session test](../qa/residence-session.json) · [A3 viewport test](../qa/interior-browser.json) · [B10 animation](../qa/residence-motion.json)

Reproduce with the local server running and a Playwright installation resolvable by Node. Set `PLAYWRIGHT_MODULE` to an absolute installation path if necessary. Run `node scripts/measure_public.cjs`.

## November 27 architectural refresh

Hardware-backed Chrome on Apple M2 tested the revised assets at 20 Mbps downstream, 5 Mbps upstream and 40 ms latency with the browser cache disabled. The camera sample measures completed WebGL renders during a 4.5-second move after the initial sequence settles.

| Viewport and device scale | First usable control | First exterior draw | Mean camera FPS | p95 frame interval | Settled triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop, 1920 × 1080 at 1× | 1.41 s | 3.97 s | 59.9 | 17.7 ms | 1,709,127 |
| Emulated phone, 390 × 844 at 2× | 1.40 s | 3.01 s | 59.9 | 18.0 ms | 254,839 |

The desktop path reached the approximately 60 FPS target on this Mac. The emulated phone viewport used the low-detail model and the desktop GPU. The result leaves the physical mobile 30 FPS target unverified. The first live frame takes longer than the previous geographic release. The opening waits for the base terrain, lighting and selected initial assets before revealing the building.

After return from the neighborhood route and garbage collection, Chrome reported JavaScript heap usage of 10.20 MiB on desktop and 8.68 MiB in the emulated phone viewport. Peak typed-array backing storage in the recorded snapshots was 44.02 MiB and 25.21 MiB respectively. These measurements exclude GPU driver memory. [Raw refresh benchmark](../qa/architectural-performance.json) · [Transfer sizes and profiles](ARCHITECTURAL_ASSET_MANIFEST.md)

## November 27 exterior rebuild

Chrome 158 on Apple M2 tested the shipped Auto profile with a disabled cache, 20 Mbps downstream, 5 Mbps upstream and 40 ms latency. The phone profile used the same Mac GPU with touch and the 390 × 844 viewport emulated. The FPS sample counts completed render calls during the 4.5-second camera move.

| Viewport | First usable control | First exterior frame | Mean camera FPS | p95 frame interval | Total transfer through location route |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1920 × 1080 desktop, 1× | 1.47 s | 4.49 s | 60.0 | 18.8 ms | 22.18 MB |
| 390 × 844 emulated phone, 2× | 1.45 s | 4.48 s | 60.0 | 18.3 ms | 14.36 MB |

The compact exterior is 3.63 MB with 23 embedded KTX2 images. The detailed exterior is 6.39 MB with 26 embedded KTX2 images and loads after the first desktop draw. Both use Meshopt and GPU instancing. The first draw and transfer costs increased relative to the earlier refresh. The benchmark covers the open geographic fallback and one host GPU. Physical phones, the Cinematic profile and authenticated Esri transfer were outside this run. [Raw benchmark](../qa/exterior-rebuild-performance.json)

## November 27 neighborhood rebuild

Chrome 158 on Apple M2 measured Auto quality with the same cold-cache network profile of 20 Mbps down, 5 Mbps up and 40 ms latency. The 390 × 844 phone run emulated touch and used the Mac GPU. The FPS values count draws during the established 4.5-second camera move.

| Viewport | First usable control | First exterior frame | Mean camera FPS | p95 frame interval | Total transfer through location route |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1920 × 1080 desktop, 1× | 1.48 s | 5.09 s | 59.8 | 18.9 ms | 25.09 MB |
| 390 × 844 emulated phone, 2× | 1.47 s | 5.07 s | 60.0 | 18.6 ms | 17.02 MB |

The startup frontage bundle is 10.3 KB plus the road index. Neighborhood and regional geometry bundles total 1.33 MB and load as the camera selects their tiles. The browser showed 59 road tiles in the desktop hero, 64 in Location and 15 on the emulated phone during the visual run. Road and material loading increased cold first-frame time by about 0.6 s compared with the preceding exterior build. These measurements cover the Sentinel fallback; physical devices and licensed Esri transfers remain unmeasured. [Raw benchmark](../qa/neighborhood-performance.json) · [Visual capture metrics](../qa/evidence/neighborhood-rebuild/capture.json)

## November 27 standalone showcase

Chrome 158 on Apple M2 measured Auto quality with a cold cache, 20 Mbps downstream, 5 Mbps upstream and 40 ms latency. The touch-emulated phone used the same host GPU. The frame-rate sample measures the 4.5-second moving camera view.

| Viewport | First usable control | First live exterior frame | Mean camera FPS | p95 frame interval | Full benchmark transfer |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1920 × 1080 desktop, 1× | 1.43 s | 6.50 s | 50.3 | 21.9 ms | 22.21 MB |
| 390 × 844 emulated phone, 2× | 1.44 s | 6.50 s | 59.9 | 20.1 ms | 14.74 MB |

Both trials recorded zero geographic data transfers. The initial golden-hour panorama now loads alongside the landscape instead of in a second network stage. File transfer for the complete benchmark decreased compared with the preceding neighborhood build, while the first live frame took longer and the desktop motion sample ran at a lower frame rate. Physical mobile performance and the Cinematic profile remain unmeasured. [Raw benchmark](../qa/showcase-performance.json)

## November 27 spatial apartment views

The live viewer borrows the compact exterior and existing illustrative landscape for the active apartment. It loads apartment models on demand, shares the exterior model’s geometry and textures, and disposes of the apartment-specific clipping materials when leaving. The two comparison previews render on demand in the same WebGL viewer.

Chrome 158 measured CPU wall time inside WebGL renderer calls on the local Mac at 1440 × 900. These timings include CPU submission and possible shader compilation or GPU stalls. They cannot establish GPU frame rate. Static controls used reduced motion and generated few samples. The exterior orbit used normal motion.

| Action | Calls sampled | Observed CPU render time |
| --- | ---: | --- |
| Exterior orbit | 133 | 2.5 ms median, 3.2 ms p95 |
| B14 dollhouse and section | 23 | p95 72.5 ms, maximum 220.0 ms |
| B14 walkthrough and lighting changes | 27 | p95 19.1 ms, maximum 247.9 ms |
| B14 bedroom window | 1 | 6.6 ms |
| B14 balcony | 1 | 3.3 ms |
| B14 floor switch | 2 | 2.6–2.7 ms |
| B14 comparison | 4 | 1.5–1.9 ms |

The interactions include first-use spikes when entering the new rendering modes. Across 13 layouts, floor switching took 26–52 ms from selecting the floor until two animation callbacks completed. The B14 comparison produced both previews in 66 ms. Sampled window scenes submitted about 1.21–1.47 million triangles and 392–467 draw calls. The 390 × 844 mobile view used browser touch emulation. Physical device timing and GPU timer-query measurements remain outstanding. [Raw measurements](../qa/evidence/spatial-views/report.json)

## November 27 live Esri hybrid environment

Chrome 158 measured the configured World Imagery and World Elevation integration after the other browser suites had completed. Each profile ran a full 24-second orbit with a fixed target. The browser used the local Mac GPU. The phone profile emulated a 390 × 844 touch screen at 2× device scale. These are completed-render intervals from requestAnimationFrame and the renderer frame counter.

| Profile | First exterior ready | Mean rendered FPS | p95 interval | p99 interval | Intervals over 25 ms | Final draw calls | Final triangles | JS heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1440 × 900 desktop | 6.158 s | 60.00 | 16.7 ms | 16.8 ms | 0 | 458 | 3,987,612 | 160.2 MB |
| 390 × 844 touch emulation | 5.628 s | 60.00 | 16.7 ms | 16.8 ms | 0 | 193 | 928,636 | 112.5 MB |

Both runs displayed actual ArcGIS imagery, reaching zoom 18 on desktop and 17 on the phone profile. The imagery cache caps native refinement at the verified local level 19. The World Elevation sampling phase took 5.219 seconds on desktop and 4.761 seconds in the phone run. Each sampled 4,225 points in 45 requests before building the shared ground, road and footprint meshes. First-ready timings include that network work, measured on the unthrottled local server. The broader capture run observed a 6.922-second elevation load. The no-key fallback reached its first rendered exterior in 881 ms in a separate capture run.

The desktop endpoint held 716 geometries and 76 textures according to Three.js. The phone endpoint held 379 geometries and 47 textures. These counts and JS heap snapshots do not measure GPU memory. Physical phone frame delivery remains unverified. [Live frame and loading measurements](../qa/evidence/hybrid-environment/report-performance-live.json) · [Fallback measurements](../qa/evidence/hybrid-environment/report-performance.json) · [Live browser captures](HYBRID_QA.md)
