import type { Library } from '@app/shared';
import { AGENT_MAX_TOOL_CALLS, TIMEOUTS_MS } from '../config.js';
import { callWithTools, toolResultItems, userMessage, type ConversationItem, type ToolResult } from '../llm/index.js';
import { AGENT_NUDGE_MESSAGE, AGENT_START_MESSAGE, agentSystemPrompt, type KeyObject } from '../prompts.js';
import type { Brief } from '../pipeline/brief.js';
import type { DrawingReading } from '../pipeline/readDrawing.js';
import { logEvent, nextId, nextSeed, updateScene, type World } from '../world/store.js';
import { ToolError, TOOL_DEFS, runTool, type ToolContext } from './tools.js';

export interface AgentRunResult {
  toolCalls: number;
  finished: boolean;
}

export async function runAgent({
  world,
  brief,
  reading,
  library,
  keyObjects,
}: {
  world: World;
  brief: Brief;
  reading: DrawingReading;
  library: Library;
  keyObjects: KeyObject[];
}): Promise<AgentRunResult> {
  const instructions = agentSystemPrompt(brief, reading, library, keyObjects);
  const ctx: ToolContext = {
    library: new Map(library.map((e) => [e.id, e])),
    nextId: (prefix) => nextId(world, prefix),
    nextSeed: () => nextSeed(world),
  };

  let history: ConversationItem[] = userMessage(AGENT_START_MESSAGE);
  let toolCalls = 0;
  let nudged = false;
  const deadline = Date.now() + TIMEOUTS_MS.agentRun;

  while (toolCalls < AGENT_MAX_TOOL_CALLS && Date.now() < deadline) {
    const turn = await callWithTools('agent', { instructions, history, tools: TOOL_DEFS });
    history = [...history, ...turn.items];

    if (turn.toolCalls.length === 0) {
      // One nudge, then stop: a model that won't call tools won't start now.
      if (nudged) return { toolCalls, finished: false };
      nudged = true;
      history = [...history, ...userMessage(AGENT_NUDGE_MESSAGE)];
      continue;
    }

    const results: ToolResult[] = [];
    for (const call of turn.toolCalls) {
      toolCalls += 1;
      try {
        const outcome = runTool(call.name, call.arguments, world.scene, ctx);
        // Only commit if the tool changed something; describe_scene returns the same scene.
        if (outcome.scene !== world.scene) updateScene(world, () => outcome.scene);
        logEvent(world, outcome.result);
        results.push({ callId: call.callId, output: outcome.result });
        if (outcome.finished) return { toolCalls, finished: true };
      } catch (error) {
        // A bad call is the agent's problem to fix, not a reason to end the run.
        const message = error instanceof ToolError ? error.message : `Failed: ${describeError(error)}`;
        logEvent(world, `${call.name} failed: ${message}`);
        results.push({ callId: call.callId, output: `ERROR: ${message}` });
      }
    }
    history = [...history, ...toolResultItems(results)];
  }

  logEvent(world, toolCalls >= AGENT_MAX_TOOL_CALLS ? 'Reached the tool call budget.' : 'Ran out of time.');
  return { toolCalls, finished: false };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
