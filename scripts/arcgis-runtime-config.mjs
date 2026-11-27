// Production credentials come only from the hosting process environment.
// Keep this module independent of dotenv and the local preview server.
export function arcgisRuntimeConfig(environment = process.env) {
  const flag = environment.ARCGIS_IMAGERY_ENABLED;
  if (flag !== 'true' && flag !== 'false') {
    throw new Error('Set ARCGIS_IMAGERY_ENABLED explicitly to true or false in the hosting build environment.');
  }
  const enabled = flag === 'true';
  const key = enabled ? (environment.ARCGIS_API_KEY || '').trim() : '';
  if (enabled && !key) {
    throw new Error('ARCGIS_API_KEY is required when ARCGIS_IMAGERY_ENABLED=true.');
  }
  return { arcgisImageryEnabled: enabled, arcgisApiKey: key };
}
