import { CustomerContact } from './entities/customer-contact.entity';
import { Op, fn, col, where, Sequelize, Transaction } from 'sequelize';
import { CustomerContactRepository } from './customer-contact.repository';

const emptyValues = {
  name: 'דנה ישראלי',
  phone: null,
  email: null,
  role: null,
};

describe('contact tuple lookup matches database uniqueness', () => {
  afterEach(() => jest.restoreAllMocks());
  it('coalesces null and legacy empty optional fields exactly like the unique index', async () => {
    const query = jest
      .spyOn(CustomerContact, 'findOne')
      .mockResolvedValue(null);
    const transaction = new Transaction(
      new Sequelize({ dialect: 'postgres', logging: false }),
      {},
    );
    const repository = new CustomerContactRepository();
    await repository.findExact('customer', emptyValues, transaction);
    expect(query).toHaveBeenCalledWith({
      where: {
        customerId: 'customer',
        name: emptyValues.name,
        [Op.and]: [
          where(fn('coalesce', col('phone'), ''), ''),
          where(fn('coalesce', col('email'), ''), ''),
          where(fn('coalesce', col('role'), ''), ''),
        ],
      },
      transaction,
    });
  });
});
