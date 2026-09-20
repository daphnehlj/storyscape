import type { z } from 'zod';

export type { Tier } from '../config.js';

export interface ToolDef {
  name: string;
  description: string;
  parameters: z.ZodObject;
}

export interface ToolCall {
  callId: string;
  name: string;
  // Raw JSON string from the model; the tool handler owns parsing it.
  arguments: string;
}

export interface ToolResult {
  callId: string;
  output: string;
}

// Opaque to callers: provider-specific conversation items that must be replayed
// verbatim (includes reasoning items the model needs to see again).
export type ConversationItem = { readonly __conversationItem: unique symbol };

export interface AgentTurn {
  toolCalls: ToolCall[];
  text: string;
  items: ConversationItem[];
}
