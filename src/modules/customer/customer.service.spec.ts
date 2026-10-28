import {
  PRIORITY_SYNC_STATUSES,
  EMPTY_CUSTOMER_SYNC_STATUS_COUNTS,
} from './constants/priority-sync-status.constant';

import { Test } from '@nestjs/testing';
import { UniqueConstraintError } from 'sequelize';
import { CustomerService } from './customer.service';
import { CustomerRepository } from './customer.repository';
import { ICustomer } from './interfaces/customer.interface';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';
import { createCustomerDependencyFixtures } from '@Modules/customer-contact/testing/customer-dependencies.fixture';

const CUSTOMER: ICustomer = {
  id: 'customer-1',
  deletedAt: null,
  priorityId: null,
  taxId: '514123456',
  createdById: 'user-1',
  phone: '052-1234567',
  prioritySyncedAt: null,
  prioritySyncError: null,
  prioritySyncAttempts: 0,
  name: 'בבלי נדל״ן ופיתוח',
  contactName: 'ישראל ישראלי',
  email: 'office@bavli.co.il',
  address: 'הרצל 12, תל אביב-יפו',
  customerType: PROJECT_DETAIL_FIELD_SETS.COMPANY,
  createdAt: new Date('2026-10-13T00:00:00.000Z'),
  updatedAt: new Date('2026-10-13T00:00:00.000Z'),
  prioritySyncStatus: PRIORITY_SYNC_STATUSES.PENDING,
};

const createService = async () => {
  const dependencies = createCustomerDependencyFixtures();
  const customerRepository = {
    create: jest.fn().mockResolvedValue(CUSTOMER),
    update: jest.fn().mockResolvedValue(true),
    findByTaxId: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(CUSTOMER),
    softDelete: jest.fn().mockResolvedValue(true),
    findByFilter: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    countBySyncStatus: jest
      .fn()
      .mockResolvedValue([
        { prioritySyncStatus: PRIORITY_SYNC_STATUSES.FAILED, count: 2 },
      ]),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      CustomerService,
      ...dependencies.providers,
      { provide: CustomerRepository, useValue: customerRepository },
    ],
  }).compile();

  return {
    service: moduleRef.get(CustomerService),
    customerRepository,
    dependencies,
  };
};

describe('CustomerService.getById', () => {
  it('throws when the customer does not exist', async () => {
    const { service, customerRepository } = await createService();
    customerRepository.findById.mockResolvedValue(null);

    await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
  });
});

describe('CustomerService.getByFilter', () => {
  it('passes missing filters as null and applies the default batch size', async () => {
    const { service, customerRepository } = await createService();

    await service.getByFilter({});

    expect(customerRepository.findByFilter).toHaveBeenCalledWith(
      { search: null, prioritySyncStatus: null },
      { batchCursor: null, batchSize: 50 },
    );
  });
});

describe('CustomerService.getSyncStatusCounts', () => {
  it('fills statuses without customers with zero', async () => {
    const { service } = await createService();

    await expect(service.getSyncStatusCounts()).resolves.toEqual({
      ...EMPTY_CUSTOMER_SYNC_STATUS_COUNTS,
      [PRIORITY_SYNC_STATUSES.FAILED]: 2,
    });
  });
});

describe('CustomerService.update', () => {
  it('does not check availability when the tax id is unchanged', async () => {
    const { service, customerRepository } = await createService();

    await service.update(CUSTOMER.id, { taxId: CUSTOMER.taxId });

    expect(customerRepository.findByTaxId).not.toHaveBeenCalled();
  });

  it('rejects a tax id that belongs to another customer', async () => {
    const { service, customerRepository } = await createService();
    customerRepository.findByTaxId.mockResolvedValue({
      ...CUSTOMER,
      id: 'customer-2',
    });

    await expect(
      service.update(CUSTOMER.id, { taxId: '520000001' }),
    ).rejects.toThrow(ConflictException);
    expect(customerRepository.update).not.toHaveBeenCalled();
  });

  it('throws when the customer does not exist', async () => {
    const { service, customerRepository } = await createService();
    customerRepository.findById.mockResolvedValue(null);

    await expect(service.update('missing', { name: 'x' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('CustomerService.delete', () => {
  it('throws when there is no customer to delete', async () => {
    const { service, customerRepository } = await createService();
    customerRepository.softDelete.mockResolvedValue(false);

    await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
  });
});

describe('CustomerService.create', () => {
  const input = {
    name: CUSTOMER.name,
    taxId: '514287937',
    phone: CUSTOMER.phone,
    email: CUSTOMER.email,
    address: CUSTOMER.address,
    contactName: CUSTOMER.contactName,
    customerType: CUSTOMER.customerType,
  };

  it('persists only creation fields with the authenticated creator and returns the stored customer', async () => {
    const { service, customerRepository, dependencies } = await createService();

    await expect(service.create(input, 'trusted-user')).resolves.toEqual(
      CUSTOMER,
    );
    expect(customerRepository.create).toHaveBeenCalledWith(
      {
        ...input,
        createdById: 'trusted-user',
      },
      dependencies.transaction,
    );
    expect(dependencies.contacts.resolveForImport).toHaveBeenCalledWith(
      {
        customerId: CUSTOMER.id,
        createdById: 'trusted-user',
        name: input.contactName,
        phone: input.phone,
        email: input.email,
        role: null,
      },
      dependencies.transaction,
    );
    expect(customerRepository.findById).toHaveBeenCalledWith(CUSTOMER.id);
  });

  it('propagates initial-contact failure to roll back customer creation', async () => {
    const { service, customerRepository, dependencies } = await createService();
    const failure = new Error('contact failed');
    dependencies.contacts.resolveForImport.mockRejectedValueOnce(failure);
    await expect(service.create(input, 'trusted-user')).rejects.toBe(failure);
    expect(customerRepository.findById).not.toHaveBeenCalled();
  });

  it('rejects an existing registration number before writing', async () => {
    const { service, customerRepository } = await createService();
    customerRepository.findByTaxId.mockResolvedValue(CUSTOMER);

    await expect(service.create(input, 'trusted-user')).rejects.toThrow(
      ConflictException,
    );
    expect(customerRepository.create).not.toHaveBeenCalled();
  });

  it('translates the database registration constraint race into a conflict', async () => {
    const { service, customerRepository } = await createService();
    const parent = Object.assign(new Error('duplicate registration'), {
      sql: '',
      constraint: 'uq_customers_tax_id',
    });
    customerRepository.create.mockRejectedValue(
      new UniqueConstraintError({ parent }),
    );

    await expect(service.create(input, 'trusted-user')).rejects.toThrow(
      ConflictException,
    );
  });

  it.each(['uq_unrelated_constraint', null])(
    'preserves an unrelated database error (%s)',
    async (constraint) => {
      const { service, customerRepository } = await createService();
      const parent = Object.assign(new Error('database failure'), {
        sql: '',
        constraint,
      });
      const error = constraint ? new UniqueConstraintError({ parent }) : parent;
      customerRepository.create.mockRejectedValue(error);

      await expect(service.create(input, 'trusted-user')).rejects.toBe(error);
    },
  );
});
