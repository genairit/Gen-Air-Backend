import {
  JENNY_CHAT_ROLES,
  JennyChatRoleType,
} from '../constants/jenny.constant';

import {
  JENNY_SYSTEM_PROMPT,
  JENNY_CONTEXT_HEADING,
} from '../constants/jenny-prompt.constant';

import { TEXT } from '@Constants/text.constant';
import { TLlmMessage } from '@Interfaces/llm.interface';
import { JennyMessageDto } from '../dto/jenny-chat.dto';
import { LLM_MESSAGE_ROLES } from '@Constants/llm.constant';

const CHAT_MESSAGE_BUILDERS: Record<
  JennyChatRoleType,
  (content: string) => TLlmMessage
> = {
  [JENNY_CHAT_ROLES.USER]: (content) => ({
    content,
    role: LLM_MESSAGE_ROLES.USER,
  }),
  [JENNY_CHAT_ROLES.ASSISTANT]: (content) => ({
    content,
    toolCalls: [],
    role: LLM_MESSAGE_ROLES.ASSISTANT,
  }),
};

export const buildJennySystemPrompt = (contextPrompt: string): string =>
  [JENNY_SYSTEM_PROMPT, JENNY_CONTEXT_HEADING, contextPrompt].join(
    TEXT.LINE_BREAK,
  );

export const buildJennyConversation = (
  contextPrompt: string,
  messages: JennyMessageDto[],
): TLlmMessage[] => [
  {
    role: LLM_MESSAGE_ROLES.SYSTEM,
    content: buildJennySystemPrompt(contextPrompt),
  },
  ...messages.map((message) =>
    CHAT_MESSAGE_BUILDERS[message.role](message.content),
  ),
];
