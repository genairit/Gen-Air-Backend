import { mock } from 'jest-mock-extended';
import { Sequelize, Transaction } from 'sequelize';
import { CustomerContactService } from '../customer-contact.service';
import { CustomerContact } from '../entities/customer-contact.entity';
import { Customer } from '@Modules/customer/entities/customer.entity';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { CustomerContactRepository } from '../customer-contact.repository';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const createFixture = () => {
  const transaction = new Transaction(
    new Sequelize({ dialect: 'postgres', logging: false }),
    {},
  );
  const transactions = mock<DatabaseTransactionService>();
  transactions.run.mockImplementation((work) => work(transaction));
  const repository = mock<CustomerContactRepository>();
  const contact = mock<CustomerContact>({ id: 'contact-id', customerId: null });
  jest.spyOn(CustomerContact, 'findByPk').mockResolvedValue(contact);
  const references = jest.spyOn(Customer, 'count').mockResolvedValue(0);
  return {
    transaction,
    contact,
    references,
    service: new CustomerContactService(repository, transactions),
  };
};

afterEach(() => jest.restoreAllMocks());

describe('directory and customer-owned contact separation', () => {
  it.each(['owned', 'legacy-primary'] as const)(
    'rejects directory edits of a %s customer contact instead of changing customer details behind its form',
    async (identity) => {
      const { service, contact, references } = createFixture();
      if (identity === 'owned') {
        contact.customerId = 'customer-id';
      }

      if (identity === 'legacy-primary') {
        references.mockResolvedValue(1);
      }

      await expect(
        service.updateDirectory(contact.id, { email: 'changed@example.com' }),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: HTTP_ERROR_CODES.CUSTOMER_OWN_CONTACT_MANAGED },
      });
      expect(jest.spyOn(contact, 'update')).not.toHaveBeenCalled();
    },
  );

  it('continues to edit an ordinary reusable project contact', async () => {
    const { service, contact, transaction } = createFixture();
    contact.get.mockReturnValue({
      name: 'איש קשר לפרויקט',
      phone: null,
      email: 'old@example.com',
      role: null,
    });
    await service.updateDirectory(contact.id, { email: 'new@example.com' });
    expect(jest.spyOn(contact, 'update')).toHaveBeenCalledWith(
      {
        name: 'איש קשר לפרויקט',
        phone: null,
        email: 'new@example.com',
        role: null,
      },
      { transaction },
    );
  });

  it('excludes dedicated customer details from reusable-directory search and import matching', async () => {
    const search = jest.spyOn(CustomerContact, 'findAll').mockResolvedValue([]);
    const repository = new CustomerContactRepository();
    await repository.search('לקוח');
    expect(search.mock.calls.at(-1)?.[0]?.where).toEqual(
      expect.objectContaining({ customerId: null }),
    );
    const transaction = new Transaction(
      new Sequelize({ dialect: 'postgres', logging: false }),
      {},
    );
    await repository.findExactDirectory(
      { name: 'לקוח', phone: '+442071838750', email: null, role: null },
      transaction,
    );
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { name: 'לקוח', customerId: null },
        transaction,
      }),
    );
  });
});
