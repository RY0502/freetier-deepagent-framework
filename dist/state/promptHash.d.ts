/**
 * Deterministic hash used as the durable-state primary key for a user
 * task. Same prompt (after trim/lowercase normalization) always maps to
 * the same run, enabling resume-on-restart and cross-provider handoff.
 */
export declare function hashUserPrompt(userPrompt: string): string;
