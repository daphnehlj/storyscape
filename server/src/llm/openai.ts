import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { toResponseInputItems } from 'openai/lib/responses/ResponseInputItems';
import type { ResponseInputItem } from 'openai/resources/responses/responses';
import { z } from 'zod';
import { IMAGE_MODEL, MODEL_TIERS, MODERATION_MODEL, REASONING_EFFORT, TIMEOUTS_MS, requireEnv } from '../config.js';
import type { AgentTurn, ConversationItem, Tier, ToolCall, ToolDef, ToolResult } from './types.js';

// The only file that imports the OpenAI SDK. Everything else goes through llm/index.ts.

let client: OpenAI | undefined;
function getClient(): OpenAI {
  // One retry only: a retried agent turn repeats work the loop has already done.
  client ??= new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY'), timeout: TIMEOUTS_MS.llm, maxRetries: 1 });
  return client;
}

// ConversationItem is a brand so callers can't depend on SDK shapes; these two
// casts are the only place the brand is applied or removed.
const toItems = (items: ResponseInputItem[]) => items as unknown as ConversationItem[];
const fromItems = (items: ConversationItem[]) => items as unknown as ResponseInputItem[];

export interface PromptInput {
  instructions: string;
  input: string;
  // A data URL (data:image/png;base64,...) sent alongside the text.
  imageDataUrl?: string;
}

// A prompt with an image becomes one user message holding both parts.
function toInput({ input, imageDataUrl }: PromptInput): string | ResponseInputItem[] {
  if (!imageDataUrl) return input;
  return [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: input },
        { type: 'input_image', image_url: imageDataUrl, detail: 'auto' },
      ],
    },
  ];
}

export async function complete(tier: Tier, prompt: PromptInput): Promise<string> {
  const response = await getClient().responses.create({
    model: MODEL_TIERS[tier],
    instructions: prompt.instructions,
    input: toInput(prompt),
    reasoning: { effort: REASONING_EFFORT[tier] },
  });
  return response.output_text;
}

export async function completeJson<T extends z.ZodObject>(
  tier: Tier,
  schema: T,
  prompt: PromptInput,
): Promise<z.infer<T>> {
  const response = await getClient().responses.parse({
    model: MODEL_TIERS[tier],
    instructions: prompt.instructions,
    input: toInput(prompt),
    reasoning: { effort: REASONING_EFFORT[tier] },
    text: { format: zodTextFormat(schema, 'result') },
  });
  // Re-parse: output_parsed is typed from the schema, but a refusal leaves it null.
  return schema.parse(response.output_parsed);
}

export function userMessage(text: string): ConversationItem[] {
  return toItems([{ role: 'user', content: text }]);
}

export function toolResultItems(results: ToolResult[]): ConversationItem[] {
  return toItems(results.map((r) => ({ type: 'function_call_output', call_id: r.callId, output: r.output })));
}

function toJsonSchemaParams(parameters: z.ZodObject): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(parameters);
  return schema;
}

export async function callWithTools(
  tier: Tier,
  { instructions, history, tools }: { instructions: string; history: ConversationItem[]; tools: ToolDef[] },
): Promise<AgentTurn> {
  const response = await getClient().responses.create({
    model: MODEL_TIERS[tier],
    instructions,
    input: fromItems(history),
    reasoning: { effort: REASONING_EFFORT[tier] },
    // One call at a time: each call edits the scene the next one reads.
    parallel_tool_calls: false,
    // Not strict: strict mode forbids optional fields, and every handler zod-validates anyway.
    tools: tools.map((t) => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: toJsonSchemaParams(t.parameters),
      strict: false,
    })),
  });

  const toolCalls: ToolCall[] = response.output.flatMap((item) =>
    item.type === 'function_call' ? [{ callId: item.call_id, name: item.name, arguments: item.arguments }] : [],
  );
  // Replays reasoning items along with function calls, which reasoning models require.
  return { toolCalls, text: response.output_text, items: toItems(toResponseInputItems(response.output)) };
}

export async function isFlaggedImage(imageDataUrl: string): Promise<boolean> {
  const result = await getClient().moderations.create(
    { model: MODERATION_MODEL, input: [{ type: 'image_url', image_url: { url: imageDataUrl } }] },
    { timeout: TIMEOUTS_MS.moderation },
  );
  return result.results.some((r) => r.flagged);
}

export async function generateImage(prompt: string, size: string): Promise<Buffer> {
  const result = await getClient().images.generate(
    { model: IMAGE_MODEL, prompt, size, output_format: 'jpeg', quality: 'medium' },
    { timeout: TIMEOUTS_MS.skybox },
  );
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('image model returned no image data');
  return Buffer.from(b64, 'base64');
}
