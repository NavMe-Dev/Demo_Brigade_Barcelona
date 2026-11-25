# Brigade Barcelona

Explore Plot 20 in Neopolis, Kokapet, Hyderabad. The opening camera moves from a wide view of the development around the towers, then settles into a closer exterior view. Use Skip intro to explore immediately, choose a wing and floor, and walk through any of the thirteen residence designs from the developer brochure.

## Run locally

The checked-in site serves its maps, models, fonts, decoders and apartment data over local HTTP. From the repository root, run the following commands.

```sh
npm run build
npm start
```

Open the [buyer experience](http://127.0.0.1:5173/experience/). Python 3 serves the site and Node.js rebuilds the catalogue and shared route. The local server also reads an optional browser-restricted ArcGIS key from `.env.local`, as described in the [Esri setup guide](docs/ESRI_INTEGRATION.md). The delivered `dist/` folder can also run directly with `python3 -m http.server 5173 --bind 127.0.0.1 --directory dist`.

## Explore

- Select a wing on the façade or use **Explore building**. The floor rail shows the typical floors 17–20 and 22–26 and the separate floor 12 refuge plan. Choose an apartment from the verified plate or browse designs independently of a floor. [Wing A refuge floor](http://127.0.0.1:5173/experience/?wing=A&floor=12)
- Use **Apartments** to filter by wing, configuration, floor, total SBA and total carpet area. Save a design or compare up to three. These choices are stored in the current browser.
- Open an apartment to orbit its dollhouse, change furnishing or lighting, select a room on the source plan, take a guided tour, or walk with the keyboard or touch controls. **Back to building** returns to the development. [A3 living room](http://127.0.0.1:5173/experience/?layout=A3&room=living) · [Four-bedroom B10](http://127.0.0.1:5173/experience/?layout=B10)
- Use the masterplan or a deck’s numbered legend to move to the matching 3D location. Explore the clubhouse programme through its labelled conceptual studies. [Eco Deck](http://127.0.0.1:5173/experience/?amenity=eco-deck) · [Sky Deck](http://127.0.0.1:5173/experience/?amenity=sky-deck) · [Clubhouse](http://127.0.0.1:5173/experience/?amenity=clubhouse)
- **Location** includes a Hyderabad-to-Plot-20 flight, an optional mapped-infrastructure overlay, a 360° orbit, a street-level camera and the regional map. [Fly from Hyderabad](http://127.0.0.1:5173/experience/?scene=journey). The four lighting presets use Hyderabad’s coordinates, local time and the parcel orientation.

## Source and evidence

The [bundled developer brochure](sources/brigade-barcelona-brochure.pdf) supplies the layouts, room programme and published areas. HMDA supplies the 16 parcel vertices. The tower heights, furniture, lighting, clubhouse interiors and skyline are illustrative. The brochure describes 52 storeys on page 3. The public experience follows that source and shows floor-specific design choices only on its documented plates.

| Topic | Document |
| --- | --- |
| Geographic exterior and camera transitions | [GIS architecture](docs/GIS_ARCHITECTURE.md) |
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
