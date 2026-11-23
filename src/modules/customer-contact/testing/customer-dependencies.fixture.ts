import { Sequelize, Transaction } from 'sequelize';
import { CustomerOwnContactService } from '@Modules/customer/customer-own-contact.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

export const createCustomerDependencyFixtures = () => {
  const transaction = new Transaction(
    new Sequelize({ dialect: 'postgres', logging: false }),
    {},
  );
  const ownContact = {
    setDetails: jest.fn(async () => {}),
    copyDetails: jest.fn(async () => {}),
  };
  const transactions = {
    run: jest.fn((work: (value: Transaction) => Promise<unknown>) =>
      work(transaction),
    ),
  };
  return {
    ownContact,
    transaction,
    transactions,
    providers: [
      { provide: CustomerOwnContactService, useValue: ownContact },
      { provide: DatabaseTransactionService, useValue: transactions },
    ],
  };
};
