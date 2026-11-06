import {
  IUserFilter,
  IUserCredentials,
  TUserUpdateAttributes,
  TUserCreationAttributes,
} from './interfaces/user.interface';

import {
  CURSOR_ORDER,
  toCursorPage,
  buildCursorWhere,
} from '@Utilities/cursor-pagination.utility';

import { Injectable } from '@nestjs/common';
import { User } from './entities/user.entity';
import { Op, Sequelize, Transaction, WhereOptions } from 'sequelize';
import { ICursorPage, ICursorBatch } from '@Interfaces/cursor-page.interface';
import { toContainsPattern, whereWhenPresent } from '@Utilities/query.utility';

@Injectable()
export class UserRepository {
  findById(id: string, transaction?: Transaction): Promise<User | null> {
    return User.findByPk(id, { transaction });
  }

  findByIds(ids: string[]): Promise<User[]> {
    return User.findAll({ where: { id: { [Op.in]: ids } } });
  }

  findByEmailIncludingDeleted(email: string): Promise<User | null> {
    return User.findOne({ where: { email }, paranoid: false });
  }

  findCredentialsByEmail(email: string): Promise<IUserCredentials | null> {
    return User.unscoped().findOne({
      where: { email },
      attributes: ['id', 'passwordHash'],
    });
  }

  findAllCredentials(): Promise<Array<IUserCredentials & { email: string }>> {
    return User.unscoped().findAll({
      attributes: ['id', 'email', 'passwordHash'],
    });
  }

  findCredentialsById(
    id: string,
    transaction: Transaction,
  ): Promise<IUserCredentials | null> {
    return User.unscoped().findByPk(id, {
      attributes: ['id', 'passwordHash'],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  async findByFilter(
    filter: IUserFilter,
    batch: ICursorBatch,
    matchingRoleUserIds: string[] | null,
  ): Promise<ICursorPage<User>> {
    const roleFilter =
      matchingRoleUserIds === null
        ? []
        : [{ id: { [Op.in]: matchingRoleUserIds } }];
    const rows = await User.findAll({
      where: {
        [Op.and]: [
          ...roleFilter,
          ...this.buildFilterWhere(filter),
          ...buildCursorWhere(batch.batchCursor),
        ],
      },
      order: CURSOR_ORDER,
      limit: batch.batchSize + 1,
    });

    return toCursorPage(rows, batch.batchSize);
  }

  countActiveByIds(
    userIds: string[],
    transaction?: Transaction,
  ): Promise<number> {
    if (userIds.length === 0) {
      return Promise.resolve(0);
    }

    return User.count({
      where: { id: { [Op.in]: userIds } },
      transaction,
    });
  }

  countActiveUsers(): Promise<number> {
    return User.count();
  }

  create(
    attributes: TUserCreationAttributes,
    transaction?: Transaction,
  ): Promise<User> {
    return User.create(attributes, { transaction });
  }

  async update(
    id: string,
    attributes: TUserUpdateAttributes,
    transaction?: Transaction,
  ): Promise<boolean> {
    const [updatedCount] = await User.update(attributes, {
      where: { id },
      transaction,
    });

    return updatedCount > 0;
  }

  async updatePasswordHash(
    id: string,
    passwordHash: string,
    transaction?: Transaction,
  ): Promise<boolean> {
    const [updatedCount] = await User.update(
      { passwordHash },
      { where: { id }, transaction },
    );

    if (updatedCount === 0) {
      return false;
    }

    await User.increment('sessionVersion', {
      by: 1,
      where: { id },
      transaction,
    });

    return true;
  }

  async softDelete(id: string, transaction?: Transaction): Promise<boolean> {
    const deletedCount = await User.destroy({ where: { id }, transaction });

    return deletedCount > 0;
  }

  private buildFilterWhere(filter: IUserFilter): WhereOptions<User>[] {
    return [
      ...whereWhenPresent(filter.search, (search) =>
        this.buildSearchWhere(search),
      ),
    ];
  }

  private buildSearchWhere(search: string): WhereOptions<User> {
    const pattern = toContainsPattern(search);
    const fullName = Sequelize.fn(
      'CONCAT',
      Sequelize.col('first_name'),
      ' ',
      Sequelize.col('last_name'),
    );

    return {
      [Op.or]: [
        Sequelize.where(fullName, { [Op.iLike]: pattern }),
        { email: { [Op.iLike]: pattern } },
        { phone: { [Op.iLike]: pattern } },
        { employeeNumber: { [Op.iLike]: pattern } },
      ],
    };
  }
}
