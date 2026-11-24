import { mock } from 'jest-mock-extended';
import { Sequelize, Transaction } from 'sequelize';
import { Customer } from '../entities/customer.entity';
import { CustomerOwnContactService } from '../customer-own-contact.service';
import { CustomerContactService } from '@Modules/customer-contact/customer-contact.service';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { CustomerContactRepository } from '@Modules/customer-contact/customer-contact.repository';
import { ProjectContactLink } from '@Modules/project-contact/entities/project-contact-link.entity';

const createFixture = () => {
  const customer = mock<Customer>({
    id: 'customer-id',
    name: 'שם הלקוח',
    createdById: 'creator',
    primaryContactId: 'contact-id',
  });
  const existing = mock<CustomerContact>({
    id: 'contact-id',
    customerId: customer.id,
    phone: '+442071838750',
    email: 'old@example.com',
    role: null,
    name: customer.name,
  });
  const created = mock<CustomerContact>({ id: 'new-own-id' });
  const transaction = new Transaction(
    new Sequelize({ dialect: 'postgres', logging: false }),
    {},
  );
  const queries = {
    findExisting: jest
      .spyOn(CustomerContact, 'findByPk')
      .mockResolvedValue(existing),
    findMatching: jest
      .spyOn(CustomerContact, 'findOne')
      .mockResolvedValue(null),
    create: jest.spyOn(CustomerContact, 'create').mockResolvedValue(created),
    otherCustomers: jest.spyOn(Customer, 'count').mockResolvedValue(0),
    projects: jest.spyOn(ProjectContactLink, 'count').mockResolvedValue(0),
  };
  return {
    customer,
    existing,
    created,
    transaction,
    queries,
    service: new CustomerOwnContactService(),
  };
};

afterEach(() => jest.restoreAllMocks());

