import {
  toConversationFailure,
  buildJennyConversation,
} from './jenny-conversation.utility';

import { TEXT } from '@Constants/text.constant';
import { LLM_MESSAGE_ROLES } from '@Constants/llm.constant';
import { JENNY_PROMPT } from '../constants/jenny-prompt.constant';
import { BadGatewayException, GatewayTimeoutException } from '@nestjs/common';

describe('buildJennyConversation', () => {
  it('starts with the Hebrew system prompt and context, then replays the history in order', () => {
    const conversation = buildJennyConversation('פרויקט {"code":"GA-1"}', [
      { role: 'user', content: 'מה הסטטוס?' },
      { role: 'assistant', content: 'הפרויקט בעבודה.' },
      { role: 'user', content: 'ומה עם הצעת המחיר?' },
    ]);

    expect(conversation).toEqual([
      {
        role: LLM_MESSAGE_ROLES.SYSTEM,
        content: [
          JENNY_PROMPT.SYSTEM,
          JENNY_PROMPT.CONTEXT_HEADING,
          'פרויקט {"code":"GA-1"}',
        ].join(TEXT.LINE_BREAK),
      },
      { role: LLM_MESSAGE_ROLES.USER, content: 'מה הסטטוס?' },
      {
        toolCalls: [],
        content: 'הפרויקט בעבודה.',
        role: LLM_MESSAGE_ROLES.ASSISTANT,
      },
      { role: LLM_MESSAGE_ROLES.USER, content: 'ומה עם הצעת המחיר?' },
    ]);
  });
});

describe('toConversationFailure', () => {
  it('reports an aborted conversation as a gateway timeout', () => {
    const controller = new AbortController();
    controller.abort();

    expect(toConversationFailure(controller.signal)).toBeInstanceOf(
      GatewayTimeoutException,
    );
  });

  it('reports any other failure as a bad gateway', () => {
    expect(toConversationFailure(new AbortController().signal)).toBeInstanceOf(
      BadGatewayException,
    );
  });
});
