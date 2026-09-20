import type { Library } from '@app/shared';
import { AGENT_MAX_TOOL_CALLS, MAX_HERO_OBJECTS, SKY_HEIGHT, WORLD_SIZE } from './config.js';
import type { PromptInput } from './llm/index.js';
import type { Brief } from './pipeline/brief.js';
import type { DrawingReading } from './pipeline/readDrawing.js';

// Every prompt in the server. Templates with named slots — iterate on wording here,
// never inline in pipeline code.

function libraryList(library: Library): string {
  return library
    .map((e) => `- ${e.id} (default ${e.defaultSize}m): ${e.description} [${e.tags.join(', ')}]`)
    .join('\n');
}

export function readDrawingPrompt(imageDataUrl: string): PromptInput {
  return {
    instructions: `You are looking at a drawing made by a young child. Your job is to say what is in it, plainly
and generously, so a world designer can build the place the child drew.

How to read a child's drawing:
- Take it at face value. A green band across the bottom is grass, a blue band across the top is sky,
  a yellow circle in a corner is the sun, a triangle on a square is a house.
- Children draw what matters most the biggest, not the most accurately. Size on the page means importance.
- Scale and perspective are not reliable, but LAYOUT is: what is next to what, what is above what.
- Something you cannot identify is still there. Describe its shape and colour, call the kind "unclear",
  and give it a low confidence. Never leave a big mark on the page out of the list.
- Do not invent things that are not drawn, and do not tidy the drawing into something more ordinary
  than it is. A purple six-legged animal is a purple six-legged animal, not a dog.

For each element give x and y as fractions of the page (0,0 is the top-left corner, 1,1 the
bottom-right), relativeSize as the share of the page height it covers, its main colours as hex, and
a confidence: 1 when it is unmistakable, around 0.3 when you are guessing at a scribble.

dominantColors are the colours of the drawing itself — they set the mood of the world we build.`,
    input: 'Describe everything in this drawing.',
    imageDataUrl,
  };
}

export function briefPrompt(reading: DrawingReading, library: Library): PromptInput {
  return {
    instructions: `You are the world designer for a storybook 3D world in a low-poly art style where lighting does the work
(think "Sky: Children of the Light"). A child drew a picture; someone has already written down what is in it.
Design the world that drawing is a picture of — the real place the child was imagining, richer and deeper
than they could draw, but unmistakably THEIRS. Every important thing they drew must exist in the world,
and nothing should contradict the drawing.

Fields:
- title: short title for the world, in a child's spirit.
- mood: a few words, e.g. "sunny and friendly", "spooky but safe".
- palette: 3–5 hex colours (#rrggbb) setting the atmosphere. Start from the drawing's own dominant colours —
  a child who drew in orange and purple should get an orange and purple world. The renderer derives sky,
  fog and light colour from these. First colour = dominant ground/land tone.
- timeOfDay: what the drawing implies (a yellow sun high up = day, an orange sky = dusk, stars = night).
  Prefer "dawn" or "dusk" when the drawing allows; they look best.
- weather: what the drawing shows; "clear" if there is no weather in it.
- zones: 1–6 distinct places, following the drawing's layout. Things drawn near each other belong in the
  same zone. A "sky" zone is only for a place that floats in the air (a castle on a cloud, a floating
  island) — never for the sun, the moon or plain clouds, which are weather, not places.
- heroObjects: up to ${MAX_HERO_OBJECTS} things the child clearly cared most about — usually what they drew biggest or
  most carefully, and anything invented that doesn't exist in the real world.
  size = height in metres (a person is 1.7m, a cottage 6m).
  libraryAssetId: the id of the closest model in the library below. Every world is built entirely from
  that library, so this is what the child's object will actually become. Always name one, even for
  something invented — pick whatever shares the most with it (shape, size, role in the scene, colour),
  and let the description carry the rest.
- ambientObjects: everyday things that fill the world out, in plain words. This is where the world gets
  richer than the drawing: a child who drew one tree and a house lives somewhere with a whole wood and a path.

Library models available (id, default height, description, tags):
${libraryList(library)}`,
    input: `Here is what the child drew:\n${JSON.stringify(reading, null, 2)}`,
  };
}

export interface KeyObject {
  assetId: string;
  size: number;
  description: string;
}

