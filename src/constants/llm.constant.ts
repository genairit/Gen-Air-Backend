export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export const LLM_MESSAGE_ROLES = {
  TOOL: 'tool',
  USER: 'user',
  SYSTEM: 'system',
  ASSISTANT: 'assistant',
} as const;

export type LlmMessageRoleType =
  (typeof LLM_MESSAGE_ROLES)[keyof typeof LLM_MESSAGE_ROLES];