describe('customer-owned primary-contact identity', () => {
  it('clears an explicit field and preserves the omitted field on an exclusive own record', async () => {
    const { service, customer, existing, transaction, queries } =
      createFixture();
    await service.setDetails(customer, { email: null }, transaction);
    expect(jest.spyOn(existing, 'update')).toHaveBeenCalledWith(
      { name: customer.name, role: null, phone: '+442071838750', email: null },
      { transaction },
    );
    expect(queries.create).not.toHaveBeenCalled();
    expect(queries.findExisting).toHaveBeenCalledWith('contact-id', {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  });

  it.each([null, 'different-owner'])(
    'copies an unowned or foreign-owned legacy contact (%s) without editing it',
    async (customerId) => {
      const { service, customer, existing, transaction, queries } =
        createFixture();
      existing.customerId = customerId;
      await service.setDetails(
        customer,
        { phone: '+12025550123' },
        transaction,
      );
      expect(jest.spyOn(existing, 'update')).not.toHaveBeenCalled();
      expect(queries.create).toHaveBeenCalledWith(
        {
          name: customer.name,
          role: null,
          phone: '+12025550123',
          email: 'old@example.com',
          customerId: customer.id,
          createdById: customer.createdById,
        },
        { transaction },
      );
      expect(jest.spyOn(customer, 'update')).toHaveBeenCalledWith(
        { primaryContactId: 'new-own-id' },
        { transaction },
      );
    },
  );

  it.each(['customer', 'project'] as const)(
    'copies a customer-owned record also used by another %s',
    async (reference) => {
      const { service, customer, existing, transaction, queries } =
        createFixture();
      const referenceCount = {
        customer: queries.otherCustomers,
        project: queries.projects,
      };
      referenceCount[reference].mockResolvedValue(1);
      await service.setDetails(
        customer,
        { email: 'new@example.com' },
        transaction,
      );
      expect(jest.spyOn(existing, 'update')).not.toHaveBeenCalled();
      expect(queries.create).toHaveBeenCalledTimes(1);
      expect(jest.spyOn(customer, 'update')).toHaveBeenCalledWith(
        { primaryContactId: 'new-own-id' },
        { transaction },
      );
    },
  );

  it('reuses an identical owned tuple when reverting instead of violating its uniqueness constraint', async () => {
    const { service, customer, existing, created, transaction, queries } =
      createFixture();
    queries.findMatching.mockResolvedValue(created);
    await service.setDetails(
      customer,
      { email: 'restored@example.com' },
      transaction,
    );
    expect(queries.create).not.toHaveBeenCalled();
    expect(queries.findMatching).toHaveBeenCalledWith(
      expect.objectContaining({ transaction, lock: transaction.LOCK.UPDATE }),
    );
    expect(jest.spyOn(existing, 'update')).not.toHaveBeenCalled();
    expect(jest.spyOn(customer, 'update')).toHaveBeenCalledWith(
      { primaryContactId: created.id },
      { transaction },
    );
  });

  it('creates blank own details with the customer name and no placeholder contact values', async () => {
    const { service, customer, transaction, queries } = createFixture();
    customer.primaryContactId = null;
    await service.setDetails(
      customer,
      { phone: null, email: null },
      transaction,
    );
    expect(queries.findExisting).not.toHaveBeenCalled();
    expect(queries.create).toHaveBeenCalledWith(
      {
        name: customer.name,
        role: null,
        phone: null,
        email: null,
        customerId: customer.id,
        createdById: customer.createdById,
      },
      { transaction },
    );
  });

  it('copies legacy selected contact values into a dedicated snapshot, never assigning its shared ID', async () => {
    const { service, customer, existing, transaction, queries } =
      createFixture();
    existing.customerId = null;
    await service.copyDetails(customer, existing.id, transaction);
    expect(queries.findExisting).toHaveBeenCalledWith(existing.id, {
      transaction,
    });
    expect(queries.create).toHaveBeenCalledWith(
      {
        name: customer.name,
        role: null,
        phone: existing.phone,
        email: existing.email,
        customerId: customer.id,
        createdById: customer.createdById,
      },
      { transaction },
    );
    expect(jest.spyOn(existing, 'update')).not.toHaveBeenCalled();
    expect(jest.spyOn(customer, 'update')).toHaveBeenCalledWith(
      { primaryContactId: 'new-own-id' },
      { transaction },
    );
  });

  it('rejects a missing legacy selected contact without altering the customer', async () => {
    const { service, customer, transaction, queries } = createFixture();
    queries.findExisting.mockResolvedValue(null);
    await expect(
      service.copyDetails(customer, 'missing', transaction),
    ).rejects.toMatchObject({ status: 404 });
    expect(jest.spyOn(customer, 'update')).not.toHaveBeenCalled();
    expect(queries.create).not.toHaveBeenCalled();
  });

  it('propagates a failed snapshot insertion so the enclosing transaction rolls back', async () => {
    const { service, customer, existing, transaction, queries } =
      createFixture();
    existing.customerId = null;
    const failure = new Error('storage unavailable');
    queries.create.mockRejectedValue(failure);
    await expect(
      service.setDetails(customer, { email: null }, transaction),
    ).rejects.toBe(failure);
    expect(jest.spyOn(customer, 'update')).not.toHaveBeenCalled();
    expect(jest.spyOn(existing, 'update')).not.toHaveBeenCalled();
  });
  it('keeps an old owned project contact editable after copy-on-write without changing the new customer snapshot', async () => {
    const { service, customer, existing, created, transaction, queries } =
      createFixture();
    queries.projects.mockResolvedValue(1);
    await service.setDetails(
      customer,
      { email: 'customer-own@example.com' },
      transaction,
    );
    expect(customer.update.mock.calls).toContainEqual([
      { primaryContactId: created.id },
      { transaction },
    ]);
    existing.get.mockReturnValue({
      name: existing.name,
      phone: existing.phone,
      email: existing.email,
      role: null,
    });
    const transactions = mock<DatabaseTransactionService>();
    transactions.run.mockImplementation((work) => work(transaction));
    const directory = new CustomerContactService(
      mock<CustomerContactRepository>(),
      transactions,
    );
    await directory.updateDirectory(existing.id, {
      email: 'project-person@example.com',
    });
    expect(existing.update.mock.calls).toContainEqual([
      {
        name: existing.name,
        phone: existing.phone,
        email: 'project-person@example.com',
        role: null,
      },
      { transaction },
    ]);
    expect(created.update.mock.calls).toHaveLength(0);
    expect(queries.create).toHaveBeenCalledTimes(1);
  });
});
