import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
const logger = {
    info: (msg, meta) => console.log(`[lifecycle] ${msg}`, meta ?? ''),
    error: (msg, meta) => console.error(`[lifecycle] ${msg}`, meta ?? ''),
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
    onToolStart(toolInput, toolName) {
        logger.info('Tool call starting', {
            tool: toolName,
            params: JSON.stringify(toolInput).slice(0, 200),
        });
    }
    onToolEnd(output, toolName) {
        logger.info('Tool call completed', {
            tool: toolName,
            outputLength: output.length,
        });
    }
    onToolError(error, toolName) {
        logger.error('Tool call failed', {
            tool: toolName,
            error: error.message.slice(0, 200),
        });
    }
    onLLMStart(_llmInput, _runId, _parentRunId, _tags, _metadata, _name) {
        const promptLength = _llmInput.prompts[0]?.length ?? 0;
        logger.info('LLM call starting', {
            model: _name ?? 'unknown',
            promptLength,
        });
    }
    onLLMEnd(output) {
        const responseLength = output.generations[0]?.[0]?.text?.length ?? 0;
        logger.info('LLM call completed', {
            responseLength,
            tokenUsage: output.llmOutput?.['usage_metadata'],
        });
    }
    onLLMError(error) {
        logger.error('LLM call failed', {
            error: error.message.slice(0, 200),
        });
    }
    onAgentAction(action) {
        logger.info('Agent action', {
            tool: action.tool,
            toolInput: JSON.stringify(action.toolInput).slice(0, 150),
        });
    }
    onAgentFinish(finish) {
        const returnValues = finish.returnValues;
        const outputLength = typeof returnValues?.output === 'string' ? returnValues.output.length : JSON.stringify(returnValues).length;
        logger.info('Agent finished', {
            outputLength,
        });
    }
}
//# sourceMappingURL=loggingCallbackHandler.js.map