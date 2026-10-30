import {
  decodeCustomerProjectCursor,
  encodeCustomerProjectCursor,
} from '../utilities/customer-project-cursor.utility';

import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { GetCustomerProjectsDto } from './get-customer-projects.dto';
import { CUSTOMER_PROJECT_PAGINATION } from '../constants/customer-project.constant';
import { CUSTOMER_PROJECT_TEST_IDS } from '../../../testing/customer-project.fixture';

const errorsFor = (value: object) =>
  validate(plainToInstance(GetCustomerProjectsDto, value), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('related project query DTO', () => {
  it.each([
    {},
    { search: '', batchSize: '8' },
    {
      search: 'שם / מזהה',
      stageId: CUSTOMER_PROJECT_TEST_IDS.OTHER,
      batchSize: CUSTOMER_PROJECT_PAGINATION.MAX_SIZE,
    },
  ])('accepts supported queries %p', async (query) => {
    expect(await errorsFor(query)).toEqual([]);
  });

  it('accepts and decodes a generated cursor with maximum-length JSON-escaped name and search', async () => {
    const scope = {
      customerId: CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
      search: '\u0001'.repeat(FIELD_LENGTHS.SEARCH_QUERY),
      stageId: CUSTOMER_PROJECT_TEST_IDS.OTHER,
    };
    const position = {
      ...scope,
      id: CUSTOMER_PROJECT_TEST_IDS.PROJECT,
      name: '\u0001'.repeat(FIELD_LENGTHS.PROJECT_NAME),
      updatedAt: new Date('2026-10-20T10:15:16.123Z'),
    };
    const batchCursor = encodeCustomerProjectCursor(position);
    expect(batchCursor.length).toBeGreaterThan(2048);
    expect(batchCursor.length).toBeLessThanOrEqual(
      CUSTOMER_PROJECT_PAGINATION.MAX_CURSOR_LENGTH,
    );
    expect(
      await errorsFor({
        search: scope.search,
        stageId: scope.stageId,
        batchCursor,
      }),
    ).toEqual([]);
    expect(decodeCustomerProjectCursor(batchCursor, scope)).toEqual(position);
  });

  it.each([
    { batchSize: 0 },
    { batchSize: -1 },
    { batchSize: 1.5 },
    { batchSize: CUSTOMER_PROJECT_PAGINATION.MAX_SIZE + 1 },
    { batchSize: 'not-a-number' },
    { stageId: 'not-a-stage' },
    { search: 3 },
    { search: 'א'.repeat(FIELD_LENGTHS.SEARCH_QUERY + 1) },
    { batchCursor: '' },
    {
      batchCursor: 'a'.repeat(
        CUSTOMER_PROJECT_PAGINATION.MAX_CURSOR_LENGTH + 1,
      ),
    },
    { customerId: CUSTOMER_PROJECT_TEST_IDS.OTHER },
    { managerId: CUSTOMER_PROJECT_TEST_IDS.MEMBER },
  ])('rejects unsupported or out-of-bound input %p', async (query) => {
    expect((await errorsFor(query)).length).toBeGreaterThan(0);
  });
});
