import {
  parseToolArguments,
  requireStringArgument,
  JennyToolArgumentsError,
} from './jenny-tool-arguments.utility';

import { LLM_MESSAGE_ROLES } from '@Constants/llm.constant';
import { runJennyToolLoop } from './jenny-tool-loop.utility';
import { JENNY_TOOL_ERRORS } from '../constants/jenny.constant';
import { stubLlmProvider } from '../../../testing/llm-provider.fixture';

const QUERY_RULE = { name: 'query', minLength: 2, maxLength: 10 } as const;
const USAGE = { inputTokens: 1, outputTokens: 1 };

describe('parseToolArguments', () => {
  it.each(['', '   '])(
    'treats blank arguments %p as an empty object',
    (raw) => {
      expect(parseToolArguments(raw)).toEqual({});
    },
  );

  it('parses a JSON object', () => {
    expect(parseToolArguments('{"query":"מעבה"}')).toEqual({ query: 'מעבה' });
  });

  it.each(['[]', '"x"', '1', 'null', 'true'])(
    'rejects the non-object JSON value %p',
    (raw) => {
      expect(() => parseToolArguments(raw)).toThrow(
        new JennyToolArgumentsError('Tool arguments must be a JSON object'),
      );
    },
  );

  it('rejects malformed JSON', () => {
    expect(() => parseToolArguments('{oops')).toThrow(
      new JennyToolArgumentsError('Tool arguments must be valid JSON'),
    );
  });
});

describe('requireStringArgument', () => {
  it('returns the trimmed value when it fits the length rule', () => {
    expect(requireStringArgument({ query: '  מעבה  ' }, QUERY_RULE)).toBe(
      'מעבה',
    );
  });

  it.each([
    ['missing', {}],
    ['not a string', { query: 42 }],
    ['too short after trimming', { query: ' א ' }],
    ['too long', { query: 'א'.repeat(QUERY_RULE.maxLength + 1) }],
  ])('rejects a query that is %s', (_case, args) => {
    expect(() => requireStringArgument(args, QUERY_RULE)).toThrow(
      new JennyToolArgumentsError('query must be 2-10 characters'),
    );
  });

  it('is reported to the model as an invalid_arguments tool reply', async () => {
    const provider = stubLlmProvider([
      {
        usage: USAGE,
        content: null,
        toolCalls: [
          { id: 'search', name: 'searchProjectDocuments', arguments: '{}' },
        ],
      },
      { usage: USAGE, content: 'לא הצלחתי', toolCalls: [] },
    ]);
    const run = jest.fn((args: Record<string, unknown>) =>
      Promise.resolve({
        sources: [],
        data: requireStringArgument(args, QUERY_RULE),
      }),
    );

    await runJennyToolLoop({
      provider,
      maxRounds: 2,
      signal: new AbortController().signal,
      messages: [{ role: LLM_MESSAGE_ROLES.USER, content: 'חפשי' }],
      tools: [
        {
          run,
          definition: {
            parameters: {},
            name: 'searchProjectDocuments',
            description: 'search',
          },
        },
      ],
    });

    expect(provider.requests[1].messages.at(-1)).toEqual({
      toolCallId: 'search',
      role: LLM_MESSAGE_ROLES.TOOL,
      content: JSON.stringify({
        error: JENNY_TOOL_ERRORS.INVALID_ARGUMENTS,
        detail: 'query must be 2-10 characters',
      }),
    });
  });
});
