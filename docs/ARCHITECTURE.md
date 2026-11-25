# Public application architecture

The static HTML shell hosts a geographic map, a Three.js exterior and a Three.js apartment canvas. Camera navigation, sheets, source drawings and room hot spots live in the same document. Local browser storage holds saved designs and up to three comparison IDs. The enquiry form downloads a note on the visitor’s device.

| Component | Responsibility |
| --- | --- |
| `dist/estate.js` | Owns section, wing, floor, residence, lighting and history. Routes incoming URLs and coordinates preloading, building approach, entry and return. |
| `dist/project-data.js` | Caches JSON reads and assembles the project, floor membership and design filters. `dist/data/project.json` indexes the sources. |
| `dist/regional-map.js` | Loads the bundled MapLibre renderer when a visitor selects the regional map in Location. Releases its GPU context when the map closes. |
| `dist/estate-scene.js` | Loads the mobile exterior first, manages orbit and ray picking, highlights a wing or plate and interpolates between registered viewpoints. The detailed exterior is fetched on capable devices when the viewer moves close enough. |
| `dist/solar.js` | Uses an equinox date, IST and the registered parcel axes for four repeatable geographic lighting presets. |
| `dist/amenity-plan.js` | Connects printed legend numbers, normalized drawing coordinates, scene positions and human-eye-level views. The clubhouse viewer loads individual conceptual studies on request. |
| `dist/residences.js` | Filters 13 designs with OR within a category and AND across categories. Comparison uses the same floor plans, figures and model previews as the design sheets. |
| `dist/app.js`, `dist/interior-layout.js`, `dist/interior-plan.js`, `dist/navigation.js` | Load the chosen apartment and its navigation graph, render furnished or unfurnished modes, synchronize room selections with the source plan and perform collision-checked transitions. |

## Coordinates and asset loading

The parcel and regional layers use WGS84 longitude and latitude. Local exterior coordinates are metres, Y up. The geographic manifest defines the true north and east vectors. Each apartment has its own plan scale and coordinate system. Shared links can therefore open a design without asserting an exact building floor or façade position. The refuge floor has its own explicit design membership.

The shell, poster, low-detail model and JSON index can load independently. Apartment GLBs load on selection. The exterior render loop sleeps when the view is static and pauses while inside an apartment. Model-specific groups support roof-off, top-down and furniture controls. An unavailable WebGL context leaves the brochure and source plans accessible.

## Build

The source for the static site is in `dist/`. `scripts/build.mjs` rebuilds the standard and nested entry points and compiles each design’s brochure record and asset paths to `dist/data/unit-layouts.json`. Geographic extracts, high-resolution plan crops and Blender source assets are checked in. Runtime resource URLs are relative to the application base.
