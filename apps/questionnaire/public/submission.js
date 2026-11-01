import {
  FIELD_TYPES,
  ANSWER_KEYS,
  UUID_PATTERN,
  IDENTITY_KEYS,
} from './constants/questionnaire.js';

export const createPayload = (definition, values, requestId) => ({
  requestId,
  questionnaireId: definition.id,
  fullName: values.fullName ?? '',
  role: values.role ?? '',
  department: values.department ?? '',
  answers: definition.definition
    .filter((field) => field.type === FIELD_TYPES.LONG_TEXT)
    .map((field) => ({
      questionKey: field.key,
      value: values[field.key] ?? '',
    })),
});

export const validateDefinition = (value) => {
  const validHeader =
    value &&
    UUID_PATTERN.test(value.id) &&
    Number.isInteger(value.version) &&
    value.version > 0;
  if (
    !validHeader ||
    !Array.isArray(value.definition) ||
    value.definition.length !== 10
  ) {
    return false;
  }

  const validFields = value.definition.every((field) => {
    if (!field || typeof field.key !== 'string') {
      return false;
    }

    const validIdentity =
      field.type === FIELD_TYPES.IDENTITY && IDENTITY_KEYS.includes(field.key);
    const validAnswer =
      field.type === FIELD_TYPES.LONG_TEXT && ANSWER_KEYS.includes(field.key);
    return (
      (validIdentity || validAnswer) &&
      typeof field.label === 'string' &&
      typeof field.required === 'boolean' &&
      Number.isInteger(field.maxLength) &&
      field.maxLength > 0
    );
  });
  const keys = value.definition.map((field) => field?.key);
  return validFields && new Set(keys).size === 10;
};

export const validateValues = (definition, values) =>
  definition.definition.every((field) => {
    const value = values[field.key];
    if (typeof value !== 'string' || value.length > field.maxLength) {
      return false;
    }

    return !field.required || value.trim().length > 0;
  });

export const validateReceipt = (value) =>
  Boolean(
    value &&
    typeof value.id === 'string' &&
    UUID_PATTERN.test(value.id) &&
    typeof value.receivedAt === 'string' &&
    Number.isFinite(Date.parse(value.receivedAt)),
  );

export const validatePending = (pending) => {
  if (!validateDefinition(pending?.definition) || !pending?.payload) {
    return false;
  }

  const payload = pending.payload;
  const validReference =
    payload.questionnaireId === pending.definition.id &&
    UUID_PATTERN.test(payload.requestId);
  const validAnswers =
    Array.isArray(payload.answers) &&
    payload.answers.length === 7 &&
    payload.answers.every(
      (answer) =>
        answer &&
        ANSWER_KEYS.includes(answer.questionKey) &&
        typeof answer.value === 'string',
    );
  if (!validReference || !validAnswers) {
    return false;
  }

  const distinctAnswers =
    new Set(payload.answers.map((answer) => answer.questionKey)).size === 7;
  const values = {
    fullName: payload.fullName,
    role: payload.role,
    department: payload.department,
    ...Object.fromEntries(
      payload.answers.map((answer) => [answer.questionKey, answer.value]),
    ),
  };
  return distinctAnswers && validateValues(pending.definition, values);
};
