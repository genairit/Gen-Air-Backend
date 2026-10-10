import {
  IUserFilter,
  IUserRoleCount,
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
import { isUserRole } from '@Utilities/user-role.utility';
import { Op, Sequelize, Transaction, WhereOptions } from 'sequelize';
import { ICursorPage, ICursorBatch } from '@Interfaces/cursor-page.interface';
import { toContainsPattern, whereWhenPresent } from '@Utilities/query.utility';

@Injectable()
export class UserRepository {
  findById(id: string): Promise<User | null> {
    return User.findByPk(id);
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

  async findByFilter(
    filter: IUserFilter,
    batch: ICursorBatch,
  ): Promise<ICursorPage<User>> {
    const rows = await User.findAll({
      where: {
        [Op.and]: [
          ...this.buildFilterWhere(filter),
          ...buildCursorWhere(batch.batchCursor),
        ],
      },
      order: CURSOR_ORDER,
      limit: batch.batchSize + 1,
    });

    return toCursorPage(rows, batch.batchSize);
  }

  async countByRole(): Promise<IUserRoleCount[]> {
    const groupedCounts = await User.count({ group: ['role'] });

    return groupedCounts.flatMap(({ role, count }) =>
      isUserRole(role) ? [{ role, count }] : [],
    );
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

    return updatedCount > 0;
  }

  async softDelete(id: string, transaction?: Transaction): Promise<boolean> {
    const deletedCount = await User.destroy({ where: { id }, transaction });

    return deletedCount > 0;
  }

  private buildFilterWhere(filter: IUserFilter): WhereOptions<User>[] {
    return [
      ...whereWhenPresent(filter.role, (role) => ({ role })),
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
