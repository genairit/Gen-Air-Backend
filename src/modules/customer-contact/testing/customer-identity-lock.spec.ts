import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Customer } from '@Modules/customer/entities/customer.entity';
import { CustomerRepository } from '@Modules/customer/customer.repository';

describe('transactional customer identity comparison lock', () => {
  afterEach(() => jest.restoreAllMocks());
  it('locks existing identity rows only inside a caller transaction', async () => {
    const query = jest.spyOn(Customer, 'findOne').mockResolvedValue(null);
    const sequelize = new Sequelize({ dialect: 'postgres', logging: false });
    const transaction = new Transaction(sequelize, {});
    const repository = new CustomerRepository(sequelize);
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
