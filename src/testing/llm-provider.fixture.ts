import {
  ILlmProvider,
  ILlmCompletion,
  ILlmCompletionRequest,
} from '@Interfaces/llm.interface';

export interface IScriptedLlmProvider extends ILlmProvider {
  requests: ILlmCompletionRequest[];
}

export const stubLlmProvider = (
  completions: ILlmCompletion[],
): IScriptedLlmProvider => {
  const requests: ILlmCompletionRequest[] = [];
  const queue = [...completions];

  return {
    requests,
    isConfigured: () => true,
    complete: (request) => {
      requests.push(request);
      const next = queue.shift();

      if (!next) {
        return Promise.reject(new Error('No stubbed completion left'));
      }

      return Promise.resolve(next);
    },
  };
};
