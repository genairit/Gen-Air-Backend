import {
  CUSTOMER_PROJECT_TEST_IDS,
  makeCustomerProjectSource,
} from '../../testing/customer-project.fixture';

import {
  ICustomerProjectBatch,
  ICustomerProjectScope,
  ICustomerProjectSource,
} from './interfaces/customer-project.interface';

import {
  encodeCustomerProjectCursor,
  decodeCustomerProjectCursor,
} from './utilities/customer-project-cursor.utility';

import { Test } from '@nestjs/testing';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { CustomerProjectService } from './customer-project.service';
import { CustomerService } from '@Modules/customer/customer.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';
import { CustomerProjectRepository } from './customer-project.repository';

const setup = async () => {
  const customers = {
    getById: jest
      .fn()
      .mockResolvedValue({ id: CUSTOMER_PROJECT_TEST_IDS.CUSTOMER }),
  };
  const projects = {
    findPage: jest
      .fn<
        Promise<ICustomerProjectSource[]>,
        [ICustomerProjectScope, ICustomerProjectBatch]
      >()
      .mockResolvedValue([]),
    countByStage: jest.fn().mockResolvedValue([]),
    countAll: jest.fn().mockResolvedValue(0),
  };
  const module = await Test.createTestingModule({
    providers: [
      CustomerProjectService,
      { provide: CustomerService, useValue: customers },
      { provide: CustomerProjectRepository, useValue: projects },
    ],
  }).compile();
  return { service: module.get(CustomerProjectService), customers, projects };
};

