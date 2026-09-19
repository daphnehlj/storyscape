import type { Evidence } from '@app/shared';
import type { SlotKey, SlotScope, SlotValue } from './slots.js';
import type { SlotReading } from './readings.js';
import type { TemplateId } from './templates.js';

// Something the story left open that a lever downstream could act on.
export interface Gap<K extends SlotKey = SlotKey> {
  id: string;
  slot: K;
  scope: SlotScope;
  // Absent for world slots.
  entityId?: string;
  entityName?: string;
  evidence: Evidence;
  reading: SlotReading<SlotValue<K>>;
  templateId: TemplateId;
}

export interface ScoreFactors {
  V: number; // visual footprint of the slot
  P: number; // prominence of the entity in this story
  U: number; // how much we would be guessing
  D: number; // how differently the options would look
  C: number; // how answerable and fun it is for a child
}

export interface RankedGap extends Gap {
  factors: ScoreFactors;
  score: number; // V × P × U × D × C, before selection penalties
  effective: number; // score after selection penalties
  selected: boolean;
  reason: string; // why it was asked, or why it wasn't
}
