import { Sequelize, Transaction } from 'sequelize';
import { Customer } from '@Modules/customer/entities/customer.entity';
import { CustomerRepository } from '@Modules/customer/customer.repository';

describe('transactional customer identity comparison lock', () => {
  afterEach(() => jest.restoreAllMocks());
  it('locks existing identity rows only inside a caller transaction', async () => {
    const query = jest.spyOn(Customer, 'findOne').mockResolvedValue(null);
    const transaction = new Transaction(
      new Sequelize({ dialect: 'postgres', logging: false }),
      {},
    );
    const repository = new CustomerRepository();
    await repository.findByTaxId('514287937', transaction);
    expect(query).toHaveBeenLastCalledWith({
      where: { taxId: '514287937' },
      transaction,
      lock: true,
    });
    await repository.findByTaxId('514287937');
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { taxId: '514287937' }, lock: false }),
    );
  });
});
