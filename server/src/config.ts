import { fileURLToPath } from 'node:url';

// Every model choice, timeout and budget in one place — swapping a model under
// time pressure should be a one-line change.

export type Tier = 'cheap' | 'mid' | 'agent';

export const MODEL_TIERS: Record<Tier, string> = {
  cheap: 'gpt-5.6-luna',
  mid: 'gpt-5.6-sol',
  agent: 'gpt-6-astra',
};

// Reasoning costs seconds. The agent runs dozens of small, well-specified tool
// calls, so it thinks as little as possible; reading an ambiguous scribble and
// designing the world are the calls worth thinking about.
export const REASONING_EFFORT: Record<Tier, 'minimal' | 'low' | 'medium' | 'high'> = {
  cheap: 'low',
  mid: 'medium',
  agent: 'low',
};

export const IMAGE_MODEL = 'gpt-image-2.5-flare';
export const MODERATION_MODEL = 'omni-moderation-latest';

export const TIMEOUTS_MS = {
  // Generous: a timeout here costs a whole retry, which is worse than waiting.
  llm: 180_000,
  moderation: 30_000,
  skybox: 120_000,
  agentRun: 300_000,
};

export const AGENT_MAX_TOOL_CALLS = 40;
export const MAX_HERO_OBJECTS = 4;

// Stands in until the brief picks colours from the drawing: [sky, ground, accent].
export const DEFAULT_PALETTE: [string, string, string] = ['#cfe3f7', '#8ec06c', '#f2c14e'];

export const WORLD_SIZE = 200;
export const SKY_HEIGHT = 120;

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const GENERATED_DIR = `${repoRoot}server/generated`;
export const UPLOADS_DIR = `${repoRoot}server/uploads`;
export const LIBRARY_PATH = `${repoRoot}web/public/assets/library/library.json`;
export const FIXTURES_DIR = `${repoRoot}fixtures`;

export function requireEnv(name: 'OPENAI_API_KEY'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — add it to server/.env.local`);
  return value;
}
