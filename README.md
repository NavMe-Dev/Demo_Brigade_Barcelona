# Brigade Barcelona

Explore Plot 20 in Neopolis, Kokapet, Hyderabad. The opening camera moves from a wide view of the development around the towers, then settles into a closer exterior view. Use Skip intro to explore immediately, choose a wing and floor, and walk through any of the thirteen residence designs from the developer brochure.

## Run locally

The checked-in site serves registered terrain, mapped roads, architectural ground materials, HDRI skies, 3D models and apartment data over local HTTP. Authorized ArcGIS imagery streams when a browser key is configured in .env.local.

```sh
npm run build
npm start
```

Open the [buyer experience](http://127.0.0.1:5173/experience/) for the cinematic arrival or the [Building view](http://127.0.0.1:5173/?scene=towers) to explore immediately. The exterior and apartment outlooks share the same hybrid 3D environment anchored to the published HMDA Plot 20 boundary. The local server now supplies the configured public Esri browser key. World Imagery streams beyond the authored ground and World Elevation supplies the surrounding terrain when available. See the [hybrid environment report](docs/HYBRID_ENVIRONMENT.md) and [spatial alignment report](docs/SPATIAL_ALIGNMENT.md).

## Explore

- Select a wing on the façade or use **Explore building**. The floor rail shows the typical floors 17–20 and 22–26 and the separate floor 12 refuge plan. Choose an apartment from the verified plate or browse designs independently of a floor. [Wing A refuge floor](http://127.0.0.1:5173/experience/?wing=A&floor=12)
- Use **Apartments** to filter by wing, configuration, floor, total SBA and total carpet area. Save a design or compare up to three. These choices are stored in the current browser.
- Open an apartment to orbit its dollhouse, change furnishing or lighting, select a room on the source plan, take a guided tour, or walk with the keyboard or touch controls. **Back to building** returns to the development. [A3 living room](http://127.0.0.1:5173/experience/?layout=A3&room=living) · [Four-bedroom B10](http://127.0.0.1:5173/experience/?layout=B10)
- In walk mode, use the window and balcony controls to approach openings. Switch between compatible floors from the apartment card, or compare the same outlook on two floors. In dollhouse mode, select **Apartment in Building** for a section through the tower.
- Use the masterplan or a deck’s numbered legend to move to the matching 3D location. Explore the clubhouse programme through its labelled conceptual studies. [Eco Deck](http://127.0.0.1:5173/experience/?amenity=eco-deck) · [Sky Deck](http://127.0.0.1:5173/experience/?amenity=sky-deck) · [Clubhouse](http://127.0.0.1:5173/experience/?amenity=clubhouse)
- **Property info** displays the address. Morning, Daylight, Golden hour and Night are available from the lighting control.

## Source and evidence

The [bundled developer brochure](sources/brigade-barcelona-brochure.pdf) supplies the layouts, room programme and published areas. HMDA supplies the 16 parcel vertices. The tower heights, furniture, lighting, clubhouse interiors and skyline are illustrative. The brochure describes 52 storeys on page 3. The public experience follows that source and shows floor-specific design choices only on its documented plates.

| Topic | Document |
| --- | --- |
| Unit placement, views and cutaways | [Spatial alignment](docs/SPATIAL_ALIGNMENT.md) |
| Archived geographic exterior | [GIS architecture](docs/GIS_ARCHITECTURE.md) |
| Esri licensing and site-specific coverage | [Integration](docs/ESRI_INTEGRATION.md) · [Geographic coverage](docs/GEOGRAPHIC_COVERAGE_REPORT.md) |
| Footprints, height estimates and construction masks | [Building sources](docs/BUILDING_DATA_SOURCES.md) |
| Public application and data flow | [Architecture](docs/ARCHITECTURE.md) |
| All 26 pages, source sheets and materials | [Brochure extraction](docs/BROCHURE_EXTRACTION_REPORT.md) |
| Site calibration, individual plans and travel paths | [Architectural validation](docs/ARCHITECTURAL_VALIDATION.md) |
| Blender masters, web assets and reproduction | [3D asset manifest](docs/3D_ASSET_MANIFEST.md) |
| Tested browser flows and screenshots | [QA report](docs/QA_REPORT.md) |
| Loading and frame rates | [Performance measurements](docs/PERFORMANCE_REPORT.md) |
| Static hosting and shareable URLs | [Deployment](docs/DEPLOYMENT.md) |
| Architectural assumptions and device coverage | [Known limitations](docs/KNOWN_LIMITATIONS.md) |