describe('customer related project orchestration', () => {
  it('rejects a missing/archived customer before issuing project queries', async () => {
    const state = await setup();
    const error = new NotFoundException('customer missing');
    state.customers.getById.mockRejectedValue(error);
    await expect(
      state.service.getPage(CUSTOMER_PROJECT_TEST_IDS.CUSTOMER, {}),
    ).rejects.toBe(error);
    expect(state.projects.findPage).not.toHaveBeenCalled();
    expect(state.projects.countByStage).not.toHaveBeenCalled();
    expect(state.projects.countAll).not.toHaveBeenCalled();
  });

  it('returns an empty page and real counts without creating a continuation', async () => {
    const state = await setup();
    expect(
      await state.service.getPage(CUSTOMER_PROJECT_TEST_IDS.CUSTOMER, {}),
    ).toEqual({
      items: [],
      nextCursor: null,
      total: 0,
      counts: { total: 0, byStage: {} },
    });
    expect(state.projects.findPage).toHaveBeenCalledWith(
      {
        customerId: CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
        search: '',
        stageId: null,
      },
      { size: 8, cursor: null },
    );
  });

  it('projects the first eight rows and binds continuation to the last returned row, never the lookahead row', async () => {
    const state = await setup();
    const rows = Array.from({ length: 9 }, (_, index) =>
      makeCustomerProjectSource({
        id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        name: `פרויקט ${index}`,
      }),
    );
    state.projects.findPage.mockResolvedValue(rows);
    state.projects.countAll.mockResolvedValue(30);
    state.projects.countByStage.mockResolvedValue([
      { stageId: PROJECT_STATUS_IDS.WAITING, count: 30 },
    ]);
    const page = await state.service.getPage(
      CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
      {},
    );
    expect(page.items.map((item) => item.id)).toEqual(
      rows.slice(0, 8).map((row) => row.id),
    );
    expect(page.total).toBe(30);
    expect(page.nextCursor).not.toBeNull();
    const position = decodeCustomerProjectCursor(page.nextCursor ?? '', {
      customerId: CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
      search: '',
      stageId: null,
    });
    expect(position).toEqual(
      expect.objectContaining({
        id: rows[7].id,
        name: rows[7].name,
        updatedAt: rows[7].updatedAt,
      }),
    );
    expect(position?.id).not.toBe(rows[8].id);
  });

  it('retains search-matched all-stage counts and overall customer total for a selected-stage page', async () => {
    const state = await setup();
    state.projects.findPage.mockResolvedValue([makeCustomerProjectSource()]);
    state.projects.countAll.mockResolvedValue(19);
    state.projects.countByStage.mockResolvedValue([
      { stageId: PROJECT_STATUS_IDS.WAITING, count: 3 },
      { stageId: PROJECT_STATUS_IDS.IN_PROGRESS, count: 11 },
    ]);
    const page = await state.service.getPage(
      CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
      {
        search: '  בניין  ',
        stageId: PROJECT_STATUS_IDS.WAITING,
        batchSize: 10,
      },
    );
    expect(page.total).toBe(19);
    expect(page.counts).toEqual({
      total: 14,
      byStage: {
        [PROJECT_STATUS_IDS.WAITING]: 3,
        [PROJECT_STATUS_IDS.IN_PROGRESS]: 11,
      },
    });
    expect(page.nextCursor).toBeNull();
    expect(state.projects.findPage).toHaveBeenCalledWith(
      {
        customerId: CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
        search: 'בניין',
        stageId: PROJECT_STATUS_IDS.WAITING,
      },
      { size: 10, cursor: null },
    );
  });

  it.each([{}, { batchSize: 10 }])(
    'uses ten rows for a valid continuation with default or explicit sizing %p',
    async (size) => {
      const state = await setup();
      const position = {
        customerId: CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
        search: 'בניין',
        stageId: PROJECT_STATUS_IDS.WAITING,
        id: CUSTOMER_PROJECT_TEST_IDS.PROJECT,
        name: 'שם',
        updatedAt: new Date('2026-10-20T12:00:00.000Z'),
      };
      await state.service.getPage(position.customerId, {
        search: ' בניין ',
        stageId: position.stageId,
        ...size,
        batchCursor: encodeCustomerProjectCursor(position),
      });
      expect(state.projects.findPage).toHaveBeenCalledWith(
        {
          customerId: position.customerId,
          search: 'בניין',
          stageId: position.stageId,
        },
        { size: 10, cursor: position },
      );
    },
  );

  it('continues past a maximum-length astral project name without rejecting or truncating the boundary', async () => {
    const state = await setup();
    const name = '😀'.repeat(FIELD_LENGTHS.PROJECT_NAME);
    const rows = Array.from({ length: 9 }, (_, index) =>
      makeCustomerProjectSource({
        id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        name,
      }),
    );
    state.projects.findPage
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([rows[8]]);
    state.projects.countAll.mockResolvedValue(rows.length);
    state.projects.countByStage.mockResolvedValue([
      { stageId: PROJECT_STATUS_IDS.WAITING, count: rows.length },
    ]);
    const first = await state.service.getPage(
      CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
      {},
    );
    const next = await state.service.getPage(
      CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
      { batchCursor: first.nextCursor ?? '' },
    );
    expect(first.items).toHaveLength(8);
    expect(first.items[7].name).toBe(name);
    expect(next.items.map((item) => item.id)).toEqual([rows[8].id]);
    expect(next.nextCursor).toBeNull();
    expect(state.projects.findPage).toHaveBeenNthCalledWith(
      2,
      {
        customerId: CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
        search: '',
        stageId: null,
      },
      {
        size: 10,
        cursor: {
          customerId: CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
          search: '',
          stageId: null,
          id: rows[7].id,
          name,
          updatedAt: rows[7].updatedAt,
        },
      },
    );
  });

  it.each([
    { cursor: 'bad-cursor', search: '', stageId: null },
    {
      cursor: encodeCustomerProjectCursor({
        customerId: CUSTOMER_PROJECT_TEST_IDS.OTHER,
        search: '',
        stageId: null,
        id: CUSTOMER_PROJECT_TEST_IDS.PROJECT,
        name: 'שם',
        updatedAt: new Date('2026-10-20'),
      }),
      search: '',
      stageId: null,
    },
    {
      cursor: encodeCustomerProjectCursor({
        customerId: CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
        search: 'old',
        stageId: null,
        id: CUSTOMER_PROJECT_TEST_IDS.PROJECT,
        name: 'שם',
        updatedAt: new Date('2026-10-20'),
      }),
      search: 'new',
      stageId: null,
    },
  ])(
    'rejects invalid or stale-scope continuation before querying rows/counts',
    async ({ cursor, search }) => {
      const state = await setup();
      await expect(
        state.service.getPage(CUSTOMER_PROJECT_TEST_IDS.CUSTOMER, {
          search,
          batchCursor: cursor,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(state.projects.findPage).not.toHaveBeenCalled();
      expect(state.projects.countByStage).not.toHaveBeenCalled();
      expect(state.projects.countAll).not.toHaveBeenCalled();
    },
  );

  it('propagates a failed database page instead of reporting an empty customer', async () => {
    const state = await setup();
    const error = new Error('database unavailable');
    state.projects.findPage.mockRejectedValue(error);
    await expect(
      state.service.getPage(CUSTOMER_PROJECT_TEST_IDS.CUSTOMER, {}),
    ).rejects.toBe(error);
  });
});
