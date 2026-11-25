import {
  ILlmProvider,
  ILlmCompletion,
  ILlmCompletionRequest,
} from '@Interfaces/llm.interface';

import {
  toOpenAiTool,
  toOpenAiMessage,
  fromOpenAiCompletion,
} from './utilities/openai-message.utility';

import OpenAI from 'openai';
import { OPENAI } from '@Constants/openai.constant';
import { IOpenAiLlmOptions } from './interfaces/openai.interface';

export class OpenAiLlmProvider implements ILlmProvider {
  private readonly client: OpenAI | null;

  constructor(private readonly options: IOpenAiLlmOptions) {
    this.client = options.apiKey
      ? new OpenAI({
          apiKey: options.apiKey,
          maxRetries: OPENAI.MAX_RETRIES,
          timeout: OPENAI.REQUEST_TIMEOUT_MS,
        })
      : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async complete(request: ILlmCompletionRequest): Promise<ILlmCompletion> {
    const completion = await this.requireClient().chat.completions.create(
      {
        model: this.options.model,
        max_completion_tokens: OPENAI.MAX_COMPLETION_TOKENS,
        messages: request.messages.map((message) => toOpenAiMessage(message)),
        ...(request.tools.length > 0
          ? { tools: request.tools.map(toOpenAiTool) }
          : {}),
      },
      { signal: request.signal },
    );

    return fromOpenAiCompletion(completion);
  }

  private requireClient(): OpenAI {
    if (!this.client) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    return this.client;
  }
}
