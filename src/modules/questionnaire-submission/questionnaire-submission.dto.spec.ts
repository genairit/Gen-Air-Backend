import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateQuestionnaireSubmissionDto } from './dto/create-questionnaire-submission.dto';

const payload = (): Record<string, unknown> => ({
  questionnaireId: 'ef1cfdf2-b4cc-5be3-8e4a-6a4634e2ba9c',
  requestId: '07ff69dc-5d11-4a84-922a-9956b05518f8',
  fullName: 'כפיר',
  role: 'פיתוח',
  department: 'הנדסה',
  answers: Array.from({ length: 7 }, (_, index) => ({
    questionKey: `answer${index + 1}`,
    value: '',
  })),
});
const errors = (input: Record<string, unknown>) =>
  validate(plainToInstance(CreateQuestionnaireSubmissionDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('Questionnaire submission DTO boundaries', () => {
  it('supports the seeded UUIDv5 questionnaire and preserves original strings', async () => {
    const input = { ...payload(), fullName: '  כפיר\n  ' };
    const instance = plainToInstance(CreateQuestionnaireSubmissionDto, input);
    expect(await validate(instance)).toEqual([]);
    expect(instance.fullName).toBe(input.fullName);
  });
  it.each(['fullName', 'role', 'department'])(
    'validates nonblank identity and the %s length boundary',
    async (field) => {
      expect(await errors({ ...payload(), [field]: 'x'.repeat(200) })).toEqual(
        [],
      );
      expect(
        await errors({ ...payload(), [field]: 'x'.repeat(201) }),
      ).not.toEqual([]);
      expect(await errors({ ...payload(), [field]: '\u00a0\n\t' })).not.toEqual(
        [],
      );
      expect(await errors({ ...payload(), [field]: null })).not.toEqual([]);
    },
  );
  it('rejects unknown outer and nested properties instead of storing them', async () => {
    expect(await errors({ ...payload(), isAdmin: true })).not.toEqual([]);
    const answers = Array.from({ length: 7 }, (_, index) => ({
      questionKey: `answer${index + 1}`,
      value: 'a',
      isAdmin: true,
    }));
    expect(await errors({ ...payload(), answers })).not.toEqual([]);
  });
  it('rejects non-v4 request keys and malformed answer collection', async () => {
    expect(
      await errors({
        ...payload(),
        requestId: 'ef1cfdf2-b4cc-5be3-8e4a-6a4634e2ba9c',
      }),
    ).not.toEqual([]);
    expect(await errors({ ...payload(), answers: null })).not.toEqual([]);
    expect(await errors({ ...payload(), answers: [] })).not.toEqual([]);
    expect(
      await errors({ ...payload(), answers: Array(7).fill(null) }),
    ).not.toEqual([]);
  });
  it('accepts exactly 4000-character text and rejects larger values', async () => {
    const answers = Array.from({ length: 7 }, (_, index) => ({
      questionKey: `answer${index + 1}`,
      value: 'א'.repeat(4000),
    }));
    expect(await errors({ ...payload(), answers })).toEqual([]);
    expect(
      await errors({
        ...payload(),
        answers: answers.map((answer) => ({
          ...answer,
          value: `${answer.value}א`,
        })),
      }),
    ).not.toEqual([]);
  });
});
