import { BaseCallbackHandler } from '@langchain/core/callbacks/base';

/** A single captured tool invocation (includes sub-agent calls, since
 * `deepagents` exposes each sub-agent to the parent as a callable tool). */
export interface CapturedToolCall {
  tool: string;
  input: Record<string, unknown>;
}

/**
 * Callback handler used only by the eval suite to record every tool
 * call (including sub-agent delegations) made during a run, so eval
 * cases can assert on *what the agent actually decided to do* — e.g.
 * "did it route to live-data-subagent?", "did it pass topic:'news' to
 * tavily_search?" — rather than only inspecting the final text.
 */
export class EvalCaptureHandler extends BaseCallbackHandler {
  name = 'eval_capture_handler';
  readonly calls: CapturedToolCall[] = [];

  onToolStart(toolInput: Record<string, unknown>, toolName: string): void {
    this.calls.push({ tool: toolName, input: toolInput });
  }

  /** Convenience: tool names invoked, in call order (may contain duplicates). */
  toolNames(): string[] {
    return this.calls.map((c) => c.tool);
  }

  /** Convenience: all captured calls for a given tool name. */
  callsFor(toolName: string): CapturedToolCall[] {
    return this.calls.filter((c) => c.tool === toolName);
  }

  reset(): void {
    this.calls.length = 0;
  }
}
