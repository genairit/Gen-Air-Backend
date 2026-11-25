import {
  JENNY_LIMITS,
  JENNY_REPLY_TEXT,
  JENNY_TOOL_ERRORS,
} from '../constants/jenny.constant';

import { NotFoundException } from '@nestjs/common';
import { LLM_MESSAGE_ROLES } from '@Constants/llm.constant';
import { TLlmMessage, ILlmCompletion } from '@Interfaces/llm.interface';
import { stubLlmProvider } from '../../../testing/llm-provider.fixture';
import { IJennyBoundTool, IJennySource } from '../interfaces/jenny.interface';
import { runJennyToolLoop, serializeToolData } from './jenny-tool-loop.utility';

const USAGE = { inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0.001 };
const SIGNAL = new AbortController().signal;

const SOURCE: IJennySource = {
  page: 2,
  fileId: 'file-1',
  fileName: 'plan.pdf',
  url: 'https://drive.google.com/file/d/file-1/view',
};

const INITIAL_MESSAGES: TLlmMessage[] = [
  { role: LLM_MESSAGE_ROLES.SYSTEM, content: 'system' },
  { role: LLM_MESSAGE_ROLES.USER, content: 'מה הסטטוס?' },
];

const answer = (content: string | null): ILlmCompletion => ({
  content,
  usage: USAGE,
  toolCalls: [],
});

const callTools = (
  ...calls: Array<{ id: string; name: string; arguments?: string }>
): ILlmCompletion => ({
  usage: USAGE,
  content: null,
  toolCalls: calls.map((call) => ({ arguments: '{}', ...call })),
});

const stubTool = (
  name: string,
  run: IJennyBoundTool['run'],
): IJennyBoundTool & { run: jest.Mock } => ({
  run: jest.fn(run),
  definition: { name, description: name, parameters: { type: 'object' } },
});

