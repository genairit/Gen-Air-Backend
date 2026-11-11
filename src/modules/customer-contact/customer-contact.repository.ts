import {
  ICustomerContactValues,
  TCustomerContactCreation,
} from './interfaces/customer-contact.interface';

import { Injectable } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { toDialablePhone } from '@Utilities/phone.utility';
import { CustomerContact } from './entities/customer-contact.entity';

@Injectable()
export class CustomerContactRepository {
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

  create(
    attributes: TCustomerContactCreation,
    transaction?: Transaction,
  ): Promise<CustomerContact> {
    return CustomerContact.create(attributes, { transaction });
  }
}
