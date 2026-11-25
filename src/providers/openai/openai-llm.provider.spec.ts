import { OpenAiLlmProvider } from './openai-llm.provider';
import { LLM_MESSAGE_ROLES } from '@Constants/llm.constant';

const mockCreate = jest.fn<
  Promise<unknown>,
  [Record<string, unknown>, { signal: AbortSignal }]
>();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(() => ({ chat: { completions: { create: mockCreate } } })),
}));

const COMPLETION = {
  id: 'chatcmpl-1',
  created: 0,
  model: 'gpt-5.4-mini',
  object: 'chat.completion',
  usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  choices: [
    {
      index: 0,
      logprobs: null,
      finish_reason: 'stop',
      message: { role: 'assistant', content: 'שלום', refusal: null },
    },
  ],
};

const MESSAGES = [{ role: LLM_MESSAGE_ROLES.USER, content: 'היי' }];

describe('OpenAiLlmProvider', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue(COMPLETION);
  });

  it('omits the tools field when no tools are offered and forwards the request signal', async () => {
    const signal = new AbortController().signal;
    const provider = new OpenAiLlmProvider({
      apiKey: 'sk-test',
      model: 'gpt-5.4-mini',
    });

    await expect(
      provider.complete({ signal, tools: [], messages: MESSAGES }),
    ).resolves.toEqual({
      toolCalls: [],
      content: 'שלום',
      usage: { inputTokens: 3, outputTokens: 2 },
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('tools');
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      model: 'gpt-5.4-mini',
      messages: [{ role: 'user', content: 'היי' }],
    });
    expect(mockCreate.mock.calls[0][1]).toEqual({ signal });
  });

  it('sends function tools when tools are offered', async () => {
    const provider = new OpenAiLlmProvider({
      apiKey: 'sk-test',
      model: 'gpt-5.4-mini',
    });

    await provider.complete({
      messages: MESSAGES,
      signal: new AbortController().signal,
      tools: [
        {
          name: 'getQuotation',
          description: 'quotes',
          parameters: { type: 'object' },
        },
      ],
    });

    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      tools: [{ type: 'function', function: { name: 'getQuotation' } }],
    });
  });

  it('reports not configured and refuses to call OpenAI without an API key', async () => {
    const provider = new OpenAiLlmProvider({
      apiKey: null,
      model: 'gpt-5.4-mini',
    });

    expect(provider.isConfigured()).toBe(false);
    await expect(
      provider.complete({
        tools: [],
        messages: MESSAGES,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('OPENAI_API_KEY is not configured');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
