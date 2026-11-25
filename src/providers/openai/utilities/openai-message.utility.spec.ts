import {
  toOpenAiTool,
  toOpenAiMessage,
  fromOpenAiCompletion,
} from './openai-message.utility';

import type { CompletionUsage } from 'openai/resources/completions';
import type { ChatCompletion } from 'openai/resources/chat/completions';

const DEFAULT_USAGE: CompletionUsage = {
  total_tokens: 15,
  prompt_tokens: 10,
  completion_tokens: 5,
};

const completion = (
  message: ChatCompletion.Choice['message'],
  usage: CompletionUsage | null = DEFAULT_USAGE,
): ChatCompletion => ({
  ...(usage ? { usage } : {}),
  id: 'chatcmpl-1',
  created: 0,
  model: 'gpt-5.4-mini',
  object: 'chat.completion',
  choices: [{ index: 0, message, logprobs: null, finish_reason: 'stop' }],
});

describe('OpenAI message mapping', () => {
  it('maps every conversation role to the chat completions shape', () => {
    expect(toOpenAiMessage({ role: 'system', content: 'הנחיות' })).toEqual({
      role: 'system',
      content: 'הנחיות',
    });
    expect(toOpenAiMessage({ role: 'user', content: 'שאלה' })).toEqual({
      role: 'user',
      content: 'שאלה',
    });
    expect(
      toOpenAiMessage({ role: 'assistant', content: 'תשובה', toolCalls: [] }),
    ).toEqual({ role: 'assistant', content: 'תשובה' });
    expect(
      toOpenAiMessage({
        role: 'assistant',
        content: null,
        toolCalls: [{ id: 'c1', name: 'getQuotation', arguments: '{}' }],
      }),
    ).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'c1',
          type: 'function',
          function: { name: 'getQuotation', arguments: '{}' },
        },
      ],
    });
    expect(
      toOpenAiMessage({ role: 'tool', toolCallId: 'c1', content: '{"a":1}' }),
    ).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"a":1}' });
  });

  it('maps tool definitions to function tools', () => {
    expect(
      toOpenAiTool({
        name: 'getQuotation',
        description: 'quotations',
        parameters: { type: 'object' },
      }),
    ).toEqual({
      type: 'function',
      function: {
        name: 'getQuotation',
        description: 'quotations',
        parameters: { type: 'object' },
      },
    });
  });

  it('reads content, function tool calls and token usage from a completion', () => {
    expect(
      fromOpenAiCompletion(
        completion({
          role: 'assistant',
          refusal: null,
          content: null,
          tool_calls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'getProjectStatus', arguments: '{}' },
            },
            { id: 'c2', type: 'custom', custom: { name: 'x', input: 'y' } },
          ],
        }),
      ),
    ).toEqual({
      content: null,
      usage: { inputTokens: 10, outputTokens: 5 },
      toolCalls: [{ id: 'c1', name: 'getProjectStatus', arguments: '{}' }],
    });
  });

  it('treats missing usage as zero tokens', () => {
    expect(
      fromOpenAiCompletion(
        completion({ role: 'assistant', refusal: null, content: 'שלום' }, null),
      ),
    ).toEqual({
      toolCalls: [],
      content: 'שלום',
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });
});
