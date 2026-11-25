# Brigade project studio

Serve the repository's `dist/` folder and open `/admin/`. With the distributed empty configuration, the studio initializes a private IndexedDB workspace from the 13 brochure designs. Draft edits and uploads persist across reloads. **Review & publish → Create preview → Open buyer preview** opens the buyer application with that frozen snapshot in the current tab. Open **Navigation → Review draft collection** to inspect its source citations, images and orbitable models. Return with the browser Back button. Browser profiles and private-browsing sessions have separate data.

## Start a local Supabase environment

Use Docker, a local Supabase CLI and PostgreSQL's `psql`. Run the commands from the repository root. The CLI creates the local stack using `supabase/config.toml` and the migration in `supabase/migrations/`.

```sh
supabase start
supabase status
```

For an existing local development database, inspect its migration history before applying the supplied migration. Select its **localhost** connection string from `supabase status`. The optional draft fixture loads the brochure designs, building and wing labels.

```sh
psql "$BRIGADE_LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/local-fixtures.sql
```

In the local Studio Auth panel, create and confirm the team member's email/password account. Use a database owner session on the same local instance to grant that user a role. Supply the actual new Auth user UUID in the psql prompt.

```sql
\prompt 'Local Auth user UUID: ' staff_uuid
insert into brigade.memberships(org_id,user_id,role)
values ('63a0e538-6156-5be8-b090-90cf71b2f74b', :'staff_uuid'::uuid, 'publisher');
```

Set `url`, `publishableKey` and `projectId` in `dist/studio-config.js`. Use the local API URL, its public publishable key and fixture project UUID `1bbb1573-d697-5d9c-b882-4cae01e7150e`. Browser settings are public. Server secrets and service-role credentials belong outside the static site. Configure `brigade` as an exposed Data API schema and keep `brigade_private` unexposed. Enable anonymous Auth for buyer enquiry and consent workflows. The supplied local configuration declares these settings. Serve the site and sign into `/admin/`.

The editor manages draft buildings, wings, floor mappings, verified apartment types and units, room destinations, plans, models, viewpoints and ordered camera paths. Create referenced parent records before dependent records. Attach a file through **Scene assets**, then reference it from **Architectural models** or **Floor plans**. GLBs must embed their buffers and textures. Uploads use unique paths in a private bucket limited to 32 MiB per file. Supported formats are GLB, KTX2, JPEG, PNG and WebP.

The publisher can edit, freeze and approve draft snapshots. Review the frozen collection in the buyer interface and verify the source citation on each record before approving publication. Inventory, pricing and unit mappings require verified evidence. Both the selected floor and the design must belong to the same wing. The sales role can inspect content, visitor engagement and enquiries. Organization and membership provisioning requires a trusted database owner.

## Publication and privacy

The public API returns the latest approved snapshot via `POST /rest/v1/rpc/current_release` with `{"p_project":"<UUID>"}` and the `brigade` profile. Every preview freezes its relational content. An update after freezing causes stale approval to fail. Publication is serialized per project. Later edits preserve previous snapshots, and the audit log records the actor, resource, operation and timestamp. The buyer collection exposes record titles, citations, evidence labels and authored fields. Keep internal sales notes out of those public fields.

Supabase Storage read policies check the latest approved manifest. Draft files require team membership. Signed links expire after five minutes. Previously issued links retain their existing expiry after a new release. The database prevents deletion of objects referenced by draft records or version history. Reconcile unattached objects after failures and retire old files according to the project's retention policy.

Buyer browsing starts without an analytics identity. Enabling engagement tracking or sending a consented enquiry creates a Supabase anonymous visitor session. `buyer-v1` is the notice identifier. Analytics consent can be withdrawn through the buyer navigation menu. Each consent decision adds a versioned history record. Contact consent is collected separately on each enquiry. Events store the visitor UUID, project, event type, optional scene identifier and timestamp. Names, email and enquiry text are stored in the sales inbox. The analytics dashboard reports counts for the last 30 days. Enquiries are idempotent per submission UUID. The database enforces per-visitor submission limits. Configure Auth CAPTCHA/rate limits, account retention, access reviews and the operator's privacy notice for the intended deployment.

## Testing and rollback

`supabase/tests/security.mjs` creates an isolated PGlite PostgreSQL database. It creates test Auth roles/users and an RLS-enabled Storage metadata table, runs the migration, exercises tenant, publication, asset and consent paths, and rolls the migration back. The test never reads a configured database URL. To reproduce with an isolated test dependency, use:

```sh
npm install --prefix /tmp/brigade-pg-test @electric-sql/pglite@0.5.8
PGLITE_MODULE=/tmp/brigade-pg-test/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/security.mjs
```

Results are in `qa/database-security.json`. The static admin draft flow was exercised in Chrome 158 with 390 × 844, 360 × 800 and 820 × 1180 viewports. The 390 × 844 run uploaded a model, froze a preview and rendered the uploaded GLB using WebGL2. Results are in `qa/admin-browser.json`. To repeat against a running site, use `node scripts/verify_studio.mjs` with Playwright installed and a Chrome channel available. Hosted Auth token renewal, CAPTCHA, the PostgREST gateway, Storage object service and actual email delivery require integration testing against the operator's chosen Supabase environment. Contact requests currently reach the database inbox.

`supabase/rollback/brigade_studio.sql` removes the dedicated schemas and project data. Use the rollback only on an explicitly selected, backed-up database. Empty and remove the dedicated bucket through the Storage API first. The transaction rolls back on failure.

Supabase documents custom schema exposure, RLS and private bucket access. [Custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas) · [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
