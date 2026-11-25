import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { JennyChatDto } from '../dto/jenny-chat.dto';

const CONTEXT = { type: 'project', id: '00000000-0000-4000-8000-0000000000b1' };

const constraintsFor = async (messages: unknown): Promise<string[]> => {
  const errors = await validate(
    plainToInstance(JennyChatDto, { messages, context: CONTEXT }),
  );
  const messageErrors = errors.filter((error) => error.property === 'messages');

  return messageErrors.flatMap((error) => Object.keys(error.constraints ?? {}));
};

describe('EndsWithUserMessage', () => {
  it('accepts a conversation whose last message is from the user', async () => {
    await expect(
      constraintsFor([
        { role: 'assistant', content: 'שלום' },
        { role: 'user', content: 'מה המצב?' },
      ]),
    ).resolves.toEqual([]);
  });

  it.each([
    ['ending with the assistant', [{ role: 'assistant', content: 'שלום' }]],
    ['ending with a non-object', ['שלום']],
    ['not an array', 'שלום'],
  ])('rejects messages %s', async (_case, messages) => {
    await expect(constraintsFor(messages)).resolves.toContain(
      'endsWithUserMessage',
    );
  });
});
