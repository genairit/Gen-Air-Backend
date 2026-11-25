import {
  ILlmCompletion,
  ILlmCompletionRequest,
} from '@Interfaces/llm.interface';

import {
  IJennyContextRequest,
  IJennyResolvedContext,
} from './interfaces/jenny.interface';

import { Test } from '@nestjs/testing';
import { JennyService } from './jenny.service';
import { JennyChatDto } from './dto/jenny-chat.dto';
import { LLM_PROVIDER } from '@Constants/llm.constant';
import { GatewayTimeoutException } from '@nestjs/common';
import { JennyContextRegistry } from './jenny-context.registry';
import { JENNY_LIMITS, JennyContextType } from './constants/jenny.constant';
import { makeCustomerProjectUser } from '../../testing/customer-project.fixture';
import { ClientDisconnectedError } from '@Decorators/request-abort-signal.decorator';

const SIMULATED_DEADLINE_MS = 20;

const CHAT_REQUEST: JennyChatDto = {
  context: { type: 'project', id: '00000000-0000-4000-8000-0000000000a9' },
  messages: [{ role: 'user', content: 'מה המצב?' }],
};

const waitForAbort = (
  request: ILlmCompletionRequest,
): Promise<ILlmCompletion> =>
  new Promise((_resolve, reject) => {
    const rejectAsAborted = () => reject(new Error('Request was aborted'));

    if (request.signal.aborted) {
      rejectAsAborted();

      return;
    }

    request.signal.addEventListener('abort', rejectAsAborted);
  });

describe('JennyService request deadline', () => {
  const user = { ...makeCustomerProjectUser(), permissions: [] };
  const contexts = {
    resolve: jest.fn<
      Promise<IJennyResolvedContext>,
      [JennyContextType, IJennyContextRequest]
    >(),
  };
  const llmProvider = {
    isConfigured: jest.fn<boolean, []>(),
    complete: jest.fn<Promise<ILlmCompletion>, [ILlmCompletionRequest]>(),
  };
  const state: { service: JennyService | null } = { service: null };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        JennyService,
        { provide: JennyContextRegistry, useValue: contexts },
        { provide: LLM_PROVIDER, useValue: llmProvider },
      ],
    }).compile();
    state.service = module.get(JennyService);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    llmProvider.isConfigured.mockReturnValue(true);
    llmProvider.complete.mockImplementation(waitForAbort);
    contexts.resolve.mockResolvedValue({ prompt: 'פרויקט', tools: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('bounds the whole chat by the chat deadline and answers 504', async () => {
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => new AbortController().signal)
      .mockImplementationOnce(() => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), SIMULATED_DEADLINE_MS);

        return controller.signal;
      });

    await expect(
      state.service!.chat({
        user,
        request: CHAT_REQUEST,
        clientSignal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
    expect(timeout).toHaveBeenCalledWith(JENNY_LIMITS.CHAT_DEADLINE_MS);
  });

  it('shares one request signal between the context tools and every model call', async () => {
    llmProvider.complete.mockResolvedValue({
      toolCalls: [],
      content: 'שלום',
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    await state.service!.chat({
      user,
      request: CHAT_REQUEST,
      clientSignal: new AbortController().signal,
    });

    const [[, contextRequest]] = contexts.resolve.mock.calls;
    const [[completionRequest]] = llmProvider.complete.mock.calls;
    expect(completionRequest.signal).toBe(contextRequest.signal);
  });

  it('stops the model call when the client disconnects', async () => {
    const client = new AbortController();
    llmProvider.complete.mockImplementation((request) => {
      client.abort(new ClientDisconnectedError());

      return waitForAbort(request);
    });

    await expect(
      state.service!.chat({
        user,
        request: CHAT_REQUEST,
        clientSignal: client.signal,
      }),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
    expect(llmProvider.complete.mock.calls[0][0].signal.aborted).toBe(true);
  });
});
