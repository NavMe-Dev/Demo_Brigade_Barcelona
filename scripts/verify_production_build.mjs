// Production packaging checks use only synthetic credentials and tiny fixtures.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildProduction } from './build-production.mjs';

const fixture = await mkdtemp(join(tmpdir(), 'brigade-production-check-'));
const source = join(fixture, 'dist');
const destination = join(fixture, 'build/site');
const runtime = join(destination, 'data/arcgis-runtime.json');
const rootRuntime = join(fixture, 'build/data/arcgis-runtime.json');
const template = '{"arcgisImageryEnabled":false,"arcgisApiKey":""}\n';
const repositoryTemplate = new URL('../dist/data/arcgis-runtime.json', import.meta.url);
const originalTemplate = await readFile(repositoryTemplate, 'utf8');
let sourceBuilds = 0;
const buildSource = async () => { sourceBuilds++; };
const build = environment => buildProduction({ environment, source, destination, buildSource });
let checks = 0;
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
  console.log('PASS ' + name);
}

try {
  await mkdir(join(source, 'data'), { recursive: true });
  await mkdir(join(source, 'experience'), { recursive: true });
  await writeFile(join(source, 'data/arcgis-runtime.json'), template);
  await writeFile(join(source, 'index.html'), 'root fixture');
  await writeFile(join(source, 'experience/index.html'), 'nested route fixture');
  await writeFile(join(fixture, '.env.local'), 'ARCGIS_IMAGERY_ENABLED=true\nARCGIS_API_KEY=synthetic-local-key\n');

  await build({ ARCGIS_IMAGERY_ENABLED: 'true', ARCGIS_API_KEY: 'synthetic-host-key' });
  let config = JSON.parse(await readFile(runtime, 'utf8'));
  check('Enabled production output uses the supplied hosting credential', config.arcgisImageryEnabled && config.arcgisApiKey === 'synthetic-host-key');
  check('Nested experience route is preserved', await readFile(join(destination, 'experience/index.html'), 'utf8') === 'nested route fixture');
  check('Render build root mirrors the production site', JSON.parse(await readFile(rootRuntime, 'utf8')).arcgisApiKey === 'synthetic-host-key');
  check('Production packaging preserves the disabled source template', await readFile(join(source, 'data/arcgis-runtime.json'), 'utf8') === template);

  const beforeInvalid = await readFile(runtime, 'utf8');
  const beforeBuilds = sourceBuilds;
  for (const [label, environment] of [
    ['missing enable flag', {}],
    ['invalid enable flag', { ARCGIS_IMAGERY_ENABLED: 'yes', ARCGIS_API_KEY: 'synthetic-secret' }],
    ['missing enabled key', { ARCGIS_IMAGERY_ENABLED: 'true' }],
    ['blank enabled key', { ARCGIS_IMAGERY_ENABLED: 'true', ARCGIS_API_KEY: '   ' }],
  ]) {
    await assert.rejects(build(environment), /ARCGIS_/);
    check('Rejects ' + label + ' before changing the artifact', await readFile(runtime, 'utf8') === beforeInvalid && sourceBuilds === beforeBuilds);
  }

  await build({ ARCGIS_IMAGERY_ENABLED: 'false', ARCGIS_API_KEY: 'synthetic-unused-key' });
  config = JSON.parse(await readFile(runtime, 'utf8'));
  check('Disabled build removes a previously enabled credential', config.arcgisImageryEnabled === false && config.arcgisApiKey === '');
  await build({ ARCGIS_IMAGERY_ENABLED: 'false' });
  check('Local environment files are not copied into the runtime configuration', !(await readFile(runtime, 'utf8')).includes('synthetic-local-key'));

  // Exercise the real CLI failure path without using any host or local credential.
  const environment = { ...process.env };
  delete environment.ARCGIS_IMAGERY_ENABLED;
  delete environment.ARCGIS_API_KEY;
  const cli = spawnSync(process.execPath, [new URL('./build-production.mjs', import.meta.url).pathname], {
    cwd: fixture, env: environment, encoding: 'utf8',
  });
  check('CLI refuses missing hosting configuration despite a local env file', cli.status === 1 && cli.stderr.includes('ARCGIS_IMAGERY_ENABLED'));
  const badFlag = spawnSync(process.execPath, [new URL('./build-production.mjs', import.meta.url).pathname], {
    cwd: fixture, env: { ...environment, ARCGIS_IMAGERY_ENABLED: 'synthetic-sensitive-invalid-flag', ARCGIS_API_KEY: 'synthetic-sensitive-key' }, encoding: 'utf8',
  });
  check('Diagnostics never print supplied environment values', badFlag.status === 1 && !/synthetic-sensitive/.test(badFlag.stdout + badFlag.stderr));
  check('Repository runtime template remains unchanged', await readFile(repositoryTemplate, 'utf8') === originalTemplate);
  console.log(`${checks} production build checks passed.`);
} finally {
  await rm(fixture, { recursive: true, force: true });
}
