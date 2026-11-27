# Hybrid geographic environment validation

Chrome 158 tested the local application with configured Esri World Imagery and World Elevation. The actual screenshot gallery below uses the live geographic services. Separate no-key and HTTP 403 tests cover the architectural terrain fallback. Provider credentials are excluded from all reports.

The follow-up real-map correction narrows the authored ground transition to 8–32 m outside the parcel. The user's Wing B route loaded 61 live Esri tiles without request or script errors. A browser check held metadata to confirm the loading message, simulated an HTTP 403 to show **Retry map**, then restored live access through that button. The subsequent wider capture contained 62 actual tiles at level 18 with no uncaught errors. [Restored real-map view](../qa/evidence/hybrid-environment/real-map-restored.jpg) · [Browser checks](../qa/evidence/hybrid-environment/report-real-map-restored.json)

`node scripts/verify_imagery_recovery.mjs` passes 14 deterministic checks for stationary-camera metadata and tile recovery, request deadlines, bounded retries, manual recovery, authorization denial, reactivation and disposal. These use synthetic responses without credentials or external requests.

The local coordinate round-trip error was under 0.000007 m. The terrain audit sampled 213,444 vertices and 11,843 shared patch-edge vertices. The actual Esri-adjusted terrain had zero measured shared-edge error and zero difference from its active elevation sampler. These numerical checks establish mesh continuity. The geographic anchor, model orientation and vertical registration retain the source limitations described in the geographic report.

The thirteen apartment layouts each opened floor 25, navigated to a traced window, changed to a compatible lower floor while retaining the local eye position, entered the balcony viewpoint and returned to the building. The tests checked world-height changes and collision-tested viewpoint coordinates. These checks establish the implemented conceptual transformations. Exact correspondence to a coordinated exterior façade remains dependent on architectural drawings.

[Live capture results](../qa/evidence/hybrid-environment/report-licensed.json) · [All live apartment results](../qa/evidence/hybrid-environment/report-apartments-live.json) · [Fallback terrain and capture checks](../qa/evidence/hybrid-environment/report-capture.json)

| Requested view | Actual browser capture |
| --- | --- |
| Complete building hero | [Hero](../qa/evidence/hybrid-environment/hero.jpg) |
| Aerial masterplan | [Masterplan](../qa/evidence/hybrid-environment/aerial-masterplan.jpg) |
| Main entrance | [Entrance](../qa/evidence/hybrid-environment/main-entrance.jpg) |
| Connected front road | [Front road](../qa/evidence/hybrid-environment/front-road.jpg) |
| Rear surroundings | [Rear](../qa/evidence/hybrid-environment/rear-surroundings.jpg) |
| Street-level view | [Street](../qa/evidence/hybrid-environment/street-level.jpg) |
| Clubhouse | [Clubhouse](../qa/evidence/hybrid-environment/clubhouse.jpg) |
| Eco Deck | [Eco Deck](../qa/evidence/hybrid-environment/eco-deck.jpg) |
| Sky Deck | [Sky Deck](../qa/evidence/hybrid-environment/sky-deck.jpg) |
| Bedroom window | [B14 window](../qa/evidence/hybrid-environment/bedroom-window.jpg) |
| Balcony | [B14 balcony](../qa/evidence/hybrid-environment/balcony.jpg) |
| Golden-hour exterior | [Golden hour](../qa/evidence/hybrid-environment/golden-hour.jpg) |
| Night exterior | [Night](../qa/evidence/hybrid-environment/night.jpg) |
| Mobile viewport | [390 px touch emulation](../qa/evidence/hybrid-environment/mobile.jpg) |
| Hyderabad aerial and geographic arrival | [Regional aerial](../qa/evidence/hybrid-environment/hyderabad-aerial.jpg) · [Initial geographic arrival](../qa/evidence/hybrid-environment/geographic-arrival.jpg) |

