import type { Brief } from './normalizeBrief.js';
import type { SlotReading } from './readings.js';
import type { SlotKey, SlotScope } from './slots.js';
import { templateFor } from './templates.js';
import type { Gap } from './types.js';

// Pure: walks the normalized brief and reports every slot the story didn't
// settle. No model call, no ranking, no judgement about what's worth asking —
// that's rank.ts.

function toGap(
  slot: SlotKey,
  scope: SlotScope,
  reading: SlotReading<unknown>,
  entity?: { id: string; name: string },
): Gap {
  // The reading came out of this slot's own entry in a Readings map, so its
  // values are in this slot's vocabulary; Object.entries loses that pairing.
  return {
    id: `gap-${entity?.id ?? 'world'}-${slot}`,
    slot,
    scope,
    ...(entity && { entityId: entity.id, entityName: entity.name }),
    evidence: reading.evidence,
    reading: reading as Gap['reading'],
    templateId: templateFor(slot, reading.evidence === 'conflict'),
  };
}

function collect(
  readings: Record<string, SlotReading<unknown> | undefined>,
  scope: SlotScope,
  entity: { id: string; name: string } | undefined,
  out: Gap[],
): void {
  for (const [slot, reading] of Object.entries(readings)) {
    // The story settled it: stated, not asked.
    if (!reading || reading.evidence === 'explicit') continue;
    out.push(toGap(slot as SlotKey, scope, reading, entity));
  }
}

export function detectGaps(brief: Brief): Gap[] {
  const gaps: Gap[] = [];
  collect(brief.world, 'world', undefined, gaps);
  for (const zone of brief.zones) collect(zone.readings, 'zone', zone, gaps);
  for (const hero of brief.heroObjects) collect(hero.readings, 'hero', hero, gaps);
  return gaps;
}
