import { ValidateBy } from 'class-validator';
import { isObject } from '@Utilities/object.utility';
import { JENNY_CHAT_ROLES } from '../constants/jenny.constant';

const isLastMessageFromUser = (value: unknown): boolean => {
  const lastMessage: unknown = Array.isArray(value) ? value.at(-1) : null;

  return isObject(lastMessage) && lastMessage.role === JENNY_CHAT_ROLES.USER;
};

export const EndsWithUserMessage = (): PropertyDecorator =>
  ValidateBy({
    name: 'endsWithUserMessage',
    validator: {
      validate: isLastMessageFromUser,
      defaultMessage: () => 'messages must end with a user message',
    },
  });
