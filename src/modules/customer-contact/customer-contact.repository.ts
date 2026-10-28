import {
  ICustomerContactValues,
  TCustomerContactCreation,
} from './interfaces/customer-contact.interface';

import { Injectable } from '@nestjs/common';
import { Op, fn, col, where, Transaction } from 'sequelize';
import { CustomerContact } from './entities/customer-contact.entity';
import { Customer } from '@Modules/customer/entities/customer.entity';

@Injectable()
export class CustomerContactRepository {
  async customerExists(customerId: string): Promise<boolean> {
    const customer = await Customer.findByPk(customerId);
    return customer !== null;
  }

  list(customerId: string): Promise<CustomerContact[]> {
    return CustomerContact.findAll({
      where: { customerId },
      order: [
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ],
    });
  }

  findById(
    customerId: string,
    id: string,
    transaction?: Transaction,
  ): Promise<CustomerContact | null> {
    return CustomerContact.findOne({ where: { id, customerId }, transaction });
  }

  findExact(
    customerId: string,
    values: ICustomerContactValues,
    transaction: Transaction,
  ): Promise<CustomerContact | null> {
    return CustomerContact.findOne({
      where: {
        customerId,
        name: values.name,
        [Op.and]: [
          where(fn('coalesce', col('phone'), ''), values.phone ?? ''),
          where(fn('coalesce', col('email'), ''), values.email ?? ''),
          where(fn('coalesce', col('role'), ''), values.role ?? ''),
        ],
      },
      transaction,
    });
  }

  async lockCustomer(
    customerId: string,
    transaction: Transaction,
  ): Promise<boolean> {
    const customer = await Customer.findByPk(customerId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    return customer !== null;
  }

  create(
    attributes: TCustomerContactCreation,
    transaction?: Transaction,
  ): Promise<CustomerContact> {
    return CustomerContact.create(attributes, { transaction });
  }

  async update(
    customerId: string,
    id: string,
    values: ICustomerContactValues,
    transaction?: Transaction,
  ): Promise<void> {
    await CustomerContact.update(values, {
      where: { id, customerId },
      transaction,
    });
  }
}
