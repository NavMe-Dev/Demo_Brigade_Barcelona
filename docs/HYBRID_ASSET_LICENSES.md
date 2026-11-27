# Hybrid environment asset licensing

| Active asset | Source and use | Attribution or terms |
| --- | --- | --- |
| Parcel boundary | Published HMDA Neopolis Phase III plot-coordinate table, Plot 20 | [Original publication](https://www.hmda.gov.in/wp-content/uploads/2020/07/HMDA_Neopolis_Phase-III.pdf) |
| Near and regional terrain | Mapzen/SRTM EGM96 package with transient authorized Esri Airbus EGM2008 samples around the site | [Packaged source notes](../dist/assets/geography/CREDITS.txt) |
| Mapped roads and modeled road surfaces | OpenStreetMap centerlines, project-generated terrain mesh and illustrative finishes | [Road credits](../dist/assets/geography/roads/CREDITS.txt) · [OSM copyright](https://www.openstreetmap.org/copyright) |
| Neighbor footprints | Existing Overture, OSM, Google and Microsoft-derived licensed package with source and height fields | [Provenance](BUILDING_DATA_SOURCES.md) · [Packaged credits](../dist/assets/geography/CREDITS.txt) |
| Near ground, asphalt and paving | Existing credited PBR assets and generated material maps | [Surface sources](../dist/assets/textures/architecture/SOURCES.md) |
| Perimeter specimens and ferns | Poly Haven Tree Small 02 and Fern 02, CC0 | [Landscape credits](../dist/assets/showcase/CREDITS.txt) |
| Lighting skies | Existing HDR environments, including Poly Haven golden-hour sky | [Sky sources](../dist/assets/sky-light.LICENSE.txt) · [Showcase credits](../dist/assets/showcase/CREDITS.txt) |
| Brigade architecture, layouts and branding | User-supplied project brochure and derived conceptual models | [Architectural manifest](../dist/assets/architectural-manifest.json) |
| Optional World Imagery | Live authorized display through supported ArcGIS REST endpoint, memory cache only | [Integration and entitlement requirements](ESRI_INTEGRATION.md) |

The live browser presents Esri attribution only when Esri tiles are displayed. The open terrain and footprint credits and OpenStreetMap attribution are present throughout. The local configuration uses the browser key supplied by the user. The evidence distinguishes service-free fallback captures, live Esri captures with attribution, and labelled synthetic protocol checks. Live elevation and imagery data stay in session memory. The key is excluded from version control and reports.
