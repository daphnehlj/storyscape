import type { Scene } from '@app/shared';

// What the agent reads back to check its own work.
export function describeScene(scene: Scene): string {
  const { terrain, environment } = scene;
  const lines = [
    `World "${scene.title}" — ${scene.bounds.size}m square.`,
    `Terrain: ${terrain.biome}, heightVariation ${terrain.heightVariation}${terrain.water ? `, water at y=${terrain.water.level}` : ''}.`,
    `Environment: ${environment.timeOfDay}, ${environment.weather}, fog ${environment.fogDensity}, palette ${environment.palette?.join(' ') ?? 'none'}.`,
  ];

  if (scene.zones.length === 0) {
    lines.push('No zones yet.');
  } else {
    lines.push('Zones:');
    for (const zone of scene.zones) {
      const where = zone.elevation > 0 ? `sky at y=${zone.elevation} on a ${zone.platform} platform` : 'ground';
      const objects = scene.objects.filter((o) => o.zoneId === zone.id);
      const scatters = scene.scatters.filter((s) => s.zoneId === zone.id);
      lines.push(
        `- ${zone.id} "${zone.name}" at [${zone.center.join(', ')}] radius ${zone.radius}, ${where}: ` +
          `${objects.length} objects, ${scatters.reduce((n, s) => n + s.count, 0)} scattered.`,
      );
      for (const object of objects) lines.push(`    ${describeObject(object, zone.elevation > 0 ? `the ${zone.platform} platform` : 'the ground')}`);
      for (const s of scatters) lines.push(`    ${s.id}: ${s.count}× ${s.assetIds.join('/')}`);
    }
  }

  const loose = scene.objects.filter((o) => o.zoneId === undefined);
  if (loose.length > 0) {
    lines.push('Objects not in any zone:');
    for (const object of loose) lines.push(`  ${describeObject(object, 'the ground')}`);
  }

  return lines.join('\n');
}

function describeObject(object: Scene['objects'][number], surface: string): string {
  const [x, y, z] = object.position;
  const place = object.snapToGround ? `[${x}, ~, ${z}] on ${surface}` : `[${x}, ${y}, ${z}] floating`;
  return `${object.id}: ${object.assetId}${object.label ? ` "${object.label}"` : ''} ${object.size}m at ${place}`;
}
