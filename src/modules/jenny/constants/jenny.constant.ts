import { TIME_UNITS } from '@Constants/time.constant';
import { OPENAI_MODELS } from '@Constants/openai.constant';
import { LLM_MESSAGE_ROLES } from '@Constants/llm.constant';

export const JENNY_CONTEXT_TYPES = {
  PROJECT: 'project',
} as const;

export type JennyContextType =
  (typeof JENNY_CONTEXT_TYPES)[keyof typeof JENNY_CONTEXT_TYPES];

export const JENNY_CONTEXT_TYPE_VALUES: readonly JennyContextType[] =
  Object.values(JENNY_CONTEXT_TYPES);

export const JENNY_CHAT_ROLES = {
  USER: LLM_MESSAGE_ROLES.USER,
  ASSISTANT: LLM_MESSAGE_ROLES.ASSISTANT,
} as const;

export type JennyChatRoleType =
  (typeof JENNY_CHAT_ROLES)[keyof typeof JENNY_CHAT_ROLES];

export const JENNY_CHAT_ROLE_VALUES: readonly JennyChatRoleType[] =
  Object.values(JENNY_CHAT_ROLES);

export const JENNY_LIMITS = {
  MAX_SOURCES: 10,
  MAX_MESSAGES: 20,
  MAX_QUOTATIONS: 50,
  MAX_LISTED_TASKS: 20,
  REQUESTS_PER_MINUTE: 20,
  MAX_LISTED_DOCUMENTS: 100,
  MAX_MESSAGE_LENGTH: 4000,
  MIN_CITED_NAME_LENGTH: 4,
  MIN_SEARCH_QUERY_LENGTH: 2,
  MAX_SEARCH_QUERY_LENGTH: 200,
  MAX_TOOL_CALLS_PER_ROUND: 4,
  MAX_TOOL_RESULT_CHARACTERS: 16000,
  CHAT_DEADLINE_MS: 2 * TIME_UNITS.MINUTE_MS,
} as const;

export const JENNY_SETTINGS = {
  MIN_TOOL_ROUNDS: 1,
  MAX_TOOL_ROUNDS: 10,
  DEFAULT_MAX_TOOL_ROUNDS: 5,
  DEFAULT_MODEL: OPENAI_MODELS.GPT_5_4_MINI,
} as const;

export const JENNY_ENVIRONMENT_KEYS = {
  MODEL: 'JENNY_MODEL',
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  MAX_TOOL_ROUNDS: 'JENNY_MAX_TOOL_ROUNDS',
} as const;

export const JENNY_TOOL_NAMES = {
  GET_QUOTATION: 'getQuotation',
  GET_PROJECT_TASKS: 'getProjectTasks',
  GET_PROJECT_STATUS: 'getProjectStatus',
  LIST_PROJECT_DOCUMENTS: 'listProjectDocuments',
  SEARCH_PROJECT_DOCUMENTS: 'searchProjectDocuments',
} as const;

export const JENNY_TOOL_ERRORS = {
  FAILED: 'tool_failed',
  UNKNOWN_TOOL: 'unknown_tool',
  INVALID_ARGUMENTS: 'invalid_arguments',
  TOO_MANY_TOOL_CALLS: 'too_many_tool_calls',
} as const;

export const JENNY_REPLY_TEXT = {
  TRUNCATION_MARKER: '…[truncated]',
  INCOMPLETE_ANSWER:
    'מצטערת, לא הצלחתי להשלים את התשובה. אפשר לנסח את השאלה מחדש?',
} as const;
