# Buyer experience QA

Tests ran on November 25, 2026 against the locally served static application. Browser automation exercised actual model loading, camera movement, picking, controls and WebGL draws. Screenshots below record the appearance of those interactions.

| Coverage | Observed result |
| --- | --- |
| Landing view and location | Both entry points start at the wide exterior camera and play the 8.9-second building approach and orbit. The closer view is interactive when the move ends. Visitors can skip, replay or take control during the move. Reduced-motion visitors start at the wide still view. The regional map opens from Location. |
| Wings, floors and source plans | Both wings selected. Wing A floor 12 offered six layouts and an inert refuge in the A7 bay. The typical floor offered seven. The floor-22 B10 polygon opened its corresponding residence sheet. |
| Catalogue and comparison | OR within the configuration category and AND with wing and area filters produced the expected matches. Empty results, three-way comparison, source plans, previews, local saving and persistence across reloads passed. |
| Apartments | Thirteen public layout links loaded thirteen different model hashes. Every model rendered in WebGL2, exposed its correct source plan, furnished/unfurnished controls, four lighting presets, and top-down and isometric dollhouses. |
| Room navigation | All 182 room selections and corresponding image decodes passed. All 2,588 directed room pairs, including identities, passed collision validation. Interactive plan selection, directional position marker, click-to-move, keyboard movement and guided-tour pause/resume were checked. |
| Transitions | B10’s entry and panoramic reveal completed in 7.26 seconds from the interior handoff. All 342 sampled entry eye positions and 116 reverse positions passed the collision test. Both skip controls completed their transitions. |
| Outdoor facilities | The model/component harness exercised all 21 masterplan, 25 Eco Deck, 15 Sky Deck and 16 clubhouse entries. The public browser checks also moved at eye level, opened source drawings and exercised deck tours and conceptual clubhouse rendering. |
| Responsive input | Chrome exercised 360 × 800, 390 × 844, 430 × 932, 820 × 1180, 1180 × 820 and 1920 × 1080. Sheets collapsed, viewport height matched and touch pinch/drag changed the live camera. The apartment harness additionally covered phone landscape. |
| Compatibility | Firefox 159 exercised live exterior, floor, lighting, deck navigation and A3 on all six requested viewport sizes. System WKWebView exercised the exterior, Sky Deck, A3 and source-plan interactions at 390 × 844. Physical phone testing remains outstanding. |
| Recovery | Chrome with WebGL disabled deep-linked into B10 bedroom 3 using its own still, displayed the correct 18-region plan, selected the kitchen and returned to the building. An unknown room resolved to the living room. An invalid B13 link opened the collection. No GLBs were requested in the fallback. |

[Public journeys](../qa/buyer-browser.json) · [All residence results](../qa/all-residences.json) · [Amenity models](../qa/amenity-models.json) · [Browser compatibility](../qa/compatibility.json) · [Fallback](../qa/fallback.json)

In a clean source copy, Blender reproduced all twelve exterior, component and neighborhood GLBs byte for byte. The A1 authoring pipeline regenerated its baked model, 14 room stills and dollhouse overview. The corrected brochure extraction script reproduced all thirteen unit sheets and both floor plates byte for byte.

## Geographic exterior release

Hardware-backed Chrome checks covered the two entry points, the Hyderabad flight and skip, all three geographic data states, terrain alignment, wing and floor entry, shared apartment links, the balcony outlook and the direct return to Neighborhood. The authenticated tile test used generated pixels and asserted their presence in the framebuffer. Esri’s live point metadata and local tile availability were checked separately. The local preview and source ZIP default to open imagery. [Browser checks](../qa/gis-browser.json) · [360° orbit, street-camera and renderer-pause checks](../qa/gis-camera.json) · [Coverage findings](GEOGRAPHIC_COVERAGE_REPORT.md) · [Performance report](PERFORMANCE_REPORT.md)

The saved before-and-after camera poses and native renders include desktop and phone profiles. The opening images with the full interface are also supplied. [Desktop comparison](../qa/evidence/gis/desktop-comparison.webp) · [Phone comparison](../qa/evidence/gis/phone-comparison.webp) · [Desktop opening](../qa/evidence/gis/hero-desktop.png) · [Phone opening](../qa/evidence/gis/hero-phone.png)

## Screenshots

