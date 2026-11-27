# Running and hosting the buyer experience

Node.js and Python 3 are sufficient for the local preview. Run these commands from the repository root.

```sh
npm run build
npm start
```

Open [the local site](http://127.0.0.1:5173/experience/). The server binds to the loopback interface. Stop a foreground server with Ctrl+C. If port 5173 is already occupied by the project, reuse its existing URL. To use another port, run `python3 scripts/serve.py --port 5174`.

## Static host

The static assets live in `dist/`. For a production build with Esri configuration, publish **`build/site/`** using the steps below; publishing `dist/` directly uses the disabled configuration template. Preserve the nested `experience/index.html` file, data, assets, vendor directories and relative paths. Configure index-file serving for directory requests and preserve query strings on slash redirects. Return JavaScript modules as JavaScript, JSON and GeoJSON as JSON-compatible MIME types, GLB as `model/gltf-binary` or binary, and the Basis transcoder WASM as `application/wasm`. Use HTTPS for an internet host. The delivered local site uses HTTP loopback.

Routes work with static files. Test `/experience?wing=A`, `/experience?layout=B10`, `/experience?layout=A3&room=living` and `/experience?amenity=eco-deck` directly in a fresh tab. Preserve the bundled geographic attribution, licenses and artist-impression labels. Revalidate HTML, JSON and named assets when publishing an update. Use long immutable caching only when file names are content-versioned.

The buyer build uses local JSON, static assets and device-local preferences. Publishing the Blender masters, authoring scripts and evidence folders is optional.

A plain copy of `dist/` has Esri disabled and displays architectural ground. The local preview can still show satellite imagery because `scripts/serve.py` reads `.env.local` and supplies its own `/data/arcgis-runtime.json` response. A static host does not run that Python endpoint or receive the ignored local environment file.

## Production build with Esri imagery

Set these values in the hosting service's environment settings:

| Variable | Value |
| --- | --- |
| `ARCGIS_IMAGERY_ENABLED` | `true` |
| `ARCGIS_API_KEY` | An Esri browser credential authorized for the production origin |

For the current domain, allow `https://demo-brigade-barcelona.navme.space` in the credential's referrer restrictions. Include `https://demo-brigade-barcelona.onrender.com` only if the application will also be used at that address. Keep local development origins authorized separately as needed. [Esri setup and terms](ESRI_INTEGRATION.md)

Use these Render static-site settings:

| Setting | Value |
| --- | --- |
| Build command | `npm ci && npm run build:production` |
| Publish directory | `build/site` |

The production build refreshes the shared pages and apartment manifest, copies `dist/` to the ignored `build/site/` directory, and generates `build/site/data/arcgis-runtime.json` from the two process environment variables. It does not read `.env.local`, modify the disabled source template, or log the credential. An explicit `true` requires a nonempty key; an explicit `false` creates an intentional architectural-ground build with no key. Missing or invalid configuration fails the build instead of silently publishing an unintended fallback.

The generated browser configuration is public by design. Use an origin-restricted browser credential with the required imagery and elevation privileges, never a privileged server credential. Do not commit credentials or upload `.env.local`. The source ZIP retains a disabled configuration.

Publish the latest source changes as well as the production configuration. Environment changes require **Save, rebuild, and deploy** so the generated static file receives the new values. Reusing an existing build will retain its old configuration. [Render environment settings](https://render.com/docs/configure-environment-variables)

After deployment, compare the same path, query parameters, viewport and lighting on both sites. For example, use `/?scene=amenities&amenity=sky-deck&light=morning`. Verify that `/data/arcgis-runtime.json` enables imagery, actual Esri tile requests succeed, and the latest `Menu` button appears. Never copy the runtime credential into reports or screenshots of developer tools.
