import { cp, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { arcgisRuntimeConfig } from './arcgis-runtime-config.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));

export async function buildProduction({
  environment = process.env,
  source = join(project, 'dist'),
  destination = join(project, 'build/site'),
  buildSource = () => import('./build.mjs'),
} = {}) {
  // Validate before rebuilding sources or touching an existing deployment artifact.
  const config = arcgisRuntimeConfig(environment);
  await buildSource();
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(join(parent, '.site-'));
  try {
    await cp(source, stage, { recursive: true });
    await mkdir(join(stage, 'data'), { recursive: true });
    await writeFile(join(stage, 'data/arcgis-runtime.json'), JSON.stringify(config) + '\n');
    await rm(destination, { recursive: true, force: true });
    await rename(stage, destination);
    // Render currently publishes the `build` directory. Keep the canonical
    // build/site artifact for hosts configured to publish it, and mirror its
    // contents into the parent so the current Render setting serves the app at
    // the domain root as well.
    await cp(destination, parent, { recursive: true, force: true });
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  return { imageryEnabled: config.arcgisImageryEnabled };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await buildProduction();
    console.log(`Production site built in build/site with Esri imagery ${result.imageryEnabled ? 'enabled' : 'disabled'}.`);
  } catch (error) {
    // Validation messages never include the environment value or credential.
    console.error('Production build failed: ' + error.message);
    process.exitCode = 1;
  }
}
