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

import { Inject, Injectable } from '@nestjs/common';
import { Customer } from './entities/customer.entity';
import { User } from '@Modules/user/entities/user.entity';
import { ProviderNames } from '@Providers/database/provider-names';
import { Op, literal, Sequelize, Transaction, WhereOptions } from 'sequelize';
import { ICursorPage, ICursorBatch } from '@Interfaces/cursor-page.interface';
import { toContainsPattern, whereWhenPresent } from '@Utilities/query.utility';
import { isPrioritySyncStatus } from './utilities/priority-sync-status.utility';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';

@Injectable()
export class CustomerRepository {
  constructor(
    @Inject(ProviderNames.SEQUELIZE) private readonly sequelize: Sequelize,
  ) {}

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
      bind: { customerContactSearch: toContainsPattern(filter.search ?? '') },
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
        this.buildContactSearchWhere(),
        { priorityId: { [Op.iLike]: pattern } },
      ],
    };
  }

  private buildContactSearchWhere() {
    const queryInterface = this.sequelize.getQueryInterface();
    const contactTable = CustomerContact.getTableName();
    const identifiers =
      typeof contactTable === 'string'
        ? [contactTable]
        : [contactTable.schema, contactTable.tableName];
    const table = identifiers
      .map((identifier) => queryInterface.quoteIdentifier(identifier))
      .join('.');
    return literal(`EXISTS (
      SELECT 1 FROM ${table} AS "searchContact"
      WHERE "searchContact"."customer_id" = "Customer"."id"
        AND "searchContact"."deleted_at" IS NULL
        AND (
          "searchContact"."name" ILIKE $customerContactSearch
          OR "searchContact"."phone" ILIKE $customerContactSearch
          OR "searchContact"."email" ILIKE $customerContactSearch
        )
    )`);
  }
}
