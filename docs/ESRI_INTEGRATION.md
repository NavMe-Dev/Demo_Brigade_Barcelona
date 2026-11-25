# Esri imagery integration

The unchanged Three.js building and the geographic surroundings share one renderer, metre-based frame and perspective camera. The default experience displays locally packaged, attributed Sentinel‑2 tiles on a terrain grid. An explicitly authorized configuration can progressively replace that optical layer with authenticated World Imagery. Buildings, floors and balcony viewpoints keep the same coordinates across both providers. [Geographic architecture](GIS_ARCHITECTURE.md) · [Point-specific coverage report](GEOGRAPHIC_COVERAGE_REPORT.md)

## Running locally

`npm start` serves the project at `http://127.0.0.1:5173`. The default runtime settings leave Esri imagery disabled. For an operator with an authorized commercial basemap entitlement, the included server reads `ARCGIS_IMAGERY_ENABLED=true` and `ARCGIS_API_KEY` from environment variables or `.env.local`. Reload the page after editing `.env.local`. Restart the server if changing variables inherited from the shell. A static deployment must serve the equivalent same-origin `data/arcgis-runtime.json` public configuration. The example file documents the field names and defaults. [Server configuration](../scripts/serve.py) · [Environment example](../.env.example)

The browser uses a public-facing key scoped to the necessary basemap privilege and approved application origins. Since a browser receives this value, an application client secret, OAuth refresh token or administrator credential would be inappropriate. Esri bills eligible usage under the operator’s plan. Setup, account creation, entitlement activation and billing approval belong to the account holder. The delivered configuration and test fixtures make zero billed requests. [Authentication](https://developers.arcgis.com/documentation/security-and-authentication/api-key-authentication/) · [Basemap usage model](https://developers.arcgis.com/documentation/mapping-and-location-services/mapping/basemaps/basemap-usage-styles/) · [Esri usage terms](https://www.esri.com/en-us/legal/overview)

## Request flow

1. Once an active geographic camera exists, the configured client fetches service metadata from `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer`. It validates a Web Mercator cache with 256×256 tiles. Requests carry a bearer authorization header and use `cache: 'no-store'`. [Documented raster service](https://developers.arcgis.com/rest/basemap-styles/service-data/) · [Esri header authentication](https://developers.arcgis.com/documentation/security-and-authentication/reference/http-authorization-headers/)
2. A point query against citation layer 4 finds `SRC_RES`, `MaxMapLevel` and the contributor at the registered origin. A tilemap query checks the actual local cache. A nominal worldwide maximum of z23 yielded **z19** at Plot 20 during validation. Each candidate tile is checked against its own 8×8 availability block before an image is requested. If the citation operation is unavailable or returns no local rows, the previously verified z19 limit remains subject to live cache confirmation. [Coverage evidence](GEOGRAPHIC_COVERAGE_REPORT.md) · [Tilemap specification](https://developers.arcgis.com/rest/services-reference/enterprise/tile-map/)
3. The scene selects a bounded quadtree from the camera frustum, projected ground-pixel size and viewport height. It fetches a parent before its children. Finer tiles crossfade over 180 ms. Spare coverage remains visible beneath a pending child. Anisotropic filtering and mipmaps handle oblique views. The tile order is ArcGIS `level/row/column`.
4. DEM vertices carry camera-independent Web Mercator coordinates calculated from the same WGS84 frame as the footprints. A GPU lookup selects the sharpest available source for each fragment on the existing terrain triangle. A tile boundary therefore introduces no second surface, depth conflict or elevation seam. The regular DEM uses the same diagonal as the building elevation sampler. [Imagery terrain](../dist/gis-imagery.js) · [ArcGIS streaming code](../dist/gis-arcgis.js) · [Shared elevation sampler](../dist/geo-terrain.js)

The simulated morning, day, sunset and evening presets apply the same linear-light colour multiplier after source selection. This preserves the geographic content and the satellite acquisition date as the user changes lighting. A hardware WebGL check with a neutral 235-value tile produced RGB (218, 219, 220) in daylight, (204, 169, 146) at sunset and (119, 132, 151) in the evening.

## Working set and fallback

| Resource | Mobile | Desktop |
|---|---:|---:|
| Simultaneous ArcGIS image requests | 2 | 4 |
| Resident ArcGIS tiles, including parents | 32 | 64 |
| ArcGIS 256² RGBA texture array, including mipmaps | ~10.7 MiB | ~21.3 MiB |
| Resident 10 m Sentinel detail tiles | 6 | 10 |
| Simultaneous local detail requests | 2 | 4 |

The indirection table adds up to 4 MiB under the configured 1,024-pixel side limit. The decoded ArcGIS array also keeps one bounded CPU staging buffer of 8 MiB on mobile or 16 MiB on desktop. Delivered local terrain first uses a 40 m overview and then loads the visible 10 m optical tiles. Each detail tile includes a one-pixel gutter from its neighbors. The outer 6.4–7.168 km band uses the separately registered regional optical image at 32 m. Source resolution stays explicit at every zoom. [Open imagery asset generator](../scripts/prepare_imagery_tiles.py)

Camera changes abort stale imagery requests. When the user walks indoors or the geographic layer is suspended, new requests stop and pending fetches are cancelled. The layer reuses its bounded working set on return. Eviction releases local textures; teardown disposes terrain geometry, materials, page table, tile array and bitmap resources. A missing, denied or unreachable service leaves the local imagery available. Missing child tiles retain their available parent. The app keeps proprietary tile bytes in session memory and excludes them from service workers, web storage, the source ZIP and the fallback posters. [Streaming lifecycle](../dist/gis-arcgis.js)

## Attribution and scene data

While any Esri tiles are visible, the exterior and balcony show a linked **Powered by Esri** label and the service’s copyright credit, supplemented by local imagery contributor names. At verification, credits included Esri, Vantor, Earthstar Geographics and the GIS User Community. Copernicus, terrain and open footprint credits remain available for their corresponding layers. The public tile and metadata endpoints used for the coverage report do not confer a commercial reuse license. [Attribution guidance](https://developers.arcgis.com/openlayers/maps/raster-tile-basemaps/display-a-map/) · [Esri content terms summary](https://www.esri.com/content/dam/arcgisonline/docs/tou_summary.pdf) · [Open geographic credits](../dist/assets/geography/CREDITS.txt)

No local textured façade or photogrammetric scene was verified. Esri’s locally present 3D object layers are untextured; their hosted data remain under Esri’s service terms. The shipped overlay instead reads independently licensed open footprints. The distributed terrain uses the open EGM96-based DEM. Replacing it with the EGM2008 Airbus surface in World Elevation would require datum alignment and updating the ground, pad, roads and building bases together. [Elevation source index](https://elevation.arcgis.com/arcgis/rest/services/WorldElevation/DataExtents/MapServer) · [Local terrain metadata](../dist/assets/geography/elevation.json)

## Verification

Live public metadata confirmed source detail and cache availability. In hardware WebGL, an intercepted 256 px coloured tile fixture exercised authenticated metadata, shader sampling, attribution, refinement to z19, and memory limits without using customer credentials. The mobile profile held 30 of its 32 tile slots in the close-view check. A simulated Esri 499 response kept the local optical image visible. A cold no-key load made zero Esri requests. Direct licensed image delivery with a customer key remains an operator acceptance check. [Browser verification](../scripts/verify_gis.cjs) · [Performance measurements](PERFORMANCE_REPORT.md)

With Playwright and Chrome available, run `node scripts/verify_gis.cjs licensed` to exercise the configured live service. The check records successful image responses and visible Esri tiles, with no capture of proprietary pixels or credentials. Without a configured key it records a pending result. The standard screenshot, timing and regression runs explicitly select the distributable open imagery. [Local credential acceptance result](../qa/gis-licensed.json)
