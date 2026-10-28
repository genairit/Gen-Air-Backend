import { Sequelize, Transaction } from 'sequelize';
import { CustomerContactService } from '../customer-contact.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

export const createCustomerDependencyFixtures = () => {
  const transaction = new Transaction(
    new Sequelize({ dialect: 'postgres', logging: false }),
    {},
  );
  const contacts = { resolveForImport: jest.fn().mockResolvedValue(null) };
  const transactions = {
    run: jest.fn((work: (value: Transaction) => Promise<unknown>) =>
      work(transaction),
    ),
  };
  return {
    contacts,
    transaction,
    transactions,
    providers: [
      { provide: CustomerContactService, useValue: contacts },
      { provide: DatabaseTransactionService, useValue: transactions },
    ],
  };
};
