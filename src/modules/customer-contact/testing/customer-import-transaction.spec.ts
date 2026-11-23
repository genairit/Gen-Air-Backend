import { Test } from '@nestjs/testing';
import { Sequelize, Transaction } from 'sequelize';
import { CustomerService } from '@Modules/customer/customer.service';
import { CustomerRepository } from '@Modules/customer/customer.repository';
import { createCustomerDependencyFixtures } from './customer-dependencies.fixture';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';

const customer = {
  name: 'לקוח לדוגמה',
  taxId: '514287937',
  address: 'הרצל 12',
  contactName: 'דנה ישראלי',
  phone: '0521234567',
  email: 'dana@example.com',
  customerType: PROJECT_DETAIL_FIELD_SETS.COMPANY,
};

describe('customer import transaction boundary', () => {
  it('allows own details without a separate contact person name', async () => {
    const dependencies = createCustomerDependencyFixtures();
    const created = { ...customer, id: 'created-customer' };
    const repository = { create: jest.fn().mockResolvedValue(created) };
    const module = await Test.createTestingModule({
      providers: [
        CustomerService,
        ...dependencies.providers,
        { provide: CustomerRepository, useValue: repository },
      ],
    }).compile();
    await module
      .get(CustomerService)
      .createForImport(
        { ...customer, contactName: null },
        'creator',
        dependencies.transaction,
      );
    expect(dependencies.ownContact.setDetails).toHaveBeenCalledWith(
      created,
      { phone: customer.phone, email: customer.email },
      dependencies.transaction,
    );
    await module.close();
  });

  it('passes the caller transaction through identity lookup and customer insertion', async () => {
    const transaction = new Transaction(
      new Sequelize({ dialect: 'postgres', logging: false }),
      {},
    );
    const repository = {
      findByTaxId: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(true),
      create: jest
        .fn()
        .mockResolvedValue({ ...customer, id: 'created-customer' }),
    };
    const dependencies = createCustomerDependencyFixtures();
    const module = await Test.createTestingModule({
      providers: [
        CustomerService,
        ...dependencies.providers,
        { provide: CustomerRepository, useValue: repository },
      ],
    }).compile();
    const service = module.get(CustomerService);
    expect(await service.findByTaxId(customer.taxId, transaction)).toBeNull();
    expect(
      await service.createForImport(customer, 'creator', transaction),
    ).toMatchObject({ id: 'created-customer' });
    expect(repository.findByTaxId).toHaveBeenCalledWith(
      customer.taxId,
      transaction,
    );
    expect(repository.create).toHaveBeenCalledWith(
      {
        ...customer,
        phone: null,
        email: null,
        contactName: null,
        paymentTerms: null,
        createdById: 'creator',
      },
      transaction,
    );
    expect(dependencies.ownContact.setDetails).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'created-customer' }),
      { phone: customer.phone, email: customer.email },
      transaction,
    );
    await module.close();
  });

  it('propagates a failed insert so the enclosing row transaction can roll back', async () => {
    const transaction = new Transaction(
      new Sequelize({ dialect: 'postgres', logging: false }),
      {},
    );
    const failure = new Error('insert failed');
    const repository = { create: jest.fn().mockRejectedValue(failure) };
    const module = await Test.createTestingModule({
      providers: [
        CustomerService,
        ...createCustomerDependencyFixtures().providers,
        { provide: CustomerRepository, useValue: repository },
      ],
    }).compile();
    const service = module.get(CustomerService);
    await expect(
      service.createForImport(customer, 'creator', transaction),
    ).rejects.toBe(failure);
    await module.close();
  });
});
