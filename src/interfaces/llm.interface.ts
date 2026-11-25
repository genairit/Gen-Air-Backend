import { LLM_MESSAGE_ROLES } from '@Constants/llm.constant';

export interface ILlmToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ILlmUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd?: number | null;
}

export type TLlmJsonSchema = Record<string, unknown>;

export interface ILlmToolDefinition {
  name: string;
  description: string;
  parameters: TLlmJsonSchema;
}

export interface ILlmMessageByRole {
  [LLM_MESSAGE_ROLES.USER]: { content: string };
  [LLM_MESSAGE_ROLES.SYSTEM]: { content: string };
  [LLM_MESSAGE_ROLES.TOOL]: { content: string; toolCallId: string };
  [LLM_MESSAGE_ROLES.ASSISTANT]: {
    content: string | null;
    toolCalls: ILlmToolCall[];
  };
}

export type TLlmMessage<
  TRole extends keyof ILlmMessageByRole = keyof ILlmMessageByRole,
> = {
  [Role in TRole]: { role: Role } & ILlmMessageByRole[Role];
}[TRole];

export interface ILlmCompletionRequest {
  signal: AbortSignal;
  messages: TLlmMessage[];
  tools: ILlmToolDefinition[];
}

export interface ILlmCompletion {
  usage: ILlmUsage;
  content: string | null;
  toolCalls: ILlmToolCall[];
}

export interface ILlmProvider {
  isConfigured: () => boolean;
  complete: (request: ILlmCompletionRequest) => Promise<ILlmCompletion>;
}
