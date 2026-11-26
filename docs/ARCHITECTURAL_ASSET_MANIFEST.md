# Architectural asset manifest

The masterplan and component sources were generated in Blender 4.5.17. The browser uses gltfpack Meshopt compression and GPU instancing. GLB sizes below are on-disk transfer sizes. The depth of the clay screens and the planted beds is real geometry.

| Asset | Purpose | Size | SHA-256 prefix |
| --- | --- | ---: | --- |
| [brigade-barcelona.glb](../dist/assets/brigade-barcelona.glb) | Detailed interactive exterior | 2,235 KiB | `ee152220b9c0` |
| [exterior-lod.glb](../dist/assets/exterior-lod.glb) | Masterplan and Performance profile | 1,154 KiB | `da276e14739c` |
| [exterior-geographic.glb](../dist/assets/exterior-geographic.glb) | Distant regional arrival | 167 KiB | `f09fd0527f9b` |
| [wing-a.glb](../dist/assets/wing-a.glb) | Editable Wing A export | 411 KiB | `7f2b1c5c6e2b` |
| [wing-b.glb](../dist/assets/wing-b.glb) | Editable Wing B export | 364 KiB | `989a001555a2` |
| [podium.glb](../dist/assets/podium.glb) | Editable podium and perforated screens | 258 KiB | `1f82bb32c930` |
| [clubhouse.glb](../dist/assets/clubhouse.glb) | Clubhouse exterior and roof pool | 169 KiB | `bcfdfa19eff6` |
| [eco-deck.glb](../dist/assets/eco-deck.glb) | Registered Eco Deck features | 568 KiB | `24c40c6deeef` |
| [sky-deck.glb](../dist/assets/sky-deck.glb) | Registered Sky Deck features | 874 KiB | `da81fac8ad87` |
| [landscape.glb](../dist/assets/landscape.glb) | Site landscaping component | 21 KiB | `0dd424706fa7` |

[Blender masterplan](../models/masterplan.blend) · [Editable components](../models/architecture/) · [Material maps](../dist/assets/textures/architecture/) · [View presets](../scripts/architectural-views.json) · [Generator](../scripts/generate_exterior.py)

The regional model loads on demand during the Hyderabad flight. The masterplan model supports the same semantic site registration and outline. On capable displays, the detailed model supplies balcony profiles, punched glazing and crowns. Perforated podium detail is visible only near the lower site. Auto uses the reduced model on compact devices. The separate component GLBs are available to authoring and validation tools. The main browser model groups them into the two local exterior packages.

The prior working models remain in Git at `ce020fe` and their [baseline SHA-256 hashes](../qa/evidence/architectural-baseline/asset-sha256.txt) are recorded. Full-detail loading failure leaves the reduced-detail model available. Missing base imagery or WebGL exposes the still fallback with Retry 3D.

GIS registration, apartment bay metadata, original apartment GLBs and the separate clubhouse interior studies have their existing authoring pipelines. The generated model uses the developer brochure logo crop for the local visualization. See [source evidence](ARCHITECTURAL_REFERENCE_ANALYSIS.md).
