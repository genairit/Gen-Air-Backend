import {
  IMPORT_ROW,
  IMPORT_CREATOR,
  makeImportFile,
  IMPORT_CUSTOMER,
} from './testing/apartment-import.fixture';

import { Test } from '@nestjs/testing';
import { Sequelize, Transaction } from 'sequelize';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProjectRepository } from './project.repository';
import { CustomerService } from '@Modules/customer/customer.service';
import { ProjectApartmentService } from './project-apartment.service';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';
import { getHttpErrorPayload } from '@Utilities/http-error-payload.utility';
import { ProjectApartmentImportService } from './project-apartment-import.service';
import { ProjectStageService } from '@Modules/project-stage/project-stage.service';
import { ProjectTaskInitializationService } from './project-task-initialization.service';
import { CustomerContactService } from '@Modules/customer-contact/customer-contact.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { PRIORITY_SYNC_STATUSES } from '@Modules/customer/constants/priority-sync-status.constant';
import { ProjectStageTransitionService } from '@Modules/project-stage-transition/project-stage-transition.service';

const setup = async () => {
  const transaction = new Transaction(
    new Sequelize({ dialect: 'postgres', logging: false }),
    {},
  );
  const building = {
    id: 'building',
    code: 'B1',
    parentProjectId: null,
    projectType: { canHaveApartments: true },
  };
  const projects = {
    findById: jest.fn().mockResolvedValue(building),
    lockForImport: jest.fn().mockResolvedValue(building),
    findLiveApartmentByNumber: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'created' }),
  };
  const customers = {
    findByTaxId: jest.fn().mockResolvedValue(null),
    createForImport: jest.fn().mockResolvedValue(IMPORT_CUSTOMER),
  };
  const contacts = {
    resolveForImport: jest.fn().mockResolvedValue({ id: 'contact' }),
  };
  const apartments = {
    resolveNewApartment: jest.fn().mockResolvedValue({ name: 'דירה1' }),
  };
  const transitions = { record: jest.fn().mockResolvedValue(null) };
  const taskInitialization = {
    ensureForProject: jest.fn().mockResolvedValue(null),
  };
  const events = { emitAsync: jest.fn().mockResolvedValue([]) };
  const transactions = {
    run: jest.fn((work: (value: Transaction) => Promise<unknown>) =>
      work(transaction),
    ),
    lockKey: jest.fn().mockResolvedValue(null),
  };
  const module = await Test.createTestingModule({
    providers: [
      ProjectApartmentImportService,
      {
        provide: ProjectTaskInitializationService,
        useValue: taskInitialization,
      },
      { provide: ProjectRepository, useValue: projects },
      { provide: CustomerService, useValue: customers },
      { provide: CustomerContactService, useValue: contacts },
      { provide: ProjectApartmentService, useValue: apartments },
      {
        provide: ProjectStageService,
        useValue: {
          getInitialStage: jest
            .fn()
            .mockResolvedValue({ id: PROJECT_STATUS_IDS.DRAFT }),
        },
      },
      { provide: ProjectStageTransitionService, useValue: transitions },
      { provide: EventEmitter2, useValue: events },
      { provide: DatabaseTransactionService, useValue: transactions },
    ],
  }).compile();
  return {
    service: module.get(ProjectApartmentImportService),
    projects,
    customers,
    contacts,
    apartments,
    transitions,
    taskInitialization,
    transactions,
    events,
    transaction,
  };
};

