import {
  IQuestionnaireAnswer,
  TQuestionnaireSubmissionCreation,
} from '../interfaces/questionnaire-submission.interface';

import { IQuestionnaire } from '@Modules/questionnaire/interfaces/questionnaire.interface';
import { QUESTIONNAIRE_FIELD_TYPES } from '@Modules/questionnaire/constants/questionnaire.constant';

export const hasValidQuestionnaireAnswers = (
  questionnaire: IQuestionnaire,
  answers: IQuestionnaireAnswer[],
): boolean => {
  const fields = questionnaire.definition.filter(
    (field) => field.type === QUESTIONNAIRE_FIELD_TYPES.LONG_TEXT,
  );
  const keys = new Set(answers.map((answer) => answer.questionKey));
  const hasExactKeys =
    keys.size === fields.length && answers.length === fields.length;
  const hasAnyContent = answers.some(
    (answer) => answer.value.trim().length > 0,
  );
  const hasValidValues = fields.every((field) => {
    const answer = answers.find((item) => item.questionKey === field.key);
    if (!answer) {
      return false;
    }
    const fitsLength = answer.value.length <= field.maxLength;
    const meetsRequired = !field.required || answer.value.trim().length > 0;
    return fitsLength && meetsRequired;
  });
  return hasExactKeys && hasAnyContent && hasValidValues;
};
export const isSameQuestionnaireSubmission = (
  existing: TQuestionnaireSubmissionCreation,
  input: TQuestionnaireSubmissionCreation,
): boolean => {
  const sameIdentity =
    existing.fullName === input.fullName &&
    existing.role === input.role &&
    existing.department === input.department;
  const sameQuestionnaire = existing.questionnaireId === input.questionnaireId;
  const sameAnswers =
    existing.answers.length === input.answers.length &&
    existing.answers.every((answer) =>
      input.answers.some(
        (item) =>
          item.questionKey === answer.questionKey &&
          item.value === answer.value,
      ),
    );
  return sameIdentity && sameQuestionnaire && sameAnswers;
};
