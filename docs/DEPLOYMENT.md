# Running and hosting the buyer experience

Node.js and Python 3 are sufficient for the local preview. Run these commands from the repository root.

```sh
npm run build
npm start
```

Open [the local site](http://127.0.0.1:5173/experience/). The server binds to the loopback interface. Stop a foreground server with Ctrl+C. If port 5173 is already occupied by the project, reuse its existing URL. To use another port, run `python3 scripts/serve.py --port 5174`.

## Static host

The deployment root is the **contents of `dist/`**. Preserve the nested `experience/index.html` file, data, assets, vendor directories and relative paths. Configure index-file serving for directory requests and preserve query strings on slash redirects. Return JavaScript modules as JavaScript, JSON and GeoJSON as JSON-compatible MIME types, GLB as `model/gltf-binary` or binary, and the Basis transcoder WASM as `application/wasm`. Use HTTPS for an internet host. The delivered local site uses HTTP loopback.

Routes work with static files. Test `/experience?wing=A`, `/experience?layout=B10`, `/experience?layout=A3&room=living` and `/experience?amenity=eco-deck` directly in a fresh tab. Preserve the bundled geographic attribution, licenses and artist-impression labels. Revalidate HTML, JSON and named assets when publishing an update. Use long immutable caching only when file names are content-versioned.

The buyer build uses local JSON, static assets and device-local preferences. Publishing the Blender masters, authoring scripts and evidence folders is optional. The local demonstration is the only running delivery.

A static deployment serves packaged open imagery by default. For licensed World Imagery, configure the narrow runtime JSON endpoint at deployment using a browser-restricted credential authorized for the production origin. The local server reads the two named settings from the local environment. The downloadable source ZIP contains a disabled template. [Esri setup and terms](ESRI_INTEGRATION.md)
