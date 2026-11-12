import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import {
  ICustomerContact,
  ICustomerContactValues,
} from './interfaces/customer-contact.interface';

import { Transaction } from 'sequelize';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { toDialablePhone } from '@Utilities/phone.utility';
import { CustomerContact } from './entities/customer-contact.entity';
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

  async listForProject(
    projectId: string,
    parentProjectId: string | null,
  ): Promise<ICustomerContact[]> {
    const links = await ProjectContactLink.findAll({
      where: {
        projectId: parentProjectId ? [projectId, parentProjectId] : projectId,
      },
      include: [CustomerContact],
    });
    const contacts = links.flatMap((link) =>
      link.contact ? [link.contact] : [],
    );
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
      return existing;
    });
  }
}
