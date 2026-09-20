import type { Scene } from '@app/shared';
import { DEFAULT_PALETTE, SKY_HEIGHT, WORLD_SIZE } from '../config.js';

// Valid from the first event: B can render this before the agent has done anything.
export function createInitialScene(id: string): Scene {
  return {
    version: 1,
    id,
    title: 'A new world',
    bounds: { size: WORLD_SIZE, skyHeight: SKY_HEIGHT },
    terrain: { biome: 'grassland', heightVariation: 0.3, seed: Math.floor(Math.random() * 2 ** 31) },
    environment: { timeOfDay: 'day', weather: 'clear', fogDensity: 0.2, palette: DEFAULT_PALETTE },
    zones: [],
    objects: [],
    scatters: [],
    assets: {},
  };
}