The ArcGIS protocol test intercepts every service request with local metadata, tilemap and synthetic image responses. It verifies public browser-token authentication, GPU texture sampling, progressive tile loading and shader compilation. Fog is temporarily disabled during the synthetic-color framebuffer readback and immediately restored, allowing the sampler check to measure the fixture color independently of atmospheric tint. Both local and regional terrain loaded synthetic imagery through their respective caches. A separate HTTP 403 fixture verifies that denied geographic imagery retains the rendered architectural environment. Test pixels are excluded from the actual browser screenshot deliverables. The fixture establishes integration behavior. It provides no evidence of live licensed service delivery or photorealistic geographic appearance.

[Protocol and service-denial results](../qa/evidence/hybrid-environment/report-protocol.json)

Physical phone and tablet performance and exact surveyed building positions remain unverified. The material blending, footprint buildings and landscaping remain approximate architectural representations. [Coverage report](GEOGRAPHIC_COVERAGE_REPORT.md)

The regional test initially exposed an OrbitControls distance clamp that pulled the 17.5 km aerial pose inward. The regional camera range was corrected and the repeated test retained the aerial pose while loading regional tiles. The final exterior capture completed a full 360° orbit with a fixed target and one architectural LOD. One class-default footprint conflicting with the estimated frontage road surface is omitted from the context display and remains in the source dataset.

The final buyer regression passed 53 checks, and the existing residence suite passed all thirteen layouts. The initial hybrid suite recorded zero uncaught browser errors and no failed local asset responses. The no-key capture reached the first ready exterior in 881 ms on the unthrottled loopback server. These measurements do not represent a mobile network cold load.

After the other browser suites completed, isolated no-key orbit runs measured 60.00 rendered FPS at both 1440 × 900 desktop and 390 × 844 touch-emulated phone sizes. Both 24-second laps had 16.7 ms p95 and 16.8 ms p99 render intervals with zero intervals above 25 ms. The final desktop sample submitted 450 draw calls and 3.97 million triangles, with 116.8 MB of JS heap. The phone sample submitted 186 calls and 0.914 million triangles, with 101.9 MB of JS heap. These measurements use the Mac GPU and architectural terrain fallback. GPU memory and physical mobile frame delivery remain unmeasured. The earlier capture run overlapped another browser regression and measured 52.2 FPS, so the isolated benchmark is the representative figure for this machine. [Isolated benchmark](../qa/evidence/hybrid-environment/report-performance.json)

The live initial arrival opened at 17.5 km altitude, then settled at the configured architectural hero in 14.895 seconds from the first ready frame. Replay and Skip both passed. The final live capture recorded 62 visible imagery tiles at level 18 with a verified level-19 cap. The elevation source reported 4,225 samples from Airbus WorldDEM4Ortho, a 24.74 m source spacing and EGM2008 vertical datum. The captured elevation load took 6.922 seconds for 45 requests. [Initial arrival and controls](../qa/evidence/hybrid-environment/report-arrival.json) · [Live source and capture details](../qa/evidence/hybrid-environment/report-licensed.json)

The final isolated live-service orbit benchmark measured 60.00 rendered FPS on both desktop and touch-emulated phone profiles, with 16.7 ms p95 and 16.8 ms p99 intervals and zero intervals over 25 ms. Actual World Imagery and World Elevation remained active. The first exterior frame arrived in 6.158 seconds on desktop and 5.628 seconds on the phone profile, including elevation sampling. [Live performance and loading](PERFORMANCE_REPORT.md#november-27-live-esri-hybrid-environment) · [Raw measurements](../qa/evidence/hybrid-environment/report-performance-live.json)

A targeted B14 check delayed incoming imagery tiles while leaving the window camera stationary. Twenty-four tile responses arrived and interior draws advanced from 63 to 154 with an unchanged camera position. This verifies the asynchronous landscape invalidation path. Geographic attribution stayed visible in the apartment, after hiding the interface, and on the mobile exterior. The window, balcony and mobile screenshots were refreshed after the attribution correction. [Stationary window refresh](../qa/evidence/hybrid-environment/report-touchups.json) · [Attribution checks](../qa/evidence/hybrid-environment/report-attribution.json)