| Experience | Evidence |
| --- | --- |
| Arrival and exterior | [Regional map in Location](../qa/evidence/regional-map-1920.png) · [Desktop exterior](../qa/evidence/exterior-1920.png) · [360 px exterior](../qa/evidence/exterior-360.png) · [Tablet](../qa/evidence/exterior-820.png) |
| Selection and comparison | [Wing B plate](../qa/evidence/wing-b-floor-22.png) · [390 px refuge selection](../qa/evidence/refuge-390.png) · [Three-way comparison](../qa/evidence/comparison-1920.png) |
| Interiors | [Desktop A3 bedroom](../qa/evidence/a3-bedroom-1920.png) · [390 px A3 bedroom](../qa/evidence/a3-bedroom-390.png) · [B10 dollhouse](../qa/evidence/b10-dollhouse.png) |
| Source comparisons | [Registered architectural traces](../qa/evidence/apartment-traces.webp) · [Thirteen dollhouses](../qa/evidence/apartment-dollhouses.webp) |

## Reproduction

Run the static server, install Playwright with local Chrome/Firefox, and execute the checks from the repository root. `PLAYWRIGHT_MODULE` can identify an installed copy. The system WebKit harness requires macOS and Swift. The source-package command validates the final ZIP’s thirteen model fingerprints against the live browser evidence.

```sh
npm run build
node scripts/verify_buyer.cjs
node scripts/verify_residences.mjs
node scripts/check_residence_motion.mjs
node scripts/check_residence_session.mjs
node scripts/check_residence_fallback.mjs
node scripts/verify_amenities.cjs
node scripts/verify_compatibility.mjs
node scripts/measure_public.cjs
python3 scripts/package_source.py
```

## November 27 architectural refresh

Hardware-backed Chrome on Apple M2 passed the 53-check [public buyer regression](../qa/buyer-browser.json) with zero recorded browser errors. The suite exercised both entry URLs, opening skip and replay, both wings, the refuge and typical floor plates, B10, comparison, GIS navigation, shared apartment links, four solar modes and touch interaction across six responsive viewports.

The [refresh suite](../qa/architectural-refresh.json) passed the 1920 × 1080 desktop, 820 × 1180 touch tablet, 390 × 844 touch phone and 2560 × 1440 kiosk viewport checks. It also exercised the clubhouse pool, Sky Deck and Eco Deck presets, live quality switching, the A3 dollhouse and walk modes, the deep-linked Hyderabad arrival and skip, and missing terrain recovery with Retry 3D. The phone, tablet and kiosk viewport runs used the same Mac GPU. Physical-device testing remains outstanding.

[Six architecture comparisons](VISUAL_COMPARISON_REPORT.md) · [Browser and offline rendering method](PHOTOREALISTIC_RENDERING.md) · [Measured performance](PERFORMANCE_REPORT.md)

The [component harness](../qa/amenity-models.json) rendered each of the ten tested complete and component GLBs and selected every one of the 77 source-listed masterplan and amenity entries. Separate browser probes observed changing rooftop water-normal offsets on successive exterior frames and confirmed that the architectural flythrough could be stopped from its panel.

The [13-residence regression](../qa/all-residences.json) also passed after the refresh. Every documented unit opened its own rendered model and completed the room-route checks.

## November 27 exterior rebuild

The live Chrome capture checks confirmed both wing labels, the exterior presentation switch, desktop and touch-emulated mobile framing, and all six architectural viewpoints. The buyer suite passed 53 checks, and the residence suite loaded all 13 layouts in WebGL2. [Buyer run](../qa/exterior-rebuild-buyer.json) · [All residence results](../qa/all-residences.json)

See the [visual review](EXTERIOR_VISUAL_REVIEW.md) for the Cycles and browser comparison plates, the archived baseline and the remaining visual gaps.

## November 27 neighborhood rebuild

