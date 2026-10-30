import {
  ICustomerFilter,
  ICustomerSyncStatusCount,
  TCustomerUpdateAttributes,
  TCustomerCreationAttributes,
} from './interfaces/customer.interface';

import {
  CURSOR_ORDER,
  toCursorPage,
  buildCursorWhere,
} from '@Utilities/cursor-pagination.utility';

import { Injectable } from '@nestjs/common';
import { Customer } from './entities/customer.entity';
import { User } from '@Modules/user/entities/user.entity';
import { Op, Transaction, WhereOptions } from 'sequelize';
import { ICursorPage, ICursorBatch } from '@Interfaces/cursor-page.interface';
import { toContainsPattern, whereWhenPresent } from '@Utilities/query.utility';
import { isPrioritySyncStatus } from './utilities/priority-sync-status.utility';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';

@Injectable()
export class CustomerRepository {
  findById(id: string): Promise<Customer | null> {
    return Customer.findByPk(id, {
      include: [{ model: User, paranoid: false }, { model: CustomerContact }],
    });
  }

  findByTaxId(
    taxId: string,
    transaction?: Transaction,
  ): Promise<Customer | null> {
    return Customer.findOne({
      where: { taxId },
      transaction,
      lock: transaction != null,
    });
  }

  async findByFilter(
    filter: ICustomerFilter,
    batch: ICursorBatch,
  ): Promise<ICursorPage<Customer>> {
    const rows = await Customer.findAll({
      include: [
        {
          model: CustomerContact,
          separate: true,
          order: [
            ['createdAt', 'ASC'],
            ['id', 'ASC'],
          ],
        },
      ],
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

  async countBySyncStatus(): Promise<ICustomerSyncStatusCount[]> {
    const groupedCounts = await Customer.count({
      group: ['prioritySyncStatus'],
    });

    return groupedCounts.flatMap(({ prioritySyncStatus, count }) =>
      isPrioritySyncStatus(prioritySyncStatus)
        ? [{ prioritySyncStatus, count }]
        : [],
    );
  }

  create(
    attributes: TCustomerCreationAttributes,
    transaction?: Transaction,
  ): Promise<Customer> {
    return Customer.create(attributes, { transaction });
  }

  async update(
    id: string,
    attributes: TCustomerUpdateAttributes,
    transaction?: Transaction,
  ): Promise<boolean> {
    const [updatedCount] = await Customer.update(attributes, {
      where: { id },
      transaction,
    });

    return updatedCount > 0;
  }

  async softDelete(id: string, transaction?: Transaction): Promise<boolean> {
    const deletedCount = await Customer.destroy({ where: { id }, transaction });

    return deletedCount > 0;
  }

  private buildFilterWhere(filter: ICustomerFilter): WhereOptions<Customer>[] {
    return [
      ...whereWhenPresent(filter.prioritySyncStatus, (prioritySyncStatus) => ({
        prioritySyncStatus,
      })),
      ...whereWhenPresent(filter.search, (search) =>
        this.buildSearchWhere(search),
      ),
    ];
  }

  private buildSearchWhere(search: string): WhereOptions<Customer> {
    const pattern = toContainsPattern(search);

    return {
      [Op.or]: [
        { name: { [Op.iLike]: pattern } },
        { taxId: { [Op.iLike]: pattern } },
        { contactName: { [Op.iLike]: pattern } },
        { phone: { [Op.iLike]: pattern } },
        { email: { [Op.iLike]: pattern } },
        { priorityId: { [Op.iLike]: pattern } },
      ],
    };
  }
}
