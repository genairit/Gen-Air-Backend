import {
  JENNY_LIMITS,
  JENNY_TOOL_ERRORS,
  JENNY_INCOMPLETE_ANSWER,
  JENNY_TRUNCATION_MARKER,
} from '../constants/jenny.constant';

import {
  IJennyBoundTool,
  IJennyToolLoopInput,
  IJennyToolExecution,
  IJennyToolLoopState,
  IJennyToolLoopOutcome,
} from '../interfaces/jenny.interface';

import {
  parseToolArguments,
  JennyToolArgumentsError,
} from './jenny-tool-arguments.utility';

import { HttpException } from '@nestjs/common';
import { Meta, TypedLogger } from '@Logger/logger.service';
import { LLM_MESSAGE_ROLES } from '@Constants/llm.constant';
import { ILlmUsage, ILlmToolCall } from '@Interfaces/llm.interface';

const logger = new TypedLogger<Meta>('JennyToolLoop');

const EMPTY_USAGE: ILlmUsage = { inputTokens: 0, outputTokens: 0 };

const addUsage = (total: ILlmUsage, increment: ILlmUsage): ILlmUsage => ({
  inputTokens: total.inputTokens + increment.inputTokens,
  outputTokens: total.outputTokens + increment.outputTokens,
});

export const serializeToolData = (data: unknown): string => {
  const serialized = JSON.stringify(data) ?? 'null';

  if (serialized.length <= JENNY_LIMITS.MAX_TOOL_RESULT_CHARACTERS) {
    return serialized;
  }

  return `${serialized.slice(0, JENNY_LIMITS.MAX_TOOL_RESULT_CHARACTERS)}${JENNY_TRUNCATION_MARKER}`;
};

const describeToolError = (error: unknown): Record<string, string> => {
  if (error instanceof JennyToolArgumentsError) {
    return {
      error: JENNY_TOOL_ERRORS.INVALID_ARGUMENTS,
      detail: error.message,
    };
  }

  if (error instanceof HttpException) {
    return { error: JENNY_TOOL_ERRORS.FAILED, detail: error.message };
  }

  return { error: JENNY_TOOL_ERRORS.FAILED };
};

const toToolExecution = (
  call: ILlmToolCall,
  data: unknown,
  sources: IJennyToolExecution['sources'],
): IJennyToolExecution => ({
  sources,
  message: {
    toolCallId: call.id,
    role: LLM_MESSAGE_ROLES.TOOL,
    content: serializeToolData(data),
  },
});

const executeToolCall = async (
  toolsByName: Map<string, IJennyBoundTool>,
  call: ILlmToolCall,
): Promise<IJennyToolExecution> => {
  const tool = toolsByName.get(call.name);

  if (!tool) {
    return toToolExecution(call, { error: JENNY_TOOL_ERRORS.UNKNOWN_TOOL }, []);
  }

  try {
    const result = await tool.run(parseToolArguments(call.arguments));

    return toToolExecution(call, result.data, result.sources);
  } catch (error) {
    logger.error({
      error,
      tool: call.name,
      message: 'Jenny tool failed; reporting the failure to the model',
    });

    return toToolExecution(call, describeToolError(error), []);
  }
};

const toOutcome = (
  state: IJennyToolLoopState,
  content: string | null,
): IJennyToolLoopOutcome => ({
  rounds: state.round,
  usage: state.usage,
  sources: state.sources,
  toolNames: state.toolNames,
  message: content?.trim() || JENNY_INCOMPLETE_ANSWER,
});

export const runJennyToolLoop = (
  input: IJennyToolLoopInput,
): Promise<IJennyToolLoopOutcome> => {
  const toolsByName = new Map(
    input.tools.map((tool) => [tool.definition.name, tool]),
  );
  const definitions = input.tools.map((tool) => tool.definition);

  const runRound = async (
    state: IJennyToolLoopState,
  ): Promise<IJennyToolLoopOutcome> => {
    const roundsExhausted = state.round >= input.maxRounds;
    const completion = await input.provider.complete({
      messages: state.messages,
      tools: roundsExhausted ? [] : definitions,
    });
    const usage = addUsage(state.usage, completion.usage);
    const isFinalAnswer = roundsExhausted || completion.toolCalls.length === 0;

    if (isFinalAnswer) {
      return toOutcome({ ...state, usage }, completion.content);
    }

    const executions = await Promise.all(
      completion.toolCalls.map((call) => executeToolCall(toolsByName, call)),
    );

    return runRound({
      usage,
      round: state.round + 1,
      toolNames: [
        ...state.toolNames,
        ...completion.toolCalls.map((call) => call.name),
      ],
      sources: [
        ...state.sources,
        ...executions.flatMap((execution) => execution.sources),
      ],
      messages: [
        ...state.messages,
        {
          role: LLM_MESSAGE_ROLES.ASSISTANT,
          content: completion.content,
          toolCalls: completion.toolCalls,
        },
        ...executions.map((execution) => execution.message),
      ],
    });
  };

  return runRound({
    round: 0,
    sources: [],
    toolNames: [],
    usage: EMPTY_USAGE,
    messages: input.messages,
  });
};
