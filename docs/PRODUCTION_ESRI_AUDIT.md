# Production Esri investigation

Status: **not resolved at the production domain root; production changes await approval.**

Inspected on 27 November 2026. Service: [Demo_Brigade_Barcelona on Render](https://dashboard.render.com/static/srv-dc3arvvlk1mc73eeq2f0), MetaDigi Labs Workspace. No production settings, environment variables, Git pushes or deployments were changed during this investigation.

## Root cause and current deployment

The original static deployment served the disabled `dist/data/arcgis-runtime.json` template. The local Python server overrides that endpoint using the ignored `.env.local` file; the original static build did not supply that configuration. The production build fix is now committed in `be2c754430b0e51857ccd01579e26128541948fa`.

Render's latest inspected deployment, `dep-dc4k5jt6e07s73fimscg`, is live on that commit. Its build command is correct, but its **publish directory is `build`, one level above the generated app in `build/site`**.

| Check | Observed result |
| --- | --- |
| `/data/arcgis-runtime.json` | Imagery disabled; no key |
| `/site/data/arcgis-runtime.json` | Imagery enabled; key present and privately confirmed to match `.env.local` |
| `/` HTML | Older two-line menu version |
| `/site/` HTML | Latest `Menu` button and app |
| Fresh requests to the `onrender.com` address | Same mismatch; this is not only a local browser-cache problem |
| Latest build log | Successfully generated `build/site` with Esri enabled and 13 apartment records |
| Two preceding build attempts | Failed because `ARCGIS_API_KEY` was missing |

The current build is not outdated. The domain root is serving the wrong published files. Correcting the publish directory puts the configured app at the intended root URL.

## Configuration and authentication

This repository does **not** use Vite. Its production build is a Node script, and its browser code uses static ES modules. The exact variable names are `ARCGIS_IMAGERY_ENABLED` and `ARCGIS_API_KEY`; no `VITE_` prefix applies.

The local file was inspected without printing its key. The effective Render build configuration is verified through the enabled generated artifact and build logs. The connected Render tool does not expose an environment-variable read operation, so no claim is made that the dashboard's saved values were independently read. The current published browser key matches the local key; only the equality result was recorded.

Real browser requests from the production domain successfully loaded Esri imagery. This verifies effective authorization for imagery from that origin, including browser CORS behavior. The Esri account's configured referrer list itself was not accessible and was not changed.

There is a separate elevation-service issue: `WorldElevation/Terrain/ImageServer/getSamples` returns ArcGIS JSON error **498, Invalid Token**, despite HTTP 200. This occurs in both the actual hosted `/site/` app and the rebuilt local production bundle. The renderer appropriately retains its bundled terrain elevations, while satellite imagery succeeds. A request without credentials returns 499, Token Required. Do not describe elevation authentication as fixed or confuse its failure with the disabled imagery at the domain root.

The public Terrain3D sampling alternative was checked but rejected as a replacement: it returned coarse overview samples without the source/datum fields required by the existing validation. No unverified heights or new paid elevation service were introduced.

## Browser and preservation verification

The actual hosted `/site/` app was tested without intercepting or replacing its runtime configuration. The locally rebuilt production bundle was separately served as static files on port 5174, with its generated enabled configuration.

| Check | Actual hosted `/site/` | Local production bundle |
| --- | --- | --- |
| Successful imagery tile responses during audit | 202 | 212 |
| Satellite imagery near the building | Rendered, 62 visible tiles, zoom 18 | Rendered |
| Regional satellite imagery | Rendered | Rendered |
| Desktop and mobile | Rendered | Rendered |
| Script, console and CSP errors | None | None |
| Failed HTTP requests | None | None |
| ArcGIS JSON authentication error | Elevation 498 | Elevation 498 |
| Terrain patch seam difference | 0 m | 0 m |
| Full orbit samples | Finite cameras, rendered geometry, no WebGL context loss | Passed |

The active anchor is longitude `78.312086932`, latitude `17.402192529`, matching the bundled HMDA Plot 20 boundary. Parcel landscaping, roads and the existing 8–32 m imagery blend remain in place. Screenshots were visually reviewed for the mapped surroundings and terrain continuity. Sampled checks do not guarantee absence of every device-specific rendering issue.

Preservation checks against the rebuilt static bundle passed:

- 53 buyer checks, zero reported errors, six responsive viewport sizes. This suite deliberately mocks imagery off to isolate the buyer interactions.
- All 13 apartment layouts, 182 rooms and 2,588 room-navigation routes, including interior rendering and controls.
- 12 production packaging checks and 14 imagery recovery checks.

No building or apartment models were regenerated. The browser audit correctly reports an incomplete authentication check because of the elevation 498 response; it is not presented as an all-green end-to-end result.

[Hosted screenshot](../qa/evidence/production-esri/hosted-site/exterior.jpg) · [Hosted network and rendering report](../qa/evidence/production-esri/hosted-site/report.json) · [Local production report](../qa/evidence/production-esri/local-production/report.json) · [Buyer checks](../qa/evidence/production-esri/buyer-browser.json) · [13-apartment checks](../qa/evidence/production-esri/all-residences.json)

## Required production change

| Setting | Required value | Action |
| --- | --- | --- |
| Build command | `npm ci && npm run build:production` | Already correct |
| Publish directory | `build/site` | Change from `build` |
| `ARCGIS_IMAGERY_ENABLED` | `true` | Effective current build is correct |
| `ARCGIS_API_KEY` | Existing authorized browser key | Effective current build matches local |
| Source commit | `be2c754430b0e51857ccd01579e26128541948fa` | Already contains the production fix |

Approval is required before changing production, as explicitly requested by the user. The connected Render tools can inspect the service and trigger deployments but cannot update a static site's publish directory. No authenticated browser or Render CLI/API session was available for that field. The publish-directory correction therefore requires the Render dashboard or an authorized configuration channel with that capability. After approval and correction, rebuild/deploy the current commit, then verify the actual domain root again before marking the imagery issue resolved. [Render static-site deployment documentation](https://render.com/docs/static-sites)

## Files

The production-build fix already present in the deployed commit consists of `scripts/build-production.mjs`, `scripts/arcgis-runtime-config.mjs`, `scripts/verify_production_build.mjs`, package scripts, the build-directory ignore rule and deployment documentation.

This investigation adds `scripts/verify_production_esri.cjs`, this report and sanitized browser evidence. `scripts/verify_residences.mjs` now supports `BRIGADE_RESIDENCE_QA_DIR` so production checks can preserve historical evidence.

To repeat the sanitized browser audit:

```sh
BRIGADE_QA_URL=https://demo-brigade-barcelona.navme.space/ \
BRIGADE_QA_OUTPUT=/tmp/brigade-production-verification \
node scripts/verify_production_esri.cjs
```

The script requires Playwright and Chrome. It records URL origins and paths without query strings, redacts the configured credential, and captures only application views. No API key is included in this report, screenshots, Git changes or test logs.
