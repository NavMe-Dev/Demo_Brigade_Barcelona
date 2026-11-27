# Architectural model sources

Open `masterplan.blend` in Blender 4.5 LTS. The named wing, podium, planted terrace and neighborhood groups contain the editable geometry. The two wing storey modules and trees use linked meshes. `apartment-a3.blend` contains the separate furnished home.

## Rebuild the masterplan

Run from the project root. The checked-in texture maps and fern GLB are sufficient for an offline rebuild. Blender 4.5.17 and native gltfpack 1.3 produced the exterior rebuild.

```sh
BRIGADE_BAKE_AO=1 BRIGADE_KTX2=1 GLTFPACK=/path/to/native/gltfpack blender -b --python-exit-code 1 --python scripts/generate_exterior.py
```

The command writes `models/masterplan.blend`, seven separate editable component files in `models/architecture/`, the detailed and mobile exterior GLBs, each architectural component, the unlocated clubhouse studies and the geographic context GLB. The bake flag creates the podium occlusion atlas. The native encoder produces KTX2 textures for both browser tiers, and gltfpack compresses their geometry with Meshopt. The Three.js loader uses the vendored Basis Universal and Meshopt decoders. Both exterior files retain parent wing identifiers and identical wing bounds. The mobile model uses simplified windows and foliage.

## Sources and calibration

The [architectural manifest](../dist/assets/architectural-manifest.json) records the reviewed brochure version, pages, sources and limitations. The [scene map](../dist/assets/scene-map.json) contains the extracted modular bay rectangles and camera anchors. Coordinates are in metres, with Y up and +Z facing the conceptual entrance. The [HMDA Plot 20 coordinate table](https://www.hmda.gov.in/wp-content/uploads/2020/07/HMDA_Neopolis_Phase-III.pdf) on PDF page 22 supplies sixteen parcel vertices. Run `python scripts/register_plot.py` to fit four distinct brochure corners to the polygon before rebuilding DEM and imagery. This rigid registration has a 1.033 m RMS residual and preserves the authored bay dimensions. The separate geodata folder supplies the clipped ODbL database, elevation samples, Sentinel image and attribution.

To rebuild the geographic extracts, run `python scripts/prepare_neighborhood.py sources/geography/barcelona-region.osm sources/geography` with Shapely 2 and Pillow. Terrain is sampled on a 40 m grid. A feathered pad levels the conceptual property. The area-to-height rule for surrounding buildings is an approximation.

Run `python scripts/extract_brochure_plans.py /path/to/developer-brochure.pdf` with PyMuPDF and Pillow to recreate the thirteen source design sheets and two sample floor plates. The script checks the brochure SHA-256 against the reviewed version. The developer retains rights in its original marketing artwork.

## Asset validation

The [live GPU measurements](../qa/exterior-geometry.json) record compressed sizes, wing extents, instancing and visible geometry for the detailed exterior, compact exterior and neighborhood. Seven individually editable exterior components are in `architecture/`. The twelve additional furnished apartment masters are in `apartments/`. [Apartment model sources and rebuild](../docs/APARTMENT_MODELS.md) · [Asset inventory](../docs/3D_ASSET_MANIFEST.md)
