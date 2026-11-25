import type {
  TLlmMessage,
  ILlmToolCall,
  ILlmCompletion,
  ILlmMessageByRole,
  ILlmToolDefinition,
} from '@Interfaces/llm.interface';

import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionFunctionTool,
  ChatCompletionMessageToolCall,
  ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions';

import { OPENAI } from '@Constants/openai.constant';

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
  user: (message) => ({ role: message.role, content: message.content }),
  system: (message) => ({ role: message.role, content: message.content }),
  tool: (message) => ({
    role: message.role,
    content: message.content,
    tool_call_id: message.toolCallId,
  }),
  assistant: (message) => ({
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
      outputTokens: completion.usage?.completion_tokens ?? 0,
    },
  };
};
