import type { Scene } from './contract.js';

// Rules the zod types can't express. Returns every problem found (empty = valid)
// so A can throw with the full list and B can log it.
export function validateSceneRefs(scene: Scene): string[] {
  const problems: string[] = [];
  const zoneIds = new Set(scene.zones.map((z) => z.id));

  const seen = new Set<string>();
  for (const { id } of [...scene.zones, ...scene.objects, ...scene.scatters]) {
    if (seen.has(id)) problems.push(`duplicate id "${id}"`);
    seen.add(id);
  }

  for (const zone of scene.zones) {
    if (zone.elevation > 0 && !zone.platform) {
      problems.push(`zone "${zone.id}" has elevation ${zone.elevation} but no platform`);
    }
  }

  for (const obj of scene.objects) {
    if (!(obj.assetId in scene.assets)) {
      problems.push(`object "${obj.id}" uses unknown asset "${obj.assetId}"`);
    }
    if (obj.zoneId !== undefined && !zoneIds.has(obj.zoneId)) {
      problems.push(`object "${obj.id}" is in unknown zone "${obj.zoneId}"`);
    }
  }

  for (const scatter of scene.scatters) {
    for (const assetId of scatter.assetIds) {
      if (!(assetId in scene.assets)) {
        problems.push(`scatter "${scatter.id}" uses unknown asset "${assetId}"`);
      }
    }
    if (!zoneIds.has(scatter.zoneId)) {
      problems.push(`scatter "${scatter.id}" is in unknown zone "${scatter.zoneId}"`);
    }
    if (scatter.sizeRange[0] > scatter.sizeRange[1]) {
      problems.push(`scatter "${scatter.id}" has sizeRange min > max`);
    }
  }

  for (const [key, asset] of Object.entries(scene.assets)) {
    if (asset.id !== key) problems.push(`asset key "${key}" does not match its id "${asset.id}"`);
    if (asset.source !== 'generated') continue;
    if (asset.status === 'ready' && !asset.url) {
      problems.push(`asset "${key}" is ready but has no url`);
    }
    if (scene.assets[asset.fallbackAssetId]?.source !== 'library') {
      problems.push(`asset "${key}" fallback "${asset.fallbackAssetId}" is not a library asset in scene.assets`);
    }
  }

  const skybox = scene.environment.skybox;
  if (skybox?.status === 'ready' && !skybox.url) problems.push('skybox is ready but has no url');

  return problems;
}
