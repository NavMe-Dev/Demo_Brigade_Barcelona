# Kokapet buildings and terrain

The local neighborhood contains **23,520 sourced building footprints** within a 5 km centroid radius of the Brigade Barcelona model. Every building uses the same elevation surface as the imagery. Building heights are approximate for 23,495 footprints, including 102 inferred from mapped floor counts. The remaining 25 have a source-supplied numerical height. Survey methods are unspecified for those 25. Source imagery, footprint dates and current construction activity can differ.

## Footprint coverage

| Distance from Plot 20 | Building count | Outline simplification tolerance |
| --- | ---: | ---: |
| 0–500 m | 158 | 0.10 m |
| 500 m–2 km | 3,066 | 0.35 m |
| 2–5 km | 20,296 | 0.75 m |
| Beyond 5 km | Terrain and imagery | Buildings end at 5 km |

The November 18, 2026 Overture release contains a spatially ordered GeoParquet partition covering Kokapet. A pushdown filter over 78.262–78.364°E and 17.354–17.450°N returned 43,472 candidate records. Each record retains its stable identifier, original polygon, detection or mapping source, available height, floor count, class and provenance. The local subset is included for independent analysis and offline rebuilding. [Official partition](https://stac.overturemaps.org/2026-11-18.0/buildings/building/00298/00298.json) · [Machine-readable source subset](../sources/geography/building-context/overture.parquet) · [Extraction metadata](../sources/geography/building-context/overture-source.json)

| Retained source | Building count |
| --- | ---: |
| Google Open Buildings | 11,797 |
| OpenStreetMap | 9,040 |
| Microsoft ML Buildings | 2,683 |

Microsoft's standalone November 12 catalogue also lists India quadkey 123301331 with a 54.2 MB download. Using the conflated Overture distribution preserves these three provenances and limits duplication between detectors. The direct Microsoft product has its own distribution terms. Every selected Overture record identifies ODbL 1.0 as its license. The derived footprint database is made available under ODbL 1.0. Credits are © OpenStreetMap contributors, Overture Maps Foundation, Google Open Buildings and Microsoft ML Buildings. [Source licensing and attribution](https://docs.overturemaps.org/attribution/) · [Microsoft catalogue and terms](https://github.com/microsoft/GlobalMLBuildingFootprints) · [Google Open Buildings](https://sites.research.google/gr/open-buildings/) · [Open Data Commons license](https://opendatacommons.org/licenses/odbl/1-0/)

The publicly identified HMDA source establishes the project parcel. The contextual footprints use the open building sources above. The regional Esri basemap and scene-layer evaluations include local spatial queries. [Coverage report](GEOGRAPHIC_COVERAGE_REPORT.md)

## Heights and mapped exclusions

- **25** buildings use a positive numerical height supplied by mapping data. **102** use published floor counts multiplied by 3.1 m per floor.
- **23,393** use a conservative default, based on the published class or subtype. The model assigns 3 m to outbuildings, 10 m to identified apartments, offices, hotels and dormitories, 7 m to identified schools and larger commercial uses, and 6.2 m to other residential structures. Unclassified footprints use 4.5 m. A large footprint by itself does not establish a building’s height.
- Sixteen small OpenStreetMap API extracts supplied 140 mapped exclusion polygons. These comprise 116 construction land-use polygons, 20 buildings tagged under construction and four roof-only features. The query also screens proposed, demolished, abandoned, brownfield, greenfield and related lifecycle tags. A November 25 extract supplied 214 building height or floor tags for cross-checking against matching OSM source IDs.
- The filter removed 1,711 features touching exclusion masks, 24 separately tagged lifecycle or underground features, two touching the official parcel, 2,627 low-confidence detected features and five sub-10 m² structures. A final test removed one more far-zone building that touched an exclusion polygon after coordinate rounding. A further 15,582 candidates had centroids outside the display radius. Unmapped demolition or recent work can still appear in older source footprints.
- Geometry retains 28 interior rings. A spatial comparison of all packed polygons found no exact duplicates, near-duplicate outlines, parcel overlaps or mapped-exclusion overlaps under the documented tolerances. Individual footprint areas sum to about 3.79 km². [Source mask](../sources/geography/building-context/osm-mask.geojson) · [Height tags and lifecycle IDs](../sources/geography/building-context/osm-lifecycle.json) · [Counts and reasons](../qa/geographic-buildings.json) · [Packed geometry checks](../qa/geographic-exclusions.json)

## Parcel, elevation and wall contact

The HMDA Neopolis Phase III coordinate table gives 16 DMS positions A–P for Plot 20. An independent transcription check against the published page found a maximum coordinate-storage difference below 0.001 m. The hand-traced four-corner fit positions the architectural model at **17.402192529°N, 78.312086932°E** with a 1.033 m RMS plan registration residual. Local +Y is up. North corresponds to local X/Z (−0.972308952, +0.233699171) and east to (−0.233699171, −0.972308952). Horizontal scale follows the original local equirectangular engineering approximation. Photographic and mapped feature accuracy can differ from this pixel-to-parcel fit. [Official HMDA drawing, page 22](https://www.hmda.gov.in/wp-content/uploads/2020/07/HMDA_Neopolis_Phase-III.pdf) · [Bundled source page](../sources/geography/hmda-plot-20-page-22.pdf) · [Registration QA](../qa/parcel-registration.json)

Twenty public Mapzen Terrarium zoom-13 PNGs supply elevation for the 14.336 km square. At this latitude their pixel spacing is approximately 18.2 m. Mapzen identifies SRTM as the high-zoom land source for this region. The native global source has nominal one-arc-second posts, approximately 30 m. USGS specifies the EGM96 geoid as its vertical datum. The terrain generator samples pixel centres bilinearly onto a 32 m engineering grid, with 449 × 449 samples. Absolute samples span **505.612–631.330 m**. The origin samples **596.286 m**. [Mapzen data sources and resolution](https://github.com/tilezen/joerd/blob/master/docs/data-sources.md) · [SRTM specifications](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm-1) · [Tile URLs and checksums](../sources/geography/terrain/index.json)

The existing building's Y=0 is the conceptual ground level. Terrain heights use a constant offset of −596.286 m and centimetre quantization. The level pad covers the official parcel plus one grid diagonal, then blends into the source terrain over 60 m. The surrounding scene ranges from −90.67 to +35.04 m. This sets visual ground contact without asserting a surveyed finished-floor height. The scene uses no ellipsoidal or ArcGIS absolute Z values in this datum. Any provider-specific data must use a compatible vertical reference before combination.

The mesh and height sampler split every 32 m square on its northwest-to-southeast grid diagonal, defined in local X/Z coordinates. Every footprint wall splits at intersecting grid and diagonal edges. Its bottom follows the exact visible terrain triangle. Its level roof is placed at the building height above the highest underlying ground point. Checks of 175,674 foundation segments found height discrepancies below 0.00002 m at vertices and midpoints. [Mesh and coordinate QA](../qa/geographic-geometry.json) · [DEM parameters](../dist/assets/geography/elevation.json)

## Optional map features

The Location overlay uses mapped centre lines, boundaries and individual tree points from the November 25, 2026 OpenStreetMap snapshot. The ordinary satellite view uses the roads, vegetation and water visible in its imagery. Grade-separated roads, tunnels and features on other layers are omitted from this ground-aligned drawing. Vector lines follow the same terrain triangle boundaries as the building walls. Water, green and construction polygons are boundary linework. Tree locations come from individual OSM tree nodes, and canopy sizes are unavailable. The overlay comprises 523 arterial ways, 2,268 streets, 1,140 service ways, 297 paths, 27 water boundaries, 86 green boundaries, 89 construction boundaries and 74 tree nodes. [Exact query and counts](../dist/assets/geography/infrastructure.json) · [Compressed source extract](../sources/geography/building-context/infrastructure-overpass.json.gz) · [OSM attribution](https://www.openstreetmap.org/copyright)

The registered street-level camera is on tertiary way 1183681598, at **78.31148798°E, 17.40275668°N**. Its model-space X/Z is (−46.19, 76.54), 15.33 m from the illustrative gate reference. [Mapped carriageway](https://www.openstreetmap.org/way/1183681598)

## Rendering and reproduction

The 274 local 512 m tiles hold 659,180 bytes of uncompressed binary footprint data. The catalogue contains per-tile bounds and counts. Each tile has a single indexed building mesh with a roof-and-wall colour attribute. The renderer checks the camera frustum, ground range, screen-space scale and separate desktop/mobile budgets, streams two or three local files concurrently, evicts older offscreen tiles, and aborts pending requests when geography is hidden. At distance, the draw range retains buildings with at least an 8 m height or 15 m footprint diagonal. Footprints remain available at full detail in their source tiles. [Tile catalogue](../dist/assets/geography/buildings/index.json) · [Runtime implementation](../dist/geo-buildings.js)

From the repository root, Python 3.9+ with NumPy, Shapely 2, Pillow and PyArrow can regenerate the area from the supplied source data. Node.js runs the mesh and coordinate tests.

```sh
python3 scripts/geography/terrain.py
python3 scripts/geography/buildings.py
python3 scripts/geography/infrastructure.py
python3 scripts/geography/validate-area.py
node scripts/geography/validate-mesh.mjs
```

To refresh source inputs, `terrain.py --fetch` retrieves missing elevation tiles. `fetch_buildings.py --osm-cache /path/to/local/cache` retrieves the pinned Overture partition with bounding-box pushdown and reads or downloads the 16 small OSM map extracts. `infrastructure.py --fetch` refreshes the OSM overlay from the recorded Overpass query. OSM map responses can change after the snapshot. Reassess exclusions, heights and coverage when refreshing. [Acquisition script](../scripts/geography/fetch_buildings.py) · [Terrain generator](../scripts/geography/terrain.py) · [Building generator](../scripts/geography/buildings.py)
