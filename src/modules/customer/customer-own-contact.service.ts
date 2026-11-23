import { Customer } from './entities/customer.entity';
import { Op, col, fn, where, Transaction } from 'sequelize';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ICustomerOwnContactChanges } from './interfaces/customer-own-contact.interface';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';
import { ProjectContactLink } from '@Modules/project-contact/entities/project-contact-link.entity';
import { ICustomerContactValues } from '@Modules/customer-contact/interfaces/customer-contact.interface';
import { normalizeCustomerContactValues } from '@Modules/customer-contact/utilities/customer-contact-values.utility';

@Injectable()
export class CustomerOwnContactService {
  async setDetails(
    customer: Customer,
    changes: ICustomerOwnContactChanges,
    transaction: Transaction,
  ): Promise<void> {
    const existing = customer.primaryContactId
      ? await CustomerContact.findByPk(customer.primaryContactId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        })
      : null;
    const values = normalizeCustomerContactValues({
      name: customer.name,
      role: null,
      phone:
        'phone' in changes
          ? (changes.phone ?? null)
          : (existing?.phone ?? null),
      email:
        'email' in changes
          ? (changes.email ?? null)
          : (existing?.email ?? null),
    });
    const matching = await this.findSnapshot(customer.id, values, transaction);
    if (matching) {
      await customer.update({ primaryContactId: matching.id }, { transaction });
      return;
    }

    const canUpdateExisting = await this.isExclusiveOwnContact(
      customer,
      existing,
      transaction,
    );
    if (existing && canUpdateExisting) {
      await existing.update(values, { transaction });
      return;
    }

    await this.createSnapshot(customer, values, transaction);
  }

  async copyDetails(
    customer: Customer,
    contactId: string,
    transaction: Transaction,
  ): Promise<void> {
    const source = await CustomerContact.findByPk(contactId, { transaction });
    if (!source) {
      throw new NotFoundException('Contact was not found');
    }

    const values = normalizeCustomerContactValues({
      name: customer.name,
      role: null,
      phone: source.phone,
      email: source.email,
    });
    const matching = await this.findSnapshot(customer.id, values, transaction);
    if (matching) {
      await customer.update({ primaryContactId: matching.id }, { transaction });
      return;
    }

    await this.createSnapshot(customer, values, transaction);
  }

  private findSnapshot(
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
      lock: transaction.LOCK.UPDATE,
    });
  }

  private async createSnapshot(
    customer: Customer,
    values: ICustomerContactValues,
    transaction: Transaction,
  ): Promise<void> {
    const contact = await CustomerContact.create(
      { ...values, customerId: customer.id, createdById: customer.createdById },
      { transaction },
    );
    await customer.update({ primaryContactId: contact.id }, { transaction });
  }

  private async isExclusiveOwnContact(
    customer: Customer,
    contact: CustomerContact | null,
    transaction: Transaction,
  ): Promise<boolean> {
    if (contact?.customerId !== customer.id) {
      return false;
    }

    const [otherCustomerReferences, projectReferences] = await Promise.all([
      Customer.count({
        where: { primaryContactId: contact.id, id: { [Op.ne]: customer.id } },
        transaction,
      }),
      ProjectContactLink.count({
        where: { contactId: contact.id },
        transaction,
      }),
    ]);
    return otherCustomerReferences === 0 && projectReferences === 0;
  }
}
