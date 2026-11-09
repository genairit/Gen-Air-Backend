import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

import {
  ICustomerContact,
  ICustomerContactImport,
  ICustomerContactValues,
} from './interfaces/customer-contact.interface';

import { Transaction } from 'sequelize';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { toDialablePhone } from '@Utilities/phone.utility';
import { CustomerContact } from './entities/customer-contact.entity';
import { Customer } from '@Modules/customer/entities/customer.entity';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { CustomerContactRepository } from './customer-contact.repository';
import { getHttpErrorPayload } from '@Utilities/http-error-payload.utility';
import { CreateCustomerContactDto } from './dto/create-customer-contact.dto';
import { UpdateCustomerContactDto } from './dto/update-customer-contact.dto';
import { normalizeCustomerContactValues } from './utilities/customer-contact-values.utility';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { ProjectContactLink } from '@Modules/project-contact/entities/project-contact-link.entity';

@Injectable()
export class CustomerContactService {
  constructor(
    private readonly repository: CustomerContactRepository,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  async list(customerId: string): Promise<ICustomerContact[]> {
    const exists = await this.repository.customerExists(customerId);
    if (!exists) {
      throw new NotFoundException(
        getHttpErrorPayload(HTTP_ERROR_CODES.CUSTOMER_NOT_FOUND),
      );
    }

    return this.repository.list(customerId);
  }

  async listForProject(
    customerId: string,
    projectId: string,
    parentProjectId: string | null,
  ): Promise<ICustomerContact[]> {
    const [legacyContacts, links] = await Promise.all([
      this.list(customerId),
      ProjectContactLink.findAll({
        where: {
          projectId: parentProjectId ? [projectId, parentProjectId] : projectId,
        },
        include: [CustomerContact],
      }),
    ]);
    const contacts = [
      ...legacyContacts,
      ...links.flatMap((link) => (link.contact ? [link.contact] : [])),
    ];
    return [
      ...new Map(contacts.map((contact) => [contact.id, contact])).values(),
    ];
  }

  searchDirectory(search: string): Promise<ICustomerContact[]> {
    return this.repository.search(search.trim());
  }

  createDirectory(
    input: CreateCustomerContactDto,
    createdById: string,
  ): Promise<ICustomerContact> {
    return this.repository.create({
      ...normalizeCustomerContactValues(input),
      customerId: null,
      createdById,
    });
  }

  async resolveDirectoryForImport(
    input: ICustomerContactValues & { createdById: string },
    transaction: Transaction,
  ): Promise<ICustomerContact> {
    const values = normalizeCustomerContactValues(input);
    const errors = await validate(
      plainToInstance(CreateCustomerContactDto, values),
    );
    if (errors.length > 0) {
      throw new BadRequestException(
        getHttpErrorPayload(HTTP_ERROR_CODES.INVALID_CUSTOMER_CONTACT),
      );
    }

    if (values.phone || values.email) {
      await this.transactions.lockKey(
        `contact-directory:${values.name}:${values.phone ? toDialablePhone(values.phone) : ''}:${values.email?.toLowerCase() ?? ''}`,
        transaction,
      );
      const existing = await this.repository.findExactDirectory(
        values,
        transaction,
      );
      if (existing) {
        return existing;
      }
    }

    return this.repository.create(
      { ...values, customerId: null, createdById: input.createdById },
      transaction,
    );
  }

  async linkDirectoryContactToProject(
    projectId: string,
    contactId: string,
    transaction: Transaction,
  ): Promise<void> {
    await ProjectContactLink.create(
      { projectId, contactId, role: null, isPrimary: false },
      { transaction },
    );
  }

  async updateDirectory(
    id: string,
    changes: UpdateCustomerContactDto,
  ): Promise<ICustomerContact> {
    return this.transactions.run(async (transaction) => {
      const existing = await CustomerContact.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!existing) {
        throw new NotFoundException(
          getHttpErrorPayload(HTTP_ERROR_CODES.CUSTOMER_CONTACT_NOT_FOUND),
        );
      }

      const values = normalizeCustomerContactValues({
        ...existing.get(),
        ...changes,
      });
      const errors = await validate(
        plainToInstance(CreateCustomerContactDto, values),
      );
      if (errors.length > 0) {
        throw new BadRequestException(
          getHttpErrorPayload(HTTP_ERROR_CODES.INVALID_CUSTOMER_CONTACT),
        );
      }

      await existing.update(values, { transaction });
      await Customer.update(
        { contactName: values.name, phone: values.phone, email: values.email },
        { where: { primaryContactId: id }, transaction },
      );
      return existing;
    });
  }

  create(
    customerId: string,
    input: CreateCustomerContactDto,
    createdById: string,
  ): Promise<ICustomerContact> {
    return this.transactions.run((transaction) =>
      this.resolveForImport(
        { customerId, createdById, ...normalizeCustomerContactValues(input) },
        transaction,
      ),
    );
  }

  async resolveForImport(
    input: ICustomerContactImport,
    transaction: Transaction,
  ): Promise<ICustomerContact> {
    const values = normalizeCustomerContactValues(input);
    const errors = await validate(
      plainToInstance(CreateCustomerContactDto, values),
    );
    if (errors.length > 0) {
      throw new BadRequestException(
        getHttpErrorPayload(HTTP_ERROR_CODES.INVALID_CUSTOMER_CONTACT),
      );
    }

    await this.assertLockedCustomer(input.customerId, transaction);
    const existing = await this.repository.findExact(
      input.customerId,
      values,
      transaction,
    );
    if (existing) {
      return existing;
    }

    return this.repository.create(
      {
        ...values,
        customerId: input.customerId,
        createdById: input.createdById,
      },
      transaction,
    );
  }

  async update(
    customerId: string,
    id: string,
    changes: UpdateCustomerContactDto,
  ): Promise<ICustomerContact> {
    return this.transactions.run(async (transaction) => {
      await this.assertLockedCustomer(customerId, transaction);
      const contact = await this.repository.findById(
        customerId,
        id,
        transaction,
      );
      if (!contact) {
        throw new NotFoundException(
          getHttpErrorPayload(HTTP_ERROR_CODES.CUSTOMER_CONTACT_NOT_FOUND),
        );
      }

      const values = normalizeCustomerContactValues({
        ...contact.get(),
        ...changes,
      });
      const errors = await validate(
        plainToInstance(CreateCustomerContactDto, values),
      );
      if (errors.length > 0) {
        throw new BadRequestException(
          getHttpErrorPayload(HTTP_ERROR_CODES.INVALID_CUSTOMER_CONTACT),
        );
      }

      const duplicate = await this.repository.findExact(
        customerId,
        values,
        transaction,
      );
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(
          getHttpErrorPayload(HTTP_ERROR_CODES.DUPLICATE_CUSTOMER_CONTACT),
        );
      }

      await this.repository.update(customerId, id, values, transaction);
      await this.repository.syncPrimarySnapshot(id, values, transaction);
      const updated = await this.repository.findById(
        customerId,
        id,
        transaction,
      );
      if (!updated) {
        throw new NotFoundException(
          getHttpErrorPayload(HTTP_ERROR_CODES.CUSTOMER_CONTACT_NOT_FOUND),
        );
      }

      return updated;
    });
  }

  private async assertLockedCustomer(
    customerId: string,
    transaction: Transaction,
  ): Promise<void> {
    const found = await this.repository.lockCustomer(customerId, transaction);
    if (!found) {
      throw new NotFoundException(
        getHttpErrorPayload(HTTP_ERROR_CODES.CUSTOMER_NOT_FOUND),
      );
    }
  }
}
