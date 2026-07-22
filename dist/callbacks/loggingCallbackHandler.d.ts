import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { AgentAction, AgentFinish } from '@langchain/core/agents';
import type { LLMResult } from '@langchain/core/outputs';
/**
 * Comprehensive logging callback handler that tracks:
 * - Tool calls (name, input params)
 * - Tool results (output)
 * - LLM calls (model, prompt length, response length)
 * - Agent actions and completions
 */
export declare class LoggingCallbackHandler extends BaseCallbackHandler {
    name: string;
    onToolStart(toolInput: Record<string, unknown>, toolName: string): void;
    onToolEnd(output: string, toolName: string): void;
    onToolError(error: Error, toolName: string): void;
    onLLMStart(_llmInput: {
        prompts: string[];
    }, _runId?: string, _parentRunId?: string, _tags?: string[], _metadata?: Record<string, unknown>, _name?: string): void;
    onLLMEnd(output: LLMResult): void;
    onLLMError(error: Error): void;
    onAgentAction(action: AgentAction): void;
    onAgentFinish(finish: AgentFinish): void;
}