Chrome captured the hero, road, entrance, rear, street, golden-hour, night, Location and touch-emulated mobile views. The live camera completed a measured 360° orbit. The buyer suite passed 53 checks, including wing and floor selection, the regional map, saved comparisons, a live apartment share link and touch controls. The frontage geometry audit found full centerline coverage for both carriageways, zero public surface inside Plot 20 and zero measured gap between the illustrative drives and the carriageway. [Browser evidence](NEIGHBORHOOD_REBUILD.md#browser-review) · [Capture data](../qa/evidence/neighborhood-rebuild/capture.json) · [Geometry audit](../qa/neighborhood-road-geometry.json) · [Buyer regression](../qa/neighborhood-buyer.json)

## November 27 standalone architectural showcase

The updated buyer smoke suite passed all 53 checks, including the cinematic approach, reduced-motion hero, wing and refuge selection, property information, shared routes, comparisons and six viewport sizes. The residence suite passed all 13 layouts, including 182 room selections and their linked plans. The final browser capture exercised the designed landscape, lighting, exterior viewpoints, legacy routes and A3 balcony outlook and return. It recorded a 360° orbit with zero GIS requests. [Buyer run](../qa/showcase-buyer.json) · [Residence run](../qa/all-residences.json) · [Visual review](SHOWCASE_ONLY.md)

## November 27 map terrain restored

The default exterior again shows registered satellite terrain, mapped roads and nearby building footprints. The local Chrome morning view used Sentinel imagery. The browser verified the geographic A3 balcony outlook and return, the illustrative fallback with geographic assets blocked, and all 53 buyer regression checks. [Morning browser capture](../qa/evidence/map-restored/morning.jpg) · [Buyer run](../qa/map-restored-buyer.json)

## November 27 apartment and exterior integration

The spatial suite covers all 13 layouts in Chrome. For each layout it opens floor 25, follows a traced window viewpoint, switches to a documented lower floor, checks that the local camera remains fixed while the world elevation changes, follows the default balcony viewpoint and returns to the building. B14 also exercises floors 12, 20 and 25, same-eye comparison, the isolated dollhouse, the tower section, golden hour, night and a 390 × 844 touch-emulated viewport. The spatial suite recorded zero uncaught page errors and zero GIS requests. [Spatial run and captures](SPATIAL_ALIGNMENT.md#browser-evidence) · [Raw spatial run](../qa/evidence/spatial-views/report.json)

The 13-layout residence suite exercised the documented room routes, collision checks and room-to-plan links. The buyer suite passed 53 checks with zero uncaught page errors. The correspondence between individual apartment and exterior façade openings remains unverified because the exterior uses repeating proxy modules. [Residence run](../qa/all-residences.json) · [Buyer run](../qa/spatial-buyer.json) · [Architectural limitations](SPATIAL_ALIGNMENT.md#architectural-limitations)

## November 27 Esri and architectural terrain integration

The hybrid browser suite checks the registered origin, active DEM sampling, common patch edges, connected roads, architectural and geographic views, and all 13 apartment window and balcony routes. It includes live licensed imagery and elevation acceptance, synthetic protocol coverage, and service denial. The existing buyer suite passed 53 checks and the residence suite passed all thirteen layouts. The buyer suite explicitly validates the architectural fallback arrival, while the hybrid suite validates the licensed regional approach. [Current browser evidence and limitations](HYBRID_QA.md) · [Implementation and source qualifications](HYBRID_ENVIRONMENT.md)

## Residence interface refinement — November 27

The apartment interface now uses a consistent header, home summary, floor selector, viewpoint actions, room thumbnail strip and view-mode dock. Walking controls sit opposite the room card and hide while expanded home details are open. The selected thumbnail stays in view and exposes its pressed state. Compact portrait screens use a view-options disclosure. Geographic attribution remains visible when the interface is hidden.

Chrome captures were reviewed at 1600×950, 1366×768, 390×844, 320×568 and 844×390. These are desktop browser viewports, including phone emulation. The targeted interaction flow passed 17 checks with zero uncaught browser errors: floor selection, room navigation, two-floor comparison, expanded details, guided tour and pause, dollhouse, floor plan, interface visibility, compact view options and return to building. JavaScript syntax and the static build passed.

[Desktop](../qa/evidence/interior-ui/desktop.jpg) · [Phone](../qa/evidence/interior-ui/mobile.jpg) · [Compact phone](../qa/evidence/interior-ui/small-phone.jpg) · [Compact view options](../qa/evidence/interior-ui/small-phone-options.jpg) · [View comparison](../qa/evidence/interior-ui/compare.jpg) · [Dollhouse](../qa/evidence/interior-ui/dollhouse.jpg) · [Interaction results](../qa/evidence/interior-ui/interactions.json)

The subsequent footer cleanup replaces the full-width source strip with compact Esri attribution and a Map credits dialog. Twelve browser checks passed across the exterior, apartment and mobile `/experience/` route, including access while the interface is hidden, with no uncaught errors. [Updated desktop](../qa/evidence/interior-ui/no-strip-apartment.jpg) · [Updated phone](../qa/evidence/interior-ui/no-strip-mobile.jpg) · [Checks](../qa/evidence/interior-ui/credits-ui.json)