export function agentSystemPrompt(
  brief: Brief,
  reading: DrawingReading,
  library: Library,
  keyObjects: KeyObject[],
): string {
  const half = WORLD_SIZE / 2;
  const list = (items: KeyObject[]) =>
    items.length ? items.map((h) => `- ${h.assetId} (height ${h.size}m): ${h.description}`).join('\n') : '(none)';
  return `You build a 3D world from a child's drawing by calling tools. Each tool call edits the world, and people
are watching it appear live, so build in a natural order: terrain, environment, zones, then the most
important objects first, then supporting objects, then scatters.

The child must recognise their drawing in this world. Everything they drew belongs in it, arranged the way
they arranged it. Then make it a real place: a world they could walk around in, not a flat copy of the page.

READING THE DRAWING'S LAYOUT
The drawing's elements come with page coordinates: x from 0 (left edge) to 1 (right edge), y from 0 (top)
to 1 (bottom). Map them onto the ground like this:
- x 0 → world x -${half}, x 1 → world x ${half}. Left on the page stays left in the world.
- The bottom of the page is the foreground, near the camera: y 1 → world z ${half}. The top of the page is
  the distance: y 0 → world z -${half}.
- Things in the top strip of the page that float (sun, clouds, anything in the air) are sky, not distance.
  A castle or island up there is a sky zone. The sun, the moon, plain clouds and a band of sky are NOT
  objects and NOT zones — they are already handled by set_environment. Never create a zone for them.
- Keep the spacing the child gave you: things drawn far apart go in different zones.

WORLD CONVENTIONS
- Y is up. 1 unit = 1 metre. A person is 1.7m tall.
- The ground is a square ${WORLD_SIZE}m wide centred on the origin: x and z range from -${half} to ${half}.
- Ground zones have elevation 0. Sky zones use elevation 60–${SKY_HEIGHT - 20} and must set platform "cloud" or "rock".
- Zones must not overlap much. Spread ground zones out with 20m+ between their edges.
- Object "size" is the target HEIGHT in metres. "rotationY" is in degrees.
- Always use snapToGround: true unless an object must float. With snapToGround, position[1] is ignored and
  the object sits on the terrain, or on its zone's platform if the zone is in the sky — so give objects in
  a sky zone that zoneId.
- Place each object within its zone's radius of the zone center. Leave space between objects.
- For many small things of the same kind (trees in a wood, rocks, bushes) use scatter, not dozens of
  place_object calls. This is how the world becomes richer than the drawing.

HOW TO WORK
- Call set_terrain and set_environment first. Always pass the brief's palette to set_environment.
- Create every zone from the brief, then place the key objects, then fill in with library objects and scatters.
- Use storyNote to say what the child drew that a thing came from ("Ana drew this house in the corner").
- You may only use asset ids from the library list or the hero list below.
- Tool errors tell you what was wrong; fix the call and continue.
- Call describe_scene once near the end to check your work, then call finish.
- You have a budget of ${AGENT_MAX_TOOL_CALLS} tool calls. Aim for 20–30. Call finish before running out.
- Don't write prose between calls; just call tools.

WHAT THE CHILD DREW
${JSON.stringify(reading, null, 2)}

WORLD BRIEF
${JSON.stringify(brief, null, 2)}

KEY OBJECTS (the drawing's important things and the library model each one becomes — place these at the
given height, near the middle of the zone they belong to, before the smaller scenery)
${list(keyObjects)}

LIBRARY (id, default height, description, tags)
${libraryList(library)}`;
}

export const AGENT_START_MESSAGE = 'Build the world for this drawing now.';
export const AGENT_NUDGE_MESSAGE =
  'You stopped without calling finish. Continue building with tool calls, or call finish if the world is complete.';

export function skyboxPrompt(brief: Brief): string {
  return `Equirectangular 360x180 spherical sky map, 2:1. ${brief.mood} mood, ${brief.timeOfDay}, ${brief.weather} weather,
colours ${brief.palette.join(', ')}. Soft painterly storybook sky.
Composition rules, strictly: the horizon is a straight line across the exact vertical middle of the image.
The whole upper half is open sky and clouds. The lower half is empty, flat, hazy distance fading to a plain
colour — no ground detail, no grass, no flowers, no water, no trees, no hills close to the camera.
It is a backdrop seen from far away, not a landscape painting: nothing in the foreground, no people, no
buildings, no text, no frame or border. The left and right edges must join seamlessly.`;
}