describe('runJennyToolLoop', () => {
  it('answers directly when the model calls no tool', async () => {
    const provider = stubLlmProvider([answer('שלום, אני ג׳ני')]);
    const status = stubTool('getProjectStatus', () =>
      Promise.resolve({ data: {}, sources: [] }),
    );

    const outcome = await runJennyToolLoop({
      provider,
      maxRounds: 5,
      tools: [status],
      signal: SIGNAL,
      messages: INITIAL_MESSAGES,
    });

    expect(outcome).toEqual({
      rounds: 0,
      sources: [],
      toolNames: [],
      usage: USAGE,
      message: 'שלום, אני ג׳ני',
    });
    expect(provider.requests[0].tools).toEqual([status.definition]);
    expect(status.run).not.toHaveBeenCalled();
  });

  it('runs several tools in one round and feeds every result back to the model', async () => {
    const provider = stubLlmProvider([
      callTools(
        { id: 'call-1', name: 'getProjectStatus' },
        {
          id: 'call-2',
          name: 'searchProjectDocuments',
          arguments: '{"query":"מעבה"}',
        },
      ),
      answer('הפרויקט בעבודה. לפי plan.pdf עמוד 2 הדגם הוא X.'),
    ]);
    const status = stubTool('getProjectStatus', () =>
      Promise.resolve({ data: { stage: 'בעבודה' }, sources: [] }),
    );
    const search = stubTool('searchProjectDocuments', () =>
      Promise.resolve({ data: { hits: 1 }, sources: [SOURCE] }),
    );

    const outcome = await runJennyToolLoop({
      provider,
      maxRounds: 5,
      tools: [status, search],
      signal: SIGNAL,
      messages: INITIAL_MESSAGES,
    });

    expect(search.run).toHaveBeenCalledWith({ query: 'מעבה' });
    expect(outcome.rounds).toBe(1);
    expect(outcome.sources).toEqual([SOURCE]);
    expect(outcome.toolNames).toEqual([
      'getProjectStatus',
      'searchProjectDocuments',
    ]);
    expect(outcome.usage).toEqual({
      inputTokens: 20,
      outputTokens: 10,
      estimatedCostUsd: 0.002,
    });
    expect(provider.requests[1].messages.slice(2)).toEqual([
      {
        content: null,
        role: LLM_MESSAGE_ROLES.ASSISTANT,
        toolCalls: [
          { id: 'call-1', name: 'getProjectStatus', arguments: '{}' },
          {
            id: 'call-2',
            name: 'searchProjectDocuments',
            arguments: '{"query":"מעבה"}',
          },
        ],
      },
      {
        toolCallId: 'call-1',
        role: LLM_MESSAGE_ROLES.TOOL,
        content: '{"stage":"בעבודה"}',
      },
      {
        toolCallId: 'call-2',
        role: LLM_MESSAGE_ROLES.TOOL,
        content: '{"hits":1}',
      },
    ]);
  });

  it('continues across rounds until the model answers', async () => {
    const provider = stubLlmProvider([
      callTools({ id: 'a', name: 'getProjectStatus' }),
      callTools({ id: 'b', name: 'getQuotation' }),
      answer('סיכום'),
    ]);
    const status = stubTool('getProjectStatus', () =>
      Promise.resolve({ data: 1, sources: [] }),
    );
    const quotation = stubTool('getQuotation', () =>
      Promise.resolve({ data: 2, sources: [] }),
    );

    const outcome = await runJennyToolLoop({
      provider,
      maxRounds: 5,
      tools: [status, quotation],
      signal: SIGNAL,
      messages: INITIAL_MESSAGES,
    });

    expect(outcome.rounds).toBe(2);
    expect(outcome.message).toBe('סיכום');
    expect(provider.requests).toHaveLength(3);
  });

  it('stops calling tools at the round cap and forces a final answer without tools', async () => {
    const provider = stubLlmProvider([
      callTools({ id: 'a', name: 'getProjectStatus' }),
      callTools({ id: 'b', name: 'getProjectStatus' }),
      { ...callTools({ id: 'c', name: 'getProjectStatus' }), content: 'סופי' },
    ]);
    const status = stubTool('getProjectStatus', () =>
      Promise.resolve({ data: 1, sources: [] }),
    );

    const outcome = await runJennyToolLoop({
      provider,
      maxRounds: 2,
      tools: [status],
      signal: SIGNAL,
      messages: INITIAL_MESSAGES,
    });

    expect(status.run).toHaveBeenCalledTimes(2);
    expect(provider.requests).toHaveLength(3);
    expect(provider.requests.map((request) => request.tools.length)).toEqual([
      1, 1, 0,
    ]);
    expect(outcome.rounds).toBe(2);
    expect(outcome.message).toBe('סופי');
  });

  it('passes the request signal to every model call', async () => {
    const provider = stubLlmProvider([
      callTools({ id: 'a', name: 'getProjectStatus' }),
      answer('סיכום'),
    ]);
    const status = stubTool('getProjectStatus', () =>
      Promise.resolve({ data: 1, sources: [] }),
    );

    await runJennyToolLoop({
      provider,
      maxRounds: 3,
      signal: SIGNAL,
      tools: [status],
      messages: INITIAL_MESSAGES,
    });

    expect(provider.requests.map((request) => request.signal)).toEqual([
      SIGNAL,
      SIGNAL,
    ]);
  });

  it('runs at most the per-round tool-call cap and answers the excess calls with an error', async () => {
    const callCount = JENNY_LIMITS.MAX_TOOL_CALLS_PER_ROUND + 2;
    const provider = stubLlmProvider([
      callTools(
        ...Array.from({ length: callCount }, (_value, index) => ({
          id: `call-${index}`,
          name: 'searchProjectDocuments',
          arguments: '{"query":"מעבה"}',
        })),
      ),
      answer('סיכום'),
    ]);
    const search = stubTool('searchProjectDocuments', () =>
      Promise.resolve({ data: { hits: 0 }, sources: [] }),
    );

    await runJennyToolLoop({
      provider,
      maxRounds: 3,
      signal: SIGNAL,
      tools: [search],
      messages: INITIAL_MESSAGES,
    });

    const toolReplies = provider.requests[1].messages.slice(3);
    expect(search.run).toHaveBeenCalledTimes(
      JENNY_LIMITS.MAX_TOOL_CALLS_PER_ROUND,
    );
    expect(toolReplies).toHaveLength(callCount);
    expect(
      toolReplies
        .slice(JENNY_LIMITS.MAX_TOOL_CALLS_PER_ROUND)
        .map((message) => message.content),
    ).toEqual([
      JSON.stringify({ error: JENNY_TOOL_ERRORS.TOO_MANY_TOOL_CALLS }),
      JSON.stringify({ error: JENNY_TOOL_ERRORS.TOO_MANY_TOOL_CALLS }),
    ]);
  });

  it('falls back to a Hebrew apology when the model returns no text', async () => {
    const provider = stubLlmProvider([answer('   ')]);

    const outcome = await runJennyToolLoop({
      provider,
      tools: [],
      maxRounds: 1,
      signal: SIGNAL,
      messages: INITIAL_MESSAGES,
    });

    expect(outcome.message).toBe(JENNY_REPLY_TEXT.INCOMPLETE_ANSWER);
  });

  it('reports unknown tools, invalid arguments and tool failures to the model instead of failing the chat', async () => {
    const provider = stubLlmProvider([
      callTools(
        { id: 'unknown', name: 'deleteProject' },
        { id: 'invalid', name: 'searchProjectDocuments', arguments: '{oops' },
        { id: 'failed', name: 'getProjectStatus' },
      ),
      answer('לא הצלחתי'),
    ]);
    const search = stubTool('searchProjectDocuments', () =>
      Promise.resolve({ data: {}, sources: [SOURCE] }),
    );
    const status = stubTool('getProjectStatus', () =>
      Promise.reject(new NotFoundException('Project was not found')),
    );

    const outcome = await runJennyToolLoop({
      provider,
      maxRounds: 3,
      tools: [search, status],
      signal: SIGNAL,
      messages: INITIAL_MESSAGES,
    });

    expect(search.run).not.toHaveBeenCalled();
    expect(outcome.sources).toEqual([]);
    expect(
      provider.requests[1].messages
        .slice(3)
        .map((message) => JSON.parse(message.content ?? '') as unknown),
    ).toEqual([
      { error: JENNY_TOOL_ERRORS.UNKNOWN_TOOL },
      {
        error: JENNY_TOOL_ERRORS.INVALID_ARGUMENTS,
        detail: 'Tool arguments must be valid JSON',
      },
      { error: JENNY_TOOL_ERRORS.FAILED, detail: 'Project was not found' },
    ]);
  });

  it('reports unexpected tool failures without exposing their details', async () => {
    const provider = stubLlmProvider([
      callTools({ id: 'boom', name: 'getProjectStatus' }),
      answer('לא הצלחתי'),
    ]);
    const status = stubTool('getProjectStatus', () =>
      Promise.reject(new Error('connection string postgres://secret')),
    );

    await runJennyToolLoop({
      provider,
      maxRounds: 2,
      signal: SIGNAL,
      tools: [status],
      messages: INITIAL_MESSAGES,
    });

    expect(provider.requests[1].messages.at(-1)).toEqual({
      toolCallId: 'boom',
      role: LLM_MESSAGE_ROLES.TOOL,
      content: JSON.stringify({ error: JENNY_TOOL_ERRORS.FAILED }),
    });
  });

  it('propagates language model failures to the caller', async () => {
    const provider = stubLlmProvider([]);

    await expect(
      runJennyToolLoop({
        provider,
        tools: [],
        maxRounds: 1,
        signal: SIGNAL,
        messages: INITIAL_MESSAGES,
      }),
    ).rejects.toThrow('No stubbed completion left');
  });
});

describe('serializeToolData', () => {
  it('truncates oversized tool results to bound the prompt size', () => {
    const serialized = serializeToolData({
      text: 'א'.repeat(JENNY_LIMITS.MAX_TOOL_RESULT_CHARACTERS),
    });

    expect(serialized).toHaveLength(
      JENNY_LIMITS.MAX_TOOL_RESULT_CHARACTERS +
        JENNY_REPLY_TEXT.TRUNCATION_MARKER.length,
    );
    expect(serialized.endsWith(JENNY_REPLY_TEXT.TRUNCATION_MARKER)).toBe(true);
  });

  it('serializes values JSON cannot represent as null', () => {
    expect(serializeToolData(() => 'not serializable')).toBe('null');
  });
});
