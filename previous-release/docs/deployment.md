# Run and release the experience

The local server serves only the contents of `dist/`. The static path structure is shared by the buyer and studio. To host a future approved release, copy that directory intact to an HTTPS static origin, preserving relative paths and case. Configure the host to serve JavaScript as JavaScript, JSON as JSON, WASM as `application/wasm`, GLB as `model/gltf-binary` and KTX2 as `image/ktx2`. A normal static index route supports the query-string deep links. Browser support for WebGL2 provides live rendering. The app identifies the still-image experience when the renderer cannot start.

Use short cache lifetimes or revalidation for HTML, JavaScript, configuration, manifests and assets because their URLs are stable across revisions. Version the directory atomically at release so the models and scene coordinates come from the same build. The ZIP includes Blender masters, SQL, QA and authoring tools. Use only its `dist/` tree as the document root.

## Sales backend

Follow [the database and studio guide](../supabase/README.md) for local stack initialization, staff memberships, draft fixtures, storage permissions, preview, approval and rollback. Only public connection values belong in `dist/studio-config.js`. With the supplied empty configuration, browsing, saves, comparisons, note downloads and private local previews work offline after serving the files. The studio stores local drafts and model files in IndexedDB. In connected mode, staff authenticate, approve a frozen release and publish its reviewed manifest. Inventory and pricing require a verified unit record. Published data carries its verification timestamp into the unit details. The buyer can withdraw optional analytics consent through the navigation menu.

## Release evidence

Review the architectural sources, brochure artwork permissions, approved building and unit mapping, privacy notice, access roles and sales content for the intended public release. Verify the selected Supabase stack end to end, including Auth, Storage, PostgREST, expiry and revocation. Run the buyer and admin journeys on physical target devices, measure cold uploads/downloads on their networks and verify sustained rendering during a longer visit. A rollback script is supplied for the dedicated database schema. Static version rollback and database rollback are separate operations.

No public deployment, live sales publication or change to a production database was performed for this local delivery.
