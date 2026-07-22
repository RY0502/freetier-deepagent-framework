import { createHash } from 'node:crypto';

/**
 * Deterministic hash used as the durable-state primary key for a user
 * task. Same prompt (after trim/lowercase normalization) always maps to
 * the same run, enabling resume-on-restart and cross-provider handoff.
 */
export function hashUserPrompt(userPrompt: string): string {
  const normalized = userPrompt.trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256').update(normalized).digest('hex');
}
