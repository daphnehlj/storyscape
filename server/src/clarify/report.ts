import type { GapReport } from '@app/shared';
import type { RankedGap } from './types.js';

// Turns ranked gaps into something a person can read: the `gaps` event for the
// debug overlay, and a table for calibrating the constants from the terminal.

const round = (n: number) => Number(n.toFixed(3));

function inferredLabel(gap: RankedGap): string {
  const guess = gap.reading.guess;
  return guess === undefined ? 'agent picks' : String(guess);
}

export function toGapReports(ranked: RankedGap[]): GapReport[] {
  return ranked.map((g) => ({
    id: g.id,
    slot: g.slot,
    ...(g.entityName !== undefined && { entity: g.entityName }),
    evidence: g.evidence,
    templateId: g.templateId,
    factors: {
      V: round(g.factors.V),
      P: round(g.factors.P),
      U: round(g.factors.U),
      D: round(g.factors.D),
      C: round(g.factors.C),
    },
    score: round(g.score),
    selected: g.selected,
    reason: g.reason,
    inferred: inferredLabel(g),
  }));
}

const COLUMNS = ['', 'slot', 'entity', 'evidence', 'V', 'P', 'U', 'D', 'C', 'score', 'why'] as const;

export function formatGapTable(ranked: RankedGap[]): string {
  const f = (n: number) => n.toFixed(2);
  const rows = ranked.map((g) => [
    g.selected ? 'ASK' : '',
    g.slot,
    g.entityName ?? '—',
    g.evidence,
    f(g.factors.V),
    f(g.factors.P),
    f(g.factors.U),
    f(g.factors.D),
    f(g.factors.C),
    f(g.score),
    g.reason,
  ]);
  const widths = COLUMNS.map((c, i) => Math.max(c.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: readonly string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join('  ').trimEnd();
  return [line(COLUMNS), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}
