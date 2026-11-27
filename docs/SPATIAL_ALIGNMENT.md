# Apartment and exterior spatial alignment

The exterior is in metres with Y up in the browser. Its wing bays are rectangular brochure traces. The floor meshes repeat modular façade segments, with a 15 m conceptual datum and 3.05 m storey spacing. The apartment models each have their own traced X/Z plan and Y-up geometry. Their origins differ from each other and from the exterior.

The previous balcony feature temporarily shared terrain, using one fixed quarter-turn and a layout-specific look direction. Windows did not use that relationship. The exterior has residential bay proxies, which do not document matching individual windows, balcony recesses or wall thicknesses. The supplied references support relative massing and appearance. They do not supply a coordinated façade elevation and unit setting-out schedule.

The implementation uses the brochure floor templates as the inventory authority. The spatial map registers each local plan to its traced bay with a rigid rotation inferred from the traced entrance and shared core. It preserves unit dimensions and uses controlled cutaway geometry at the occupied floor. Window and railing positions and opening dimensions come from the apartment geometry manifests. The associations and elevations are conceptual and cannot certify a façade match or an actual view.

## Placement and navigation

[Spatial manifest](../dist/data/apartment-spatial.json) · [Manifest generator](../scripts/build-spatial-map.mjs)

The manifest defines 13 designs, 129 layout and floor combinations, 122 window and sliding-door viewpoints and 41 balcony railing viewpoints. It records metres with Y up, one rotation and bay centre per layout, and an elevation per documented floor. The refuge plate on floor 12 omits A7. The typical plate covers 17–20 and 22–26. The transform rotates about the local plan centre, then translates that centre to the traced bay and floor datum.

The viewer applies the inverse transform to the shared campus while keeping the furnished plan and collision mesh in their existing local coordinates. A bounded cut removes the repeated façade proxy in the occupied bay. The building section additionally clips the tower above the occupied floor. The exterior shell continues to represent the surrounding tower massing. The camera approaches the selected opening through the existing collision mesh and aims outward from the traced wall or railing. Floor switching preserves the local eye position. The comparison renders that same position at two elevations with the same lighting.

## Browser evidence

| View | Capture |
| --- | --- |
| B14 exterior bay, furnished section and bedroom | [Side-by-side](../qa/evidence/spatial-views/b14-alignment.jpg) |
| B14 isolated dollhouse and balcony | [Dollhouse](../qa/evidence/spatial-views/b14-dollhouse.jpg) · [Balcony](../qa/evidence/spatial-views/b14-balcony.jpg) |
| A6 living room and B14 bedroom by floor | [Living room](../qa/evidence/spatial-views/living-room-window.jpg) · [Floor 12](../qa/evidence/spatial-views/b14-floor-12-bedroom.jpg) · [Floor 20](../qa/evidence/spatial-views/b14-floor-20-bedroom.jpg) · [Floor 25](../qa/evidence/spatial-views/b14-floor-25-bedroom.jpg) |
| Same-eye comparison and lighting | [Comparison](../qa/evidence/spatial-views/compare-floors.jpg) · [Golden hour](../qa/evidence/spatial-views/golden-hour-interior.jpg) · [Night](../qa/evidence/spatial-views/night-interior.jpg) |
| Touch phone viewport | [B14 bedroom](../qa/evidence/spatial-views/mobile-window.jpg) |

## Architectural limitations

The traces establish a conceptual placement. The source tower uses repeating openings and simplified floor plates. The actual façade opening dimensions, balcony recesses and apartment-to-façade correspondence require coordinated drawings. A nearby wing or façade can legitimately occupy much of a simulated sightline. Furniture, glazing and light transmission use visual approximations. Interior and exterior share the lighting preset, sky and sun direction. Light entering the room is approximated through the existing interior lighting and materials. Views depict the illustrative architectural landscape and carry an artist’s impression disclosure.
