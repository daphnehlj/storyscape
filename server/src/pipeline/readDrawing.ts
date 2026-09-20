import { z } from 'zod';
import { HexColorSchema } from '@app/shared';
import { completeJson } from '../llm/index.js';
import { readDrawingPrompt } from '../prompts.js';
import type { Drawing } from '../uploads.js';

// What the machine sees in the scribble. Internal to the server, and the most
// demoable artifact we have: it is the evidence for every choice downstream.
export const DrawingElementSchema = z.object({
  name: z.string().describe('what it is, in a word or two'),
  description: z.string().describe('what it actually looks like on the page'),
  kind: z.enum(['landscape', 'building', 'plant', 'creature', 'person', 'vehicle', 'water', 'sky', 'object', 'unclear']),
  // Page coordinates, 0,0 = top-left. The agent maps these onto the world.
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  relativeSize: z.number().min(0).max(1).describe('how much of the page height it takes up'),
  colors: z.array(HexColorSchema).max(4),
  confidence: z.number().min(0).max(1).describe('1 = unmistakable, 0.3 = a guess at a scribble'),
});
export type DrawingElement = z.infer<typeof DrawingElementSchema>;

export const DrawingReadingSchema = z.object({
  summary: z.string().describe('one sentence a child would agree with'),
  setting: z.string().describe('where this seems to take place'),
  mood: z.string(),
  elements: z.array(DrawingElementSchema).min(1).max(20),
  dominantColors: z.array(HexColorSchema).min(1).max(6),
});
export type DrawingReading = z.infer<typeof DrawingReadingSchema>;

export async function readDrawing(drawing: Drawing): Promise<DrawingReading> {
  return completeJson('mid', DrawingReadingSchema, readDrawingPrompt(drawing.dataUrl));
}

// Log lines for the agent panel: what we saw, and how sure we were.
export function describeReading(reading: DrawingReading): string[] {
  return [
    `Looking at the drawing: ${reading.summary}`,
    ...reading.elements.map(
      (e) => `  ${e.name} (${where(e)})${e.confidence < 0.5 ? " — though I'm not certain" : ''}`,
    ),
  ];
}

function where(element: DrawingElement): string {
  const across = element.x < 0.33 ? 'left' : element.x > 0.66 ? 'right' : 'middle';
  const down = element.y < 0.33 ? 'top' : element.y > 0.66 ? 'bottom' : 'centre';
  return `${down} ${across}`;
}
