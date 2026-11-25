import {
  Inject,
  Injectable,
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  IJennyChatResponse,
  IJennyResolvedContext,
  IJennyToolLoopOutcome,
} from './interfaces/jenny.interface';

import { JennyChatDto } from './dto/jenny-chat.dto';
import { LLM_PROVIDER } from '@Constants/llm.constant';
import { Meta, TypedLogger } from '@Logger/logger.service';
import type { ILlmProvider } from '@Interfaces/llm.interface';
import { JennyContextRegistry } from './jenny-context.registry';
import { selectCitedSources } from './utilities/jenny-source.utility';
import { runJennyToolLoop } from './utilities/jenny-tool-loop.utility';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { readJennyMaxToolRounds } from './utilities/jenny-settings.utility';
import { buildJennyConversation } from './utilities/jenny-conversation.utility';

@Injectable()
export class JennyService {
  private readonly logger = new TypedLogger<Meta>(JennyService.name);
  private readonly maxToolRounds = readJennyMaxToolRounds();

  constructor(
    private readonly contexts: JennyContextRegistry,
    @Inject(LLM_PROVIDER) private readonly llmProvider: ILlmProvider,
  ) {}

  async chat(
    request: JennyChatDto,
    user: IAuthorizedUser,
  ): Promise<IJennyChatResponse> {
    const startedAt = Date.now();
    const context = await this.contexts.resolve(request.context.type, {
      user,
      id: request.context.id,
    });

    this.assertConfigured();

    const outcome = await this.converse(context, request);

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
    context: IJennyResolvedContext,
    request: JennyChatDto,
  ): Promise<IJennyToolLoopOutcome> {
    try {
      return await runJennyToolLoop({
        tools: context.tools,
        provider: this.llmProvider,
        maxRounds: this.maxToolRounds,
        messages: buildJennyConversation(context.prompt, request.messages),
      });
    } catch (error) {
      this.logger.error({
        error,
        contextType: request.context.type,
        message: 'Jenny language model request failed',
      });

      throw new BadGatewayException('Jenny is temporarily unavailable');
    }
  }
}
