import { Transaction } from 'sequelize';
import { User } from './entities/user.entity';
import { UserRepository } from './user.repository';

describe('UserRepository password rotation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('increments the session version in the same transaction as the password hash', async () => {
    const transaction = Transaction.prototype;
    const update = jest.spyOn(User, 'update').mockResolvedValue([1] as never);
    const increment = jest
      .spyOn(User, 'increment')
      .mockResolvedValue([] as never);
    const repository = new UserRepository();

    await expect(
      repository.updatePasswordHash('user-id', 'new-hash', transaction),
    ).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith(
      { passwordHash: 'new-hash' },
      { where: { id: 'user-id' }, transaction },
    );
    expect(increment).toHaveBeenCalledWith('sessionVersion', {
      by: 1,
      where: { id: 'user-id' },
      transaction,
    });
  });
});
