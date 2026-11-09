import {
  ICustomerContactValues,
  TCustomerContactCreation,
} from './interfaces/customer-contact.interface';

import { Injectable } from '@nestjs/common';
import { toDialablePhone } from '@Utilities/phone.utility';
import { Op, fn, col, where, Transaction } from 'sequelize';
import { CustomerContact } from './entities/customer-contact.entity';
import { Customer } from '@Modules/customer/entities/customer.entity';

@Injectable()
export class CustomerContactRepository {
  async customerExists(customerId: string): Promise<boolean> {
    const customer = await Customer.findByPk(customerId);
    return customer !== null;
  }

  search(search: string): Promise<CustomerContact[]> {
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    return CustomerContact.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: pattern } },
          { phone: { [Op.iLike]: pattern } },
          { email: { [Op.iLike]: pattern } },
        ],
      },
      order: [
        ['name', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: 50,
    });
  }

  findDirectoryContact(
    id: string,
    transaction?: Transaction,
  ): Promise<CustomerContact | null> {
    return CustomerContact.findByPk(id, { transaction });
  }

  async updateDirectoryContact(
    id: string,
    values: ICustomerContactValues,
  ): Promise<void> {
    await CustomerContact.update(values, { where: { id } });
  }

  async syncPrimarySnapshot(
    id: string,
    values: ICustomerContactValues,
    transaction: Transaction,
  ): Promise<void> {
    await Customer.update(
      { contactName: values.name, phone: values.phone, email: values.email },
      { where: { primaryContactId: id }, transaction },
    );
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

  async findExactDirectory(
    values: ICustomerContactValues,
    transaction: Transaction,
  ): Promise<CustomerContact | null> {
    const candidates = await CustomerContact.findAll({
      where: { name: values.name },
      transaction,
      order: [
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    const phone = values.phone ? toDialablePhone(values.phone) : null;
    const email = values.email?.toLowerCase() ?? null;
    return (
      candidates.find((contact) => {
        const candidatePhone = contact.phone
          ? toDialablePhone(contact.phone)
          : null;
        const candidateEmail = contact.email?.toLowerCase() ?? null;
        return candidatePhone === phone && candidateEmail === email;
      }) ?? null
    );
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
