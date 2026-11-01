import {
  hasValidQuestionnaireAnswers,
  isSameQuestionnaireSubmission,
} from './questionnaire-submission.utility';

import { IQuestionnaire } from '@Modules/questionnaire/interfaces/questionnaire.interface';
import { TQuestionnaireSubmissionCreation } from '../interfaces/questionnaire-submission.interface';

const questionnaire: IQuestionnaire = {
  id: 'ef1cfdf2-b4cc-5be3-8e4a-6a4634e2ba9c',
  slug: 'genair-workflow',
  version: 1,
  title: 'בדיקה',
  introduction: '',
  acceptingResponses: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  definition: [
    {
      key: 'fullName',
      label: 'שם',
      helpText: '',
      required: true,
      type: 'identity',
      maxLength: 200,
    },
    {
      key: 'answer1',
      label: 'תהליך',
      helpText: '',
      required: false,
      type: 'long-text',
      maxLength: 10,
    },
    {
      key: 'answer2',
      label: 'זמן',
      helpText: '',
      required: true,
      type: 'long-text',
      maxLength: 10,
    },
  ],
};
const payload = (): TQuestionnaireSubmissionCreation => ({
  requestId: '07ff69dc-5d11-4a84-922a-9956b05518f8',
  questionnaireId: questionnaire.id,
  fullName: ' כפיר ',
  role: 'מפתח',
  department: 'הנדסה',
  answers: [
    { questionKey: 'answer1', value: '' },
    { questionKey: 'answer2', value: '  א\n😀  ' },
  ],
});

describe('Questionnaire exact-version answer validation', () => {
  it('excludes identity fields and permits empty optional answers without normalizing content', () => {
    const input = payload();
    const original = JSON.stringify(input.answers);
    expect(hasValidQuestionnaireAnswers(questionnaire, input.answers)).toBe(
      true,
    );
    expect(JSON.stringify(input.answers)).toBe(original);
  });
  it('honors per-version required flags, length limits and exact unique keys', () => {
    const input = payload();
    expect(
      hasValidQuestionnaireAnswers(
        questionnaire,
        input.answers.map((a) => ({ ...a, value: '\u00a0\n' })),
      ),
    ).toBe(false);
    expect(
      hasValidQuestionnaireAnswers(
        questionnaire,
        input.answers.map((a) => ({ ...a, value: 'a'.repeat(11) })),
      ),
    ).toBe(false);
    expect(
      hasValidQuestionnaireAnswers(questionnaire, [
        input.answers[1],
        input.answers[1],
      ]),
    ).toBe(false);
    expect(
      hasValidQuestionnaireAnswers(questionnaire, [
        { questionKey: 'unknown', value: 'a' },
        input.answers[1],
      ]),
    ).toBe(false);
    expect(
      hasValidQuestionnaireAnswers(questionnaire, input.answers.slice(1)),
    ).toBe(false);
  });
  it('accepts equivalent answer order on retry but not any text or identity modification', () => {
    const input = payload();
    expect(
      isSameQuestionnaireSubmission(input, {
        ...input,
        answers: [...input.answers].reverse(),
      }),
    ).toBe(true);
    expect(
      isSameQuestionnaireSubmission(input, {
        ...input,
        fullName: input.fullName.trim(),
      }),
    ).toBe(false);
    expect(
      isSameQuestionnaireSubmission(input, { ...input, role: 'אחר' }),
    ).toBe(false);
    expect(
      isSameQuestionnaireSubmission(input, { ...input, department: 'אחר' }),
    ).toBe(false);
    expect(
      isSameQuestionnaireSubmission(input, {
        ...input,
        questionnaireId: 'other',
      }),
    ).toBe(false);
    expect(
      isSameQuestionnaireSubmission(input, {
        ...input,
        answers: input.answers.map((a) => ({ ...a, value: a.value.trim() })),
      }),
    ).toBe(false);
    expect(
      isSameQuestionnaireSubmission(input, {
        ...input,
        answers: [input.answers[1], input.answers[1]],
      }),
    ).toBe(false);
  });
});
