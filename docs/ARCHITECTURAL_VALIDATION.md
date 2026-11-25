# Architectural validation

The reference set is the 26-page developer brochure identified by its SHA-256 fingerprint. Individual plan sheets are the source of the design labels, bed and washroom counts, published areas and readable dimensions. The supplied November 25 screen recording informed the camera transition and room strip. [Source register](../dist/assets/architectural-manifest.json) · [Extraction report](BROCHURE_EXTRACTION_REPORT.md)

## Parcel and building

HMDA Neopolis Phase III, page 22, lists the 16 coordinates of Plot 20. The closed polygon is valid and has a computed area of approximately 16,440 m². A rigid fit of four brochure boundary corners gives an RMS residual of 1.033 m. The local origin is 17.402192529° N, 78.312086932° E. All 18 tested wing footprint components lie within the plot. These figures validate the fit of the brochure to the parcel. The developer’s approved setting-out and vertical elevations remain unknown. [Registration measurements](../qa/parcel-registration.json)

Pages 2–5 and 23 establish the façade palette, connected stepped massing and roof silhouette. Pages 7, 9, 11 and 15 establish the relative plan arrangements. Page 3 supplies the 52-storey description used for this model. The floor-12 source sheet replaces the A7 bay with a refuge. The typical sheet identifies floors 17–20 and 22–26. The clickable plan shows the independently traced typical or refuge envelopes, and the data service governs membership of each plate. [Floor records](../dist/data/floor-templates.json) · [Source plan envelopes](../dist/floor-plate.js)

## Apartment checks

Each design was checked against its own high-resolution brochure sheet. Packed models were checked for bedroom, washroom and study counts, published area pairs, individually scaled geometry, labelled doors and windows, room polygons, camera targets, floor-plan registration, textures, source-matched room imagery and a corresponding Blender master. A4 and A5 recur in the source with matching programmes and were separately registered against their respective pages. [Source overlays](../qa/evidence/apartment-traces.webp) · [Dollhouse contact sheet](../qa/evidence/apartment-dollhouses.webp)

Browser testing then loaded each shipped GLB, checked its hash, selected every room and exercised its own source-plan layer. The route test used the walkthrough’s collision checks on all 2,588 directed room pairs, including identity pairs. Together the designs have 182 destinations. Real-time entry and reverse animations were separately sampled for B10. A3 retains its detailed original trace, furnishings and independent door, rail and furniture clearance checks. [Geometry checks](../qa/apartment-assets.json) · [Runtime checks](../qa/all-residences.json) · [Cinematic samples](../qa/residence-motion.json)

## Masterplan and decks

The model uses 21 entries from the published masterplan, 25 on the Eco Deck and 15 on the Sky Deck. Each record keeps its source page, original legend number and one or more drawing and model coordinates. The seven-level clubhouse has 16 programme entries, including the roof pool. The room studies convey their uses independently of an exact floor. [Registered legend](../dist/assets/amenity-plans.json) · [Live selection and model tests](../qa/amenity-models.json)
