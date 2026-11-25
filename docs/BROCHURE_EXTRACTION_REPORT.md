# Brigade Barcelona brochure extraction

The reviewed developer PDF contains 26 raster pages. Its revision is identified by the SHA-256 in the [architectural manifest](../dist/assets/architectural-manifest.json). The local deliverables contain extracted plan sheets, registered programme points and actual model geometry. The brochure artwork illustrates a proposed development. HMDA plot coordinates supply the surveyed land boundary, while the tower geometry follows the marketing drawings. [Developer brochure](https://d1di04ifehjy6m.cloudfront.net/media/filer_public/1b/7b/1b7b3c68-2058-4f1d-99c4-7cafe84546c5/brigade_barcelona_digital_brochure.pdf)

## Pages and evidence

| PDF page | Evidence read from the page | Application record |
| --- | --- | --- |
| 1 | Burgundy cover, gold disc and stacked project wordmark with Neopolis subtitle | Transparent extracted mark in `assets/branding/` |
| 2 | Full-height artist impression with connected tower wings, stepped crowns, framed balcony bays, red podium and clubhouse | Exterior reference and conceptual façade |
| 3 | Upper-storey study and architect’s palette. The text explicitly describes **52 storeys** and a **seven-level clubhouse** | Nominal envelope follows this page. The requested 53-storey figure conflicts with the source. Additional sellable floors have no source schedule. |
| 4 | Ricardo E. Bofill credit and elevation detail showing framed vertical divisions and cornice | Window and roof modules |
| 5 | Recessed terracotta podium screen, limestone colonnade, planted edges, Deccan Red, Burnt Earth, Limestone Beige and Olive Bronze palette | Project materials and planted podium |
| 6 | Diagrammatic Neopolis location, Financial District, Shankarpally Road, Nehru Outer Ring Road, Kokapet Lake and regional context | Brochure map excerpt. Survey and licensed data establish scene placement. |
| 7 | One connected T-shaped massing on the parcel, two wing footprints, entrance/drop-off loop, eastern drawing-side club/lawn and a court strip. North arrow points to the left of the page. | 21 numbered legend features with source and scene positions |
| 8 | Eco Deck planted walks, firepit/plaza and gathering lawn artwork | Source art and landscaping reference |
| 9 | Podium-level landscape plan, core and circulation layout with repeated callouts | 25 numbered Eco Deck features with every readable marked occurrence recorded |
| 10 | Rooftop terrace with open colonnades, planted beds, boulders and ambient lighting | Sky Deck source art and geometry reference |
| 11 | Six rooftop garden pockets around a central core, linked by a walking trail | 15 numbered Sky Deck features, paths, planted surfaces, kiosk and shelters |
| 12 | Seven-level clubhouse with raked bronze/terracotta fascia, deep glazed openings, rooftop pool and loungers | Separate seven-level club GLB with roof pool and pavilion |
| 13 | Clubhouse terrace artwork and the sixteen listed functions | Curated programme, unassigned interior floor levels and separate illustrative room studies |
| 14 | Floor-plan section divider | Section boundary |
| 15 | Typical plan for 17–20 and 22–26, separate floor 12 refuge plan and labelled design key | Registered rectangles for the thirteen design bays. The refuge replaces A7 on floor 12. |
| 16 | Unit-plan section divider | Section boundary |
| 17 | A1, three bedrooms with study; A2, three bedrooms | Source layouts, bedrooms, washrooms and area labels |
| 18 | A3 and A4, three bedrooms | Source layouts and existing detailed A3 reconstruction |
| 19 | A5 and A6, three bedrooms | Source layouts and area labels |
| 20 | A7, three bedrooms with study, and B8, three bedrooms | Source layouts and area labels |
| 21 | B9, three bedrooms, and B10, four bedrooms | Source layouts and area labels |
| 22 | B11, four bedrooms, and B12, three bedrooms | Source layouts and area labels |
| 23 | B14, three bedrooms, and a second exterior impression | Source layout and staggered tower-crown reference |
| 24 | Finish and service specifications and corporate sustainability statement | Scope and finish descriptions in `assets/material-specifications.json` |
| 25 | Corporate portfolio, brand positioning, awards and accolades | Developer identity; no building dimensions derived from this page |
| 26 | Brigade brand, Plot 20 Neopolis Layout address and Telangana RERA text P02400011156 | Brochure transcription. Registration status requires independent verification. |

The brochure's original fourteen-number sequence omits Unit 13. All thirteen documented designs have individual source sheets. The displayed areas retain the original **TOTAL SBA** and **TOTAL CARPET AREA** terms. Dimensions are from unfinished surfaces excluding plaster and tile thickness. A3 is printed as 2,790 sq ft / 1,873 sq ft. Every design’s area pair, bedroom count, washroom count, study flag and page reference is available in the [layout manifest](../dist/assets/brochure-manifest.json).

## Spatial extraction

The [registered amenity catalog](../dist/assets/amenity-plans.json) contains stable feature IDs, original legend numbers, source page, cropped drawing coordinates and local 3D targets. Repeated symbols carry multiple positions for the same feature. Printed symbol centres were hand-read on 1450-pixel-wide reference spreads. Normalized image coordinates locate them on the extracted high-resolution plan. Local metre coordinates place them in the illustrative 3D scene. Page 7 is fitted to the HMDA parcel. Page 9 is fitted to the podium outline. Page 11 is fitted to the six corresponding Wing B roof bays. The latter two fits are proportional registrations to the architectural model.

The Eco Deck includes the sunken gathering lawn, café workspaces, outdoor kitchen, firepit, elders’ pavilion and activity zones. The Sky Deck includes the sound, aroma, mist, reflexology and yoga gardens and rooftop lounge. The full masterplan legend covers the driveways, both tracks, seating colonnade, tower and clubhouse entrances and the entire sports strip. Dimensions for equipment, lighting, plants and furniture are illustrative.

Clubhouse programme on page 13 includes the grand lobby, banquet hall, club lounge, reading lounge/art gallery, gym, yoga, aerobics/dance, salon and spa, co-working, mini theatre, golf simulator, music rooms, indoor games, crèche, swimming and children’s pools, and pool deck. The source marks the crèche and spa as provisioned spaces. It gives no interior floor allocation. The room study viewer uses independent cutaway vignettes; only the exterior clubhouse and roof terrace occupy an indicative site position.

## Reproduction and source limits

```sh
python scripts/extract_architecture.py /path/to/brigade_barcelona_digital_brochure.pdf
python scripts/extract_brochure_plans.py /path/to/brigade_barcelona_digital_brochure.pdf
GLTFPACK=/path/to/gltfpack blender -b --python-exit-code 1 --python scripts/generate_exterior.py
```

The revised model includes true façade, roof, clubhouse, landscape and amenity geometry. The flat plans and developer art serve as references and alternative views. The registered parcel has a four-control residual of 1.033 m RMS against the brochure outline. The source lacks measured elevations, construction sections, building setting-out points, lighting studies, an inventory schedule and a verified panorama. [Parcel verification](../qa/parcel-registration.json)
