import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

import {
  ICustomerContact,
  ICustomerContactImport,
} from './interfaces/customer-contact.interface';

import { Transaction } from 'sequelize';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CustomerContactRepository } from './customer-contact.repository';
import { CreateCustomerContactDto } from './dto/create-customer-contact.dto';
import { UpdateCustomerContactDto } from './dto/update-customer-contact.dto';
import { normalizeCustomerContactValues } from './utilities/customer-contact-values.utility';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

@Injectable()
export class CustomerContactService {
  constructor(
    private readonly repository: CustomerContactRepository,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  async list(customerId: string): Promise<ICustomerContact[]> {
    const exists = await this.repository.customerExists(customerId);
    if (!exists) {
      throw new NotFoundException('הלקוח לא נמצא');
    }

    return this.repository.list(customerId);
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
      throw new BadRequestException('פרטי איש הקשר אינם תקינים');
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
        throw new NotFoundException('איש הקשר לא נמצא אצל הלקוח');
      }

      const values = normalizeCustomerContactValues({
        ...contact.get(),
        ...changes,
      });
      const errors = await validate(
        plainToInstance(CreateCustomerContactDto, values),
      );
      if (errors.length > 0) {
        throw new BadRequestException('פרטי איש הקשר אינם תקינים');
      }

      const duplicate = await this.repository.findExact(
        customerId,
        values,
        transaction,
      );
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('איש קשר עם פרטים אלה כבר קיים אצל הלקוח');
      }

      await this.repository.update(customerId, id, values, transaction);
      const updated = await this.repository.findById(
        customerId,
        id,
        transaction,
      );
      if (!updated) {
        throw new NotFoundException('איש הקשר לא נמצא אצל הלקוח');
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
      throw new NotFoundException('הלקוח לא נמצא');
    }
  }
}
