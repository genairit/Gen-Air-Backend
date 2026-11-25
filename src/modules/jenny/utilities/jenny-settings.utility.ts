import {
  JENNY_SETTINGS,
  JENNY_ENVIRONMENT_KEYS,
} from '../constants/jenny.constant';

import { ILlmProvider } from '@Interfaces/llm.interface';
import { Meta, TypedLogger } from '@Logger/logger.service';
import { OpenAiLlmProvider } from '@Providers/openai/openai-llm.provider';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';

const logger = new TypedLogger<Meta>('JennySettings');

export const parseMaxToolRounds = (raw: string): number | null => {
  const rounds = Number(raw);
  const isWholeNumber = Number.isInteger(rounds);
  const isWithinRange =
    rounds >= JENNY_SETTINGS.MIN_TOOL_ROUNDS &&
    rounds <= JENNY_SETTINGS.MAX_TOOL_ROUNDS;

  return isWholeNumber && isWithinRange ? rounds : null;
};

export const readJennyMaxToolRounds = (): number => {
  const raw = EnvironmentManager.get(JENNY_ENVIRONMENT_KEYS.MAX_TOOL_ROUNDS);

  if (!raw) {
    return JENNY_SETTINGS.DEFAULT_MAX_TOOL_ROUNDS;
  }

  const rounds = parseMaxToolRounds(raw);

  if (rounds === null) {
    logger.warn({
      message: `Ignoring invalid ${JENNY_ENVIRONMENT_KEYS.MAX_TOOL_ROUNDS}; using the default`,
      defaultRounds: JENNY_SETTINGS.DEFAULT_MAX_TOOL_ROUNDS,
    });

    return JENNY_SETTINGS.DEFAULT_MAX_TOOL_ROUNDS;
  }

  return rounds;
};

export const createJennyLlmProvider = (): ILlmProvider =>
  new OpenAiLlmProvider({
    apiKey:
      EnvironmentManager.get(JENNY_ENVIRONMENT_KEYS.OPENAI_API_KEY) || null,
    model: EnvironmentManager.get(JENNY_ENVIRONMENT_KEYS.MODEL, {
      defaultValue: JENNY_SETTINGS.DEFAULT_MODEL,
    }),
  });
