import {
  createPayload,
  validateValues,
  validateReceipt,
  validateDefinition,
} from '../public/submission.js';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const definition = {
  id: 'f2a970b2-6348-4dc2-ab54-c10986c96ecb',
  version: 1,
  definition: [
    ...['fullName', 'role', 'department'].map((key) => ({
      key,
      label: key,
      type: 'identity',
      required: true,
      maxLength: 200,
    })),
    ...Array.from({ length: 7 }, (_, index) => ({
      key: `answer${index + 1}`,
      label: 'שאלה',
      type: 'long-text',
      required: false,
      maxLength: 4000,
    })),
  ],
};
const values = {
  fullName: 'שם',
  role: 'תפקיד',
  department: 'מחלקה',
  ...Object.fromEntries(
    Array.from({ length: 7 }, (_, index) => [`answer${index + 1}`, '']),
  ),
};

test('preserves full original whitespace, Hebrew, newlines and all empty answers', () => {
  const original = '  תשובה\nשנייה  ';
  const payload = createPayload(
    definition,
    { ...values, answer1: original },
    'request-id',
  );
  assert.equal(payload.answers[0].value, original);
  assert.equal(payload.answers.length, 7);
  assert.equal(payload.answers[1].value, '');
  assert.equal(payload.requestId, 'request-id');
  assert.equal(payload.questionnaireId, definition.id);
});

test('accepts agreed definitions, rejects duplicate or wrong identity keys and oversized values', () => {
  assert.equal(validateDefinition(definition), true);
  assert.equal(
    validateDefinition({
      ...definition,
      definition: [...definition.definition.slice(1), definition.definition[1]],
    }),
    false,
  );
  assert.equal(validateValues(definition, values), true);
  assert.equal(
    validateValues(definition, { ...values, fullName: '   ' }),
    false,
  );
  assert.equal(
    validateValues(definition, { ...values, answer1: 'a'.repeat(4001) }),
    false,
  );
});

test('requires actual valid receipt; success status alone is insufficient', () => {
  assert.equal(
    validateReceipt({ id: definition.id, receivedAt: '2026-11-01T10:00:00Z' }),
    true,
  );
  assert.equal(validateReceipt({ message: 'ok' }), false);
  assert.equal(
    validateReceipt({ id: definition.id, receivedAt: 'not a date' }),
    false,
  );
});
