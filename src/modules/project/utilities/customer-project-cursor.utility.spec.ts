import {
  decodeCustomerProjectCursor,
  encodeCustomerProjectCursor,
} from './customer-project-cursor.utility';

import {
  ICustomerProjectScope,
  ICustomerProjectCursor,
} from '../interfaces/customer-project.interface';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { CUSTOMER_PROJECT_PAGINATION } from '../constants/customer-project.constant';
import { CUSTOMER_PROJECT_TEST_IDS } from '../../../testing/customer-project.fixture';

const SCOPE: ICustomerProjectScope = {
  customerId: CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
  search: 'בניין',
  stageId: null,
};
const POSITION: ICustomerProjectCursor = {
  ...SCOPE,
  id: CUSTOMER_PROJECT_TEST_IDS.PROJECT,
  name: 'שם א, ב / ג',
  updatedAt: new Date('2026-10-20T10:15:16.123Z'),
};
const rawCursor = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString(
    CUSTOMER_PROJECT_PAGINATION.ENCODING,
  );

describe('customer project cursor boundaries', () => {
  it('round-trips the full Unicode ordering tuple and filter scope without losing millisecond precision', () => {
    const value = encodeCustomerProjectCursor(POSITION);
    expect(decodeCustomerProjectCursor(value, SCOPE)).toEqual(POSITION);
    expect(value).not.toMatch(/[+/=]/);
  });

  it.each(['%%%', 'a', 'not-json', 'eyJpZCI6'])(
    'rejects malformed encoding/JSON %s',
    (value) => {
      expect(decodeCustomerProjectCursor(value, SCOPE)).toBeNull();
    },
  );

  it.each([null, [], 'cursor', 4])(
    'rejects a non-object payload %p',
    (value) => {
      expect(decodeCustomerProjectCursor(rawCursor(value), SCOPE)).toBeNull();
    },
  );

  it.each([
    { id: 'not-an-id' },
    { id: 5 },
    { name: null },
    { name: 'א'.repeat(FIELD_LENGTHS.PROJECT_NAME + 1) },
    { updatedAt: null },
    { updatedAt: 'not-a-date' },
    { updatedAt: '2026-02-30T10:00:00.000Z' },
    { updatedAt: '2026-13-01T10:00:00.000Z' },
  ])('rejects invalid cursor fields %p', (change) => {
    expect(
      decodeCustomerProjectCursor(rawCursor({ ...POSITION, ...change }), SCOPE),
    ).toBeNull();
  });

  it.each([
    { customerId: CUSTOMER_PROJECT_TEST_IDS.OTHER },
    { search: 'אחר' },
    { search: '' },
    { stageId: CUSTOMER_PROJECT_TEST_IDS.OTHER },
  ])(
    'rejects a cursor reused under a different association/search/stage %p',
    (change) => {
      expect(
        decodeCustomerProjectCursor(encodeCustomerProjectCursor(POSITION), {
          ...SCOPE,
          ...change,
        }),
      ).toBeNull();
    },
  );

  it('accepts the maximum stored project name and binds a selected stage', () => {
    const scope = { ...SCOPE, stageId: CUSTOMER_PROJECT_TEST_IDS.OTHER };
    const position = {
      ...POSITION,
      ...scope,
      name: 'א'.repeat(FIELD_LENGTHS.PROJECT_NAME),
    };
    expect(
      decodeCustomerProjectCursor(encodeCustomerProjectCursor(position), scope),
    ).toEqual(position);
  });

  it.each([101, FIELD_LENGTHS.PROJECT_NAME])(
    'round-trips a valid %s-code-point astral name without counting surrogate pairs twice',
    (length) => {
      const position = { ...POSITION, name: '😀'.repeat(length) };
      expect(
        decodeCustomerProjectCursor(
          encodeCustomerProjectCursor(position),
          SCOPE,
        ),
      ).toEqual(position);
    },
  );

  it('rejects an astral name above the same code-point limit as the project DTO', () => {
    const position = {
      ...POSITION,
      name: '😀'.repeat(FIELD_LENGTHS.PROJECT_NAME + 1),
    };
    expect(
      decodeCustomerProjectCursor(encodeCustomerProjectCursor(position), SCOPE),
    ).toBeNull();
  });

  it('does not accept a padded alternate representation of an otherwise valid cursor', () => {
    expect(
      decodeCustomerProjectCursor(
        encodeCustomerProjectCursor(POSITION) + '=',
        SCOPE,
      ),
    ).toBeNull();
  });
});
