import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { AgentAction, AgentFinish } from '@langchain/core/agents';
import type { LLMResult } from '@langchain/core/outputs';

const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.log(`[lifecycle] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(`[lifecycle] ${msg}`, meta ?? ''),
};

/**
 * Comprehensive logging callback handler that tracks:
 * - Tool calls (name, input params)
 * - Tool results (output)
 * - LLM calls (model, prompt length, response length)
 * - Agent actions and completions
 */
export class LoggingCallbackHandler extends BaseCallbackHandler {
  name = 'logging_callback_handler';

  onToolStart(toolInput: Record<string, unknown>, toolName: string): void {
    logger.info('Tool call starting', {
      tool: toolName,
      params: JSON.stringify(toolInput).slice(0, 200),
    });
  }

  onToolEnd(output: string, toolName: string): void {
    logger.info('Tool call completed', {
      tool: toolName,
      outputLength: output.length,
    });
  }

  onToolError(error: Error, toolName: string): void {
    logger.error('Tool call failed', {
      tool: toolName,
      error: error.message.slice(0, 200),
    });
  }

  onLLMStart(
    _llmInput: { prompts: string[] },
    _runId?: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _name?: string,
  ): void {
    const promptLength = _llmInput.prompts[0]?.length ?? 0;
    logger.info('LLM call starting', {
      model: _name ?? 'unknown',
      promptLength,
    });
  }

  onLLMEnd(output: LLMResult): void {
    const responseLength = output.generations[0]?.[0]?.text?.length ?? 0;
    logger.info('LLM call completed', {
      responseLength,
      tokenUsage: output.llmOutput?.['usage_metadata'],
    });
  }

  onLLMError(error: Error): void {
    logger.error('LLM call failed', {
      error: error.message.slice(0, 200),
    });
  }

  onAgentAction(action: AgentAction): void {
    logger.info('Agent action', {
      tool: action.tool,
      toolInput: JSON.stringify(action.toolInput).slice(0, 150),
    });
  }

  onAgentFinish(finish: AgentFinish): void {
    const returnValues = finish.returnValues as Record<string, unknown>;
    const outputLength = typeof returnValues?.output === 'string' ? returnValues.output.length : JSON.stringify(returnValues).length;
    logger.info('Agent finished', {
      outputLength,
    });
  }
}
