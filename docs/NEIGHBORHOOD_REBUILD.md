# Brigade Barcelona neighborhood rebuild

The local [Architectural Showcase](http://127.0.0.1:5173/?scene=towers) uses the same Plot 20 registration as [Real-world Location](http://127.0.0.1:5173/?scene=location). The two modes share the public road and path surfaces. Showcase also draws the illustrative entrance drives, shoulders, median, markings, soil finish and entry planting. The mode switch stays within the application.

## Frontage and entrances

The former frontage was a finite mesh traced from the brochure page rather than the mapped road. The separately loaded OSM overlay drew cartographic lines and was disabled by default. Once the verified frontage tiles load, the browser suppresses the short road and its related markings in the exterior GLBs. It keeps the rest of the architectural and apartment assets.

OpenStreetMap ways [1183681598](https://www.openstreetmap.org/way/1183681598) and [213838287](https://www.openstreetmap.org/way/213838287) supply two mapped carriageways and connect to the mapped junctions and neighborhood streets. The road mesh preserves all 726.19 m and 757.73 m of their respective centerlines in the bundled extract. Road surfaces are unioned at junctions, clipped against Plot 20 and nearby footprint polygons, and split on the same ground triangle edges as the geographic DEM. The geometry check found zero uncovered centerline length, zero public road surface inside Plot 20, and zero measured gap between the illustrative drives and the public roadway. [Geometry audit](../qa/neighborhood-road-geometry.json)

The entry and exit come from the brochure page 7 masterplan markers. Their tie-ins are modeled from those markers to the nearest point on the near carriageway. The cabin, canopy and landscaping remain conceptual. The new close-view treatments add textured paving, planted beds, instanced licensed ferns and warm night bollards. The existing podium, canopy, clubhouse and towers remain editable in their prior Blender files. [Brochure reference board](../qa/evidence/exterior-rebuild/references/reference-board.jpg) · [Road surface and planting credits](../dist/assets/geography/roads/CREDITS.txt)

## Coverage and rendering limits

| Range | Context in the browser |
| --- | --- |
| Plot 20 | Brochure-based architectural site, drive tie-ins, paving, entry planters and lighting in Showcase |
| Within 250 m | Detailed public surfaces and junctions, illustrative shoulders and median in Showcase, nearby mapped footprints and scanned ground finish |
| 250 m to 1 km | Road and path surface tiles, mapped footprint clearance and illustrative façade detail where nearby |
| 1 to 5 km | Road and footprint tiles selected by the camera and quality budgets, with terrain, imagery and skyline context |
| Beyond 5 km | Geographic terrain and imagery; no modeled road coverage |

The November 25 OSM extract includes 4,227 road or path records selected by the generator. Of those, 39 supplied a width tag, 202 allowed a lane-based width estimate, and 3,986 used a class estimate. The two frontage carriageways use class estimates. Showcase centerlines, grass medians and entrance paving are presentation treatments. Markings and engineering details such as surveyed curb positions, lane directions, crossing paint, private plot boundaries and drainage were not verified. The ground follows the 32 m DEM grid, which cannot resolve surveyed curb levels or small elevation changes. Grade-separated roads and construction/proposed ways are outside the surface build.

The recheck on 27 November identified 0.31 m Esri imagery at Plot 20 through zoom 19, and elevation sources of 24.74 and 30.92 m. The public Esri building layers contain local untextured geometry. The search did not establish a textured integrated mesh for Kokapet. The browser captured here used the 10 m Sentinel-2 fallback. The near Showcase surface blends a tiled soil scan into the existing terrain and fades to imagery with distance. Nearby extrusions retain source footprints and available height attributes, with class-based heights and representative roofs and windows where surveys are unavailable. [Coverage recheck](../qa/neighborhood-coverage.json) · [Prior geographic source review](GEOGRAPHIC_COVERAGE_REPORT.md) · [Height provenance](BUILDING_DATA_SOURCES.md)

## Browser review

- [Hero](../qa/evidence/neighborhood-rebuild/hero.jpg) · [Front road](../qa/evidence/neighborhood-rebuild/front-road.jpg) · [Rear neighborhood](../qa/evidence/neighborhood-rebuild/rear.jpg)
- [Entrance](../qa/evidence/neighborhood-rebuild/entrance.jpg) · [Street level](../qa/evidence/neighborhood-rebuild/street.jpg) · [Actual orbit contact sheet](../qa/evidence/neighborhood-rebuild/orbit.jpg)
- [Golden hour](../qa/evidence/neighborhood-rebuild/golden-hour.jpg) · [Night entrance](../qa/evidence/neighborhood-rebuild/night.jpg) · [Mobile](../qa/evidence/neighborhood-rebuild/mobile.jpg) · [Real-world Location](../qa/evidence/neighborhood-rebuild/location.jpg)

The requested 10:18:49 a.m. screenshot was absent from the attachment and workspace. The [before-and-after plate](../qa/evidence/neighborhood-rebuild/before-after.jpg) compares the prior archived tower capture with the rebuilt browser from its archived camera pose. The browser shows the frontage continuing past both sides of the property and meeting the side road. At street level, the ground texture and drive joints are legible. The land beyond the project remains sparse and approximate. This build still has a visible gap to photorealistic brochure-quality surroundings, especially in the wider terrain, mature planting and the surrounding buildings.

The road surface generator runs with Shapely 2.0 using `python3 scripts/geography/road_surfaces.py`. Its 879 tiles are stored in three progressive bundles. The browser frustum-culls tiles, limits selected and resident geometry, and disposes evicted tile buffers. The arrival ferns use Meshopt and GPU instancing. New surface textures use WebP and the existing scanned paving and grass maps. The prior architectural GLBs retain their KTX2 textures and existing podium occlusion bake. Scene-wide baked indirect lighting remains outstanding.
