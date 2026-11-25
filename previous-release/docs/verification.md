# Verification and performance

Tested locally on 25 November 2026. The buyer journey ran in Chrome 158 with an Apple M2 WebGL2 context through ANGLE Metal. The tests clicked rendered facade geometry, observed selected scene state, entered the live apartment and navigated through the source plan. The browser reported no uncaught application or console errors during the live runs. A separate test forced WebGL failure and checked the fallback labels and requested room image.

[Exterior capture](../qa/evidence/exterior.webp) · [Mobile floor selection](../qa/evidence/floor.webp) · [Furnished living room](../qa/evidence/living.webp)

## Implementation and verification

| Phase | Working result | Evidence |
| --- | --- | --- |
| Sources and geometry | 26-page brochure audit, distinct verified and illustrative records, editable Blender masters and 13 plan sheets | [Architectural manifest](../dist/assets/architectural-manifest.json) |
| Exterior and geography | Detailed and mobile models, real terrain, satellite color, mapped roads and surrounding buildings. All 18 wing footprint components fall inside the HMDA parcel | [Geometry](../qa/exterior-geometry.json), [registration](../qa/parcel-registration.json) |
| Tower, floor and apartment selection | A real pointer selected a wing and floor. The floor band and source plate matched the selection. A7 was excluded on the refuge floor. Saving and design comparisons worked | [Buyer checks](../qa/buyer-browser.json) |
| Interior and walkthrough | A3 loaded on demand, the dollhouse transition reached the living room, and the plan moved the camera to the kitchen. Collision checks covered 841 directed node pairs, including identity routes | [Interior browser](../qa/interior-browser.json), [collision checks](../qa/interior-navigation.json) |
| Amenities, lighting and views | Day/evening controls, rooftop camera selection, room deep links, amenity art and a labelled simulated balcony outlook | [Buyer checks](../qa/buyer-browser.json), [interior checks](../qa/interior-browser.json) |
| Admin and database | Private upload, persisted draft, frozen preview and WebGL inspection of the uploaded model. The SQL migration, permissions, tenant boundaries, consent, audit, publication and rollback passed 35 local PostgreSQL checks | [Studio](../qa/admin-browser.json), [database](../qa/database-security.json) |
| Responsive runtime | Desktop, two portrait phone sizes, landscape and tablet. The touch tests collapsed the sheet, selected a floor and verified that a two-finger pinch changed the camera | [Buyer checks](../qa/buyer-browser.json), [Gecko and WebKit](../qa/compatibility.json) |

## Measured budgets

The per-package transfer budget is 512 KiB for each exterior level and the neighborhood, and 1.5 MiB for the furnished apartment. Each file below includes its compressed mesh data. The apartment also contains eight KTX2 textures, including baked indirect lighting.

| Package | Delivered bytes | Loading behavior |
| --- | ---: | --- |
| exterior-lod.glb | 252,008 | Framing the initial scene, mobile and distant views |
| exterior.glb | 428,556 | Desktop close views |
| neighborhood.glb | 310,996 | Separate context after the exterior |
| apartment-a3-web.glb | 1,419,240 | On entry or apartment deep link |

The local frame pacing target was a p95 browser animation interval below 33.3 ms during motion. Chrome sampled consecutive animation frames over 2.5 seconds of the introduction. Timings include the host display scheduler. The terrain-ready measurement starts at navigation and includes local transfer, scene parsing and terrain texture decoding.

| Viewport | Rendered exterior detail | Terrain ready on localhost | Intro p95 | Triangles at settled view, including context |
| --- | --- | ---: | ---: | ---: |
| 1440 × 900 | full | 199 ms | 16.8 ms | 565,015 |
| 390 × 844 | low | 235 ms | 16.7 ms | 140,569 |
| 360 × 800 | low | 197 ms | 16.7 ms | 140,569 |
| 820 × 1180 | low | 330 ms | 16.8 ms | 140,569 |
| 844 × 390 | low | 240 ms | 16.8 ms | 140,569 |

The finished A3 moving-camera p95 ranged from 16.7 to 16.8 ms in the five interior profiles. The Chrome DevTools heap sample was 8.01 MiB before entering A3, 9.68 MiB after returning once and 9.68 MiB after four additional round trips with forced garbage collection. The runtime retains the loaded scenes for re-entry. These measurements cover JavaScript heap and a short local run. GPU and driver memory, long-session stability and consumer-network startup need separate measurements.

## Remaining release checks

Firefox rendered both scenes with WebGL2 across the five viewport profiles. The installed macOS WebKit runtime rendered the exterior, the interior and the source plan at 390 × 844. Phone sizes and touch gestures used desktop hardware. No physical iOS or Android device was available for thermal, touch latency or frame-pacing measurements. The WebKit check used WKWebView. Safari app automation was unavailable.

The PostgreSQL checks used PGlite with local Auth-role and Storage-metadata fixtures. The hosted Supabase authentication, gateway and object-storage flow still needs verification against the operator's selected environment. Architectural sign-off, actual unit sales records, finished-floor elevations and a verified balcony camera location also remain open. The supplied runtime uses clearly labelled concept geometry and demonstration designs.

## Repeat the checks

Start the server from the repository root. With Playwright and a Chrome executable available, run the buyer test using the paths on the test machine.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node qa/browser-check.cjs
node scripts/check_interior_navigation.mjs
```

The [apartment guide](apartment-authoring.md), [studio guide](../supabase/README.md) and [model guide](../models/README.md) describe their independent checks and tool versions.
