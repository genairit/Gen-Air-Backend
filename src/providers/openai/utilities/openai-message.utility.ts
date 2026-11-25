import type {
  TLlmMessage,
  ILlmToolCall,
  ILlmCompletion,
  ILlmMessageByRole,
  ILlmToolDefinition,
} from '@Interfaces/llm.interface';

import {
  OPENAI,
  OPENAI_MODELS,
  OPENAI_GPT_5_4_MINI_PRICING,
} from '@Constants/openai.constant';

import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionFunctionTool,
  ChatCompletionMessageToolCall,
  ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions';

import { LLM_MESSAGE_ROLES } from '@Constants/llm.constant';

type TOpenAiMessageMappers = {
  [Role in keyof ILlmMessageByRole]: (
    message: TLlmMessage<Role>,
  ) => ChatCompletionMessageParam;
};

const toOpenAiToolCall = (
  call: ILlmToolCall,
): ChatCompletionMessageFunctionToolCall => ({
  id: call.id,
  type: OPENAI.FUNCTION_TOOL_TYPE,
  function: { name: call.name, arguments: call.arguments },
});

const OPENAI_MESSAGE_MAPPERS: TOpenAiMessageMappers = {
  [LLM_MESSAGE_ROLES.USER]: (message) => ({
    role: message.role,
    content: message.content,
  }),
  [LLM_MESSAGE_ROLES.SYSTEM]: (message) => ({
    role: message.role,
    content: message.content,
  }),
  [LLM_MESSAGE_ROLES.TOOL]: (message) => ({
    role: message.role,
    content: message.content,
    tool_call_id: message.toolCallId,
  }),
  [LLM_MESSAGE_ROLES.ASSISTANT]: (message) => ({
    role: message.role,
    content: message.content,
    ...(message.toolCalls.length > 0
      ? { tool_calls: message.toolCalls.map(toOpenAiToolCall) }
      : {}),
  }),
};

const isFunctionToolCall = (
  call: ChatCompletionMessageToolCall,
): call is ChatCompletionMessageFunctionToolCall =>
  call.type === OPENAI.FUNCTION_TOOL_TYPE;

const fromOpenAiToolCall = (
  call: ChatCompletionMessageFunctionToolCall,
): ILlmToolCall => ({
  id: call.id,
  name: call.function.name,
  arguments: call.function.arguments,
});

export const toOpenAiMessage = <TRole extends keyof ILlmMessageByRole>(
  message: TLlmMessage<TRole>,
): ChatCompletionMessageParam => OPENAI_MESSAGE_MAPPERS[message.role](message);

export const toOpenAiTool = (
  tool: ILlmToolDefinition,
): ChatCompletionFunctionTool => ({
  type: OPENAI.FUNCTION_TOOL_TYPE,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
});

const estimateCostUsd = (completion: ChatCompletion): number | null => {
  const { model, usage } = completion;
  const hasKnownPricing = Object.values(OPENAI_MODELS).some(
    (knownModel) => knownModel === model,
  );

  if (!usage || !hasKnownPricing) {
    return null;
  }

  const pricing = OPENAI_GPT_5_4_MINI_PRICING;
  const cachedInput = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const standardInput = usage.prompt_tokens - cachedInput;
  const inputCost = standardInput * pricing.INPUT_USD;
  const cachedCost = cachedInput * pricing.CACHED_INPUT_USD;
  const outputCost = usage.completion_tokens * pricing.OUTPUT_USD;

  return (inputCost + cachedCost + outputCost) / pricing.TOKENS_PER_PRICE_UNIT;
};

export const fromOpenAiCompletion = (
  completion: ChatCompletion,
): ILlmCompletion => {
  const message = completion.choices.at(OPENAI.FIRST_CHOICE_INDEX)?.message;
  const toolCalls = message?.tool_calls ?? [];

  return {
    content: message?.content ?? null,
    toolCalls: toolCalls.filter(isFunctionToolCall).map(fromOpenAiToolCall),
    usage: {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      estimatedCostUsd: estimateCostUsd(completion),
      outputTokens: completion.usage?.completion_tokens ?? 0,
    },
  };
};
