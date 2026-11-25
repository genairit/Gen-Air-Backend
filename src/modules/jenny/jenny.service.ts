import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  IJennyChatRequest,
  IJennyConversation,
  IJennyChatResponse,
  IJennyToolLoopOutcome,
} from './interfaces/jenny.interface';

import {
  toConversationFailure,
  buildJennyConversation,
} from './utilities/jenny-conversation.utility';

import { LLM_PROVIDER } from '@Constants/llm.constant';
import { JENNY_LIMITS } from './constants/jenny.constant';
import { Meta, TypedLogger } from '@Logger/logger.service';
import { signalWithTimeout } from '@Utilities/abort.utility';
import type { ILlmProvider } from '@Interfaces/llm.interface';
import { JennyContextRegistry } from './jenny-context.registry';
import { selectCitedSources } from './utilities/jenny-source.utility';
import { runJennyToolLoop } from './utilities/jenny-tool-loop.utility';
import { readJennyMaxToolRounds } from './utilities/jenny-settings.utility';

@Injectable()
export class JennyService {
  private readonly logger = new TypedLogger<Meta>(JennyService.name);
  private readonly maxToolRounds = readJennyMaxToolRounds();

  constructor(
    private readonly contexts: JennyContextRegistry,
    @Inject(LLM_PROVIDER) private readonly llmProvider: ILlmProvider,
  ) {}

  async chat(chat: IJennyChatRequest): Promise<IJennyChatResponse> {
    const startedAt = Date.now();
    const { request, user } = chat;
    const signal = signalWithTimeout(
      chat.clientSignal,
      JENNY_LIMITS.CHAT_DEADLINE_MS,
    );
    const context = await this.contexts.resolve(request.context.type, {
      user,
      signal,
      id: request.context.id,
    });

    this.assertConfigured();

    const outcome = await this.converse({ context, request, signal });

    this.logger.info({
      userId: user.id,
      rounds: outcome.rounds,
      toolNames: outcome.toolNames,
      contextType: request.context.type,
      durationMs: Date.now() - startedAt,
      // Keys avoid the word "token": the logger redacts any key matching /token/i.
      promptUsage: outcome.usage.inputTokens,
      completionUsage: outcome.usage.outputTokens,
      message: 'Jenny answered a chat request',
    });

    return {
      message: outcome.message,
      sources: selectCitedSources(outcome.message, outcome.sources),
    };
  }

  private assertConfigured(): void {
    if (!this.llmProvider.isConfigured()) {
      throw new ServiceUnavailableException('Jenny is not configured');
    }
  }

  private async converse(
    conversation: IJennyConversation,
  ): Promise<IJennyToolLoopOutcome> {
    const { context, request, signal } = conversation;

    try {
      return await runJennyToolLoop({
        signal,
        tools: context.tools,
        provider: this.llmProvider,
        maxRounds: this.maxToolRounds,
        messages: buildJennyConversation(context.prompt, request.messages),
      });
    } catch (error) {
      this.logger.error({
        error,
        interrupted: signal.aborted,
        contextType: request.context.type,
        message: 'Jenny language model request failed',
      });

      throw toConversationFailure(signal);
    }
  }
}