describe('transactional apartment importer orchestration', () => {
  it('creates customer+apartment+two contacts+stage in the same row transaction', async () => {
    const state = await setup();
    const result = await state.service.import(
      'building',
      await makeImportFile([IMPORT_ROW]),
      IMPORT_CREATOR,
    );
    expect(result.counts).toEqual({
      created: 1,
      existing: 0,
      duplicate: 0,
      error: 0,
    });
    expect(state.customers.createForImport).toHaveBeenCalledWith(
      expect.objectContaining({ taxId: IMPORT_CUSTOMER.taxId }),
      IMPORT_CREATOR.id,
      state.transaction,
    );
    expect(state.projects.create).toHaveBeenCalledWith(
      expect.any(Object),
      state.transaction,
    );
    expect(state.contacts.resolveForImport).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: IMPORT_CUSTOMER.name,
        phone: IMPORT_CUSTOMER.phone,
        email: IMPORT_CUSTOMER.email,
      }),
      state.transaction,
    );
    expect(state.contacts.resolveForImport).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: IMPORT_ROW.contactName,
        phone: IMPORT_ROW.contactPhone,
        email: IMPORT_ROW.contactEmail,
      }),
      state.transaction,
    );
    expect(state.transitions.record).toHaveBeenCalledWith(
      expect.any(Object),
      state.transaction,
    );
    expect(state.taskInitialization.ensureForProject).toHaveBeenCalledWith(
      { id: 'created', name: 'דירה1' },
      IMPORT_CREATOR,
      state.transaction,
    );
    expect(state.transitions.record).toHaveBeenCalledWith(
      expect.objectContaining({ toStageId: PROJECT_STATUS_IDS.DRAFT }),
      state.transaction,
    );
    expect(state.events.emitAsync).toHaveBeenCalledTimes(1);
  });
  it('reports a failed row and does not publish an apartment when mandatory task creation fails', async () => {
    const state = await setup();
    state.taskInitialization.ensureForProject.mockRejectedValue(
      new Error('mandatory task failed'),
    );
    const result = await state.service.import(
      'building',
      await makeImportFile([IMPORT_ROW]),
      IMPORT_CREATOR,
    );
    expect(result.counts.created).toBe(0);
    expect(result.counts.error).toBe(1);
    expect(state.events.emitAsync).not.toHaveBeenCalled();
  });

  it('keeps all building and apartment reads on the transaction and uses refreshed building data', async () => {
    const state = await setup();
    state.projects.findById
      .mockResolvedValueOnce({
        id: 'building',
        code: 'old',
        parentProjectId: null,
        projectType: { canHaveApartments: true },
      })
      .mockResolvedValue({
        id: 'building',
        code: 'fresh',
        parentProjectId: null,
        projectType: { canHaveApartments: true },
      });
    await state.service.import(
      'building',
      await makeImportFile([IMPORT_ROW]),
      IMPORT_CREATOR,
    );
    expect(state.projects.findById).toHaveBeenLastCalledWith(
      'building',
      state.transaction,
    );
    expect(state.projects.findLiveApartmentByNumber).toHaveBeenCalledWith(
      'building',
      '1',
      state.transaction,
    );
    expect(state.apartments.resolveNewApartment).toHaveBeenCalledWith(
      expect.objectContaining({
        building: {
          id: 'building',
          code: 'fresh',
          parentProjectId: null,
          projectType: { canHaveApartments: true },
        },
        transaction: state.transaction,
      }),
    );
  });

  it('rejects a building deleted while the upload was being validated', async () => {
    const state = await setup();
    state.projects.lockForImport.mockResolvedValue(null);
    const result = await state.service.import(
      'building',
      await makeImportFile([IMPORT_ROW]),
      IMPORT_CREATOR,
    );
    expect(result.counts.error).toBe(1);
    expect(state.projects.create).not.toHaveBeenCalled();
  });

  it('revalidates a building that changed type while waiting for its lock', async () => {
    const state = await setup();
    state.projects.findById
      .mockResolvedValueOnce({
        id: 'building',
        parentProjectId: null,
        projectType: { canHaveApartments: true },
      })
      .mockResolvedValue({
        id: 'building',
        parentProjectId: null,
        projectType: { canHaveApartments: false },
      });
    const result = await state.service.import(
      'building',
      await makeImportFile([IMPORT_ROW]),
      IMPORT_CREATOR,
    );
    expect(result.counts.error).toBe(1);
    expect(state.projects.create).not.toHaveBeenCalled();
  });

  it('rejects a repeated taxID conflict even if the first row never reached persistence', async () => {
    const state = await setup();
    const result = await state.service.import(
      'building',
      await makeImportFile([
        { ...IMPORT_ROW, credit: '-1' },
        { ...IMPORT_ROW, apartment: '2', customerName: 'לקוח שונה' },
      ]),
      IMPORT_CREATOR,
    );
    expect(result.counts.error).toBe(2);
    expect(state.transactions.run).not.toHaveBeenCalled();
  });

  it('processes100distinct apartment rows under the selected building', async () => {
    const state = await setup();
    state.customers.findByTaxId.mockResolvedValue(IMPORT_CUSTOMER);
    const rows = Array.from({ length: 100 }, (_, index) => ({
      ...IMPORT_ROW,
      apartment: String(index + 1),
    }));
    const result = await state.service.import(
      'building',
      await makeImportFile(rows),
      IMPORT_CREATOR,
    );
    expect(result.counts.created).toBe(100);
    expect(state.projects.create).toHaveBeenCalledTimes(100);
    expect(state.customers.createForImport).not.toHaveBeenCalled();
  });

  it('reimport skips existing apartments and never repeats customer/contact writes', async () => {
    const state = await setup();
    const file = await makeImportFile([IMPORT_ROW]);
    expect(
      (await state.service.import('building', file, IMPORT_CREATOR)).counts
        .created,
    ).toBe(1);
    state.projects.findLiveApartmentByNumber.mockResolvedValue({
      id: 'created',
    });
    expect(
      (await state.service.import('building', file, IMPORT_CREATOR)).counts
        .existing,
    ).toBe(1);
    expect(state.projects.create).toHaveBeenCalledTimes(1);
    expect(state.contacts.resolveForImport).toHaveBeenCalledTimes(2);
  });

  it('rejects a missing upload or missing initial building without writes', async () => {
    const state = await setup();
    await expect(
      state.service.import('building', null, IMPORT_CREATOR),
    ).rejects.toMatchObject({ status: 400 });
    state.projects.findById.mockResolvedValue(null);
    await expect(
      state.service.import(
        'building',
        await makeImportFile([IMPORT_ROW]),
        IMPORT_CREATOR,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(state.transactions.run).not.toHaveBeenCalled();
  });

  it('does not link an existing customer whose synchronization failed', async () => {
    const state = await setup();
    state.customers.findByTaxId.mockResolvedValue({
      ...IMPORT_CUSTOMER,
      prioritySyncStatus: PRIORITY_SYNC_STATUSES.FAILED,
    });
    const result = await state.service.import(
      'building',
      await makeImportFile([IMPORT_ROW]),
      IMPORT_CREATOR,
    );
    expect(result.counts.error).toBe(1);
    expect(state.projects.create).not.toHaveBeenCalled();
  });

  it('rejects a new customer missing required details without creating it', async () => {
    const state = await setup();
    const result = await state.service.import(
      'building',
      await makeImportFile([{ ...IMPORT_ROW, customerAddress: '' }]),
      IMPORT_CREATOR,
    );
    expect(result.counts.error).toBe(1);
    expect(state.customers.createForImport).not.toHaveBeenCalled();
    expect(state.projects.create).not.toHaveBeenCalled();
  });

  it('allows an omitted secondary contact for an existing customer', async () => {
    const state = await setup();
    state.customers.findByTaxId.mockResolvedValue(IMPORT_CUSTOMER);
    const result = await state.service.import(
      'building',
      await makeImportFile([
        { ...IMPORT_ROW, contactName: '', contactPhone: '', contactEmail: '' },
      ]),
      IMPORT_CREATOR,
    );
    expect(result.counts.created).toBe(1);
    expect(state.contacts.resolveForImport).toHaveBeenCalledTimes(1);
  });

  it('reuses matching customer without creating or updating it', async () => {
    const state = await setup();
    state.customers.findByTaxId.mockResolvedValue(IMPORT_CUSTOMER);
    const result = await state.service.import(
      'building',
      await makeImportFile([IMPORT_ROW]),
      IMPORT_CREATOR,
    );
    expect(result.counts.created).toBe(1);
    expect(state.customers.createForImport).not.toHaveBeenCalled();
  });
  it('rejects conflicting existing customer details before creating an apartment', async () => {
    const state = await setup();
    state.customers.findByTaxId.mockResolvedValue(IMPORT_CUSTOMER);
    const result = await state.service.import(
      'building',
      await makeImportFile([{ ...IMPORT_ROW, customerName: 'שם אחר' }]),
      IMPORT_CREATOR,
    );
    expect(result.counts.error).toBe(1);
    expect(state.projects.create).not.toHaveBeenCalled();
    expect(state.contacts.resolveForImport).not.toHaveBeenCalled();
  });
  it('skips an existing apartment without writing any customer or contact', async () => {
    const state = await setup();
    state.projects.findLiveApartmentByNumber.mockResolvedValue({
      id: 'existing',
    });
    const result = await state.service.import(
      'building',
      await makeImportFile([IMPORT_ROW]),
      IMPORT_CREATOR,
    );
    expect(result.counts.existing).toBe(1);
    expect(state.customers.createForImport).not.toHaveBeenCalled();
    expect(state.contacts.resolveForImport).not.toHaveBeenCalled();
  });
  it('uses first occurrence and reports later duplicate without another transaction', async () => {
    const state = await setup();
    const result = await state.service.import(
      'building',
      await makeImportFile([IMPORT_ROW, IMPORT_ROW]),
      IMPORT_CREATOR,
    );
    expect(result.counts).toEqual({
      created: 1,
      existing: 0,
      duplicate: 1,
      error: 0,
    });
    expect(state.transactions.run).toHaveBeenCalledTimes(1);
  });
  it('continues after a failing row transaction and does not emit success for it', async () => {
    const state = await setup();
    state.contacts.resolveForImport.mockRejectedValueOnce(
      new Error('private database failure'),
    );
    const result = await state.service.import(
      'building',
      await makeImportFile([IMPORT_ROW, { ...IMPORT_ROW, apartment: '2' }]),
      IMPORT_CREATOR,
    );
    expect(result.counts).toEqual({
      created: 1,
      existing: 0,
      duplicate: 0,
      error: 1,
    });
    expect(result.rows[0].reason).not.toContain('private');
    expect(state.events.emitAsync).toHaveBeenCalledTimes(1);
  });
  it('localizes known contact errors in row reports without exposing English API messages', async () => {
    const state = await setup();
    state.contacts.resolveForImport.mockRejectedValueOnce(
      new BadRequestException(
        getHttpErrorPayload(HTTP_ERROR_CODES.INVALID_CUSTOMER_CONTACT),
      ),
    );
    const result = await state.service.import(
      'building',
      await makeImportFile([IMPORT_ROW]),
      IMPORT_CREATOR,
    );
    expect(result.rows[0].reason).toBe('פרטי איש הקשר אינם תקינים');
    expect(result.counts.error).toBe(1);
    expect(state.events.emitAsync).not.toHaveBeenCalled();
  });

  it('reports a global apartment-name conflict without contacts, stage, task or success events', async () => {
    const state = await setup();
    state.projects.create.mockRejectedValueOnce(
      new ConflictException(
        getHttpErrorPayload(HTTP_ERROR_CODES.PROJECT_NAME_ALREADY_EXISTS),
      ),
    );
    const result = await state.service.import(
      'building',
      await makeImportFile([IMPORT_ROW]),
      IMPORT_CREATOR,
    );
    expect(result.counts).toEqual({
      created: 0,
      existing: 0,
      duplicate: 0,
      error: 1,
    });
    expect(result.rows[0].reason).toBe(
      'קיים כבר פרויקט בשם הדירה במערכת; לא נשמרו שינויים משורה זו',
    );
    expect(result.rows[0].status).toBe('error');
    expect(state.projects.create).toHaveBeenCalledTimes(1);
    expect(state.contacts.resolveForImport).not.toHaveBeenCalled();
    expect(state.transitions.record).not.toHaveBeenCalled();
    expect(state.taskInitialization.ensureForProject).not.toHaveBeenCalled();
    expect(state.events.emitAsync).not.toHaveBeenCalled();
  });

  it('does not expose arbitrary exception messages in row reports', async () => {
    const state = await setup();
    state.contacts.resolveForImport.mockRejectedValueOnce(
      new BadRequestException('private submitted data'),
    );
    const result = await state.service.import(
      'building',
      await makeImportFile([IMPORT_ROW]),
      IMPORT_CREATOR,
    );
    expect(result.rows[0].reason).toBe(
      'לא ניתן לשמור את השורה; לא נשמרו שינויים משורה זו',
    );
  });

  it('uses stable English API codes for missing files and unavailable or ineligible buildings', async () => {
    const state = await setup();
    await expect(
      state.service.import('building', null, IMPORT_CREATOR),
    ).rejects.toMatchObject({
      response: getHttpErrorPayload(
        HTTP_ERROR_CODES.APARTMENT_IMPORT_FILE_REQUIRED,
      ),
      status: 400,
    });
    state.projects.findById.mockResolvedValueOnce(null);
    await expect(state.service.template('missing')).rejects.toMatchObject({
      response: getHttpErrorPayload(
        HTTP_ERROR_CODES.APARTMENT_IMPORT_BUILDING_NOT_FOUND,
      ),
      status: 404,
    });
    state.projects.findById.mockResolvedValueOnce({
      parentProjectId: 'parent',
    });
    await expect(state.service.template('child')).rejects.toMatchObject({
      response: getHttpErrorPayload(
        HTTP_ERROR_CODES.APARTMENT_IMPORT_BUILDING_INVALID,
      ),
      status: 400,
    });
  });

  it('reports invalid fields without opening a transaction', async () => {
    const state = await setup();
    const result = await state.service.import(
      'building',
      await makeImportFile([{ ...IMPORT_ROW, credit: '-1' }]),
      IMPORT_CREATOR,
    );
    expect(result.counts.error).toBe(1);
    expect(state.transactions.run).not.toHaveBeenCalled();
  });
  it('rejects a non-building route and malformed workbook before any writes', async () => {
    const state = await setup();
    state.projects.findById.mockResolvedValue({ parentProjectId: 'parent' });
    await expect(
      state.service.import(
        'apartment',
        await makeImportFile([IMPORT_ROW]),
        IMPORT_CREATOR,
      ),
    ).rejects.toMatchObject({ status: 400 });
    const file = await makeImportFile([IMPORT_ROW]);
    file.buffer = Buffer.from('notxlsx');
    await expect(
      state.service.import('building', file, IMPORT_CREATOR),
    ).rejects.toMatchObject({ status: 422 });
    expect(state.transactions.run).not.toHaveBeenCalled();
  });
  it('does not report committed data as failed when a postcommit event fails', async () => {
    const state = await setup();
    state.events.emitAsync.mockRejectedValue(new Error('event failure'));
    const result = await state.service.import(
      'building',
      await makeImportFile([IMPORT_ROW]),
      IMPORT_CREATOR,
    );
    expect(result.counts.created).toBe(1);
  });
});
