import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import {
  ICustomer,
  TCustomerSyncStatusCounts,
} from './interfaces/customer.interface';

import { Transaction } from 'sequelize';
import { TypedLogger } from '@Logger/logger.service';
import { Customer } from './entities/customer.entity';
import { CustomerRepository } from './customer.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { toCursorBatch } from '@Utilities/cursor-batch.utility';
import { GetCustomersByFilterDto } from './dto/get-by-filter.dto';
import { isCustomerTaxIdConflict } from './utilities/customer-tax-id.utility';
import { CustomerContactService } from '@Modules/customer-contact/customer-contact.service';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { EMPTY_CUSTOMER_SYNC_STATUS_COUNTS } from './constants/priority-sync-status.constant';

@Injectable()
export class CustomerService {
  private readonly logger = new TypedLogger(CustomerService.name);
  constructor(
    private readonly customerRepository: CustomerRepository,
    private readonly contacts: CustomerContactService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  async getById(id: string): Promise<ICustomer> {
    const customer = await this.customerRepository.findById(id);

    if (!customer) {
      throw new NotFoundException(`Customer ${id} was not found`);
    }

    return customer;
  }

  findById(id: string): Promise<ICustomer | null> {
    return this.customerRepository.findById(id);
  }

  findByTaxId(
    taxId: string,
    transaction?: Transaction,
  ): Promise<ICustomer | null> {
    return this.customerRepository.findByTaxId(taxId, transaction);
  }

  async createForImport(
    customer: CreateCustomerDto,
    createdById: string,
    transaction: Transaction,
  ): Promise<ICustomer> {
    const { name, taxId, phone, email, address, contactName, customerType } =
      customer;
    if (!contactName && (phone || email)) {
      throw new BadRequestException(
        'Contact name is required when contact details are provided',
      );
    }
    const created = await this.customerRepository.create(
      {
        paymentTerms: customer.paymentTerms ?? null,
        name,
        taxId,
        phone: null,
        email: null,
        address,
        contactName: null,
        customerType,
        createdById,
      },
      transaction,
    );
    if (contactName) {
      const contact = await this.contacts.resolveDirectoryForImport(
        {
          createdById,
          name: contactName,
          phone: phone ?? null,
          email: email ?? null,
          role: null,
        },
        transaction,
      );
      await this.customerRepository.update(
        created.id,
        { primaryContactId: contact.id },
        transaction,
      );
      created.primaryContactId = contact.id;
    }
    return created;
  }

  getByFilter(
    filter: GetCustomersByFilterDto,
  ): Promise<ICursorPage<ICustomer>> {
    return this.customerRepository.findByFilter(
      {
        search: filter.search ?? null,
        prioritySyncStatus: filter.prioritySyncStatus ?? null,
      },
      toCursorBatch(filter),
    );
  }

  async getSyncStatusCounts(): Promise<TCustomerSyncStatusCounts> {
    const statusCounts = await this.customerRepository.countBySyncStatus();

    return statusCounts.reduce<TCustomerSyncStatusCounts>(
      (counts, { prioritySyncStatus, count }) => ({
        ...counts,
        [prioritySyncStatus]: count,
      }),
      EMPTY_CUSTOMER_SYNC_STATUS_COUNTS,
    );
  }

  async create(
    customer: CreateCustomerDto,
    createdById: string,
  ): Promise<ICustomer> {
    if (
      customer.primaryContactId &&
      (customer.contactName || customer.phone || customer.email)
    ) {
      throw new BadRequestException(
        'Choose an existing contact or enter a new contact',
      );
    }

    await this.assertTaxIdAvailable(customer.taxId);
    try {
      const createdId = await this.transactions.run(async (transaction) => {
        const created = await this.createForImport(
          customer,
          createdById,
          transaction,
        );
        if (customer.primaryContactId) {
          const contact = await CustomerContact.findByPk(
            customer.primaryContactId,
            { transaction },
          );
          if (!contact) {
            throw new NotFoundException(
              `Contact ${customer.primaryContactId} was not found`,
            );
          }

          await this.customerRepository.update(
            created.id,
            {
              primaryContactId: contact.id,
            },
            transaction,
          );
        }

        return created.id;
      });
      return this.getById(createdId);
    } catch (error) {
      if (isCustomerTaxIdConflict(error)) {
        this.logger.warn({ message: 'Duplicate customer tax ID rejected' });
        throw new ConflictException('לקוח עם מספר מזהה זה כבר קיים');
      }

      this.logger.error({ error, message: 'Failed to create CRM customer' });
      throw error;
    }
  }

  async update(id: string, changes: UpdateCustomerDto): Promise<ICustomer> {
    if (
      Object.hasOwn(changes, 'contactName') ||
      Object.hasOwn(changes, 'phone') ||
      Object.hasOwn(changes, 'email')
    ) {
      throw new BadRequestException(
        'Change customer contacts through the contact directory',
      );
    }
    const customer = await this.getById(id);
    const requestedTaxId = changes.taxId ?? null;
    const isTaxIdChanging =
      requestedTaxId !== null && requestedTaxId !== customer.taxId;

    if (isTaxIdChanging) {
      await this.assertTaxIdAvailable(requestedTaxId);
    }

    await this.customerRepository.update(id, changes);

    return this.getById(id);
  }

  async setPrimaryContact(
    id: string,
    contactId: string | null,
  ): Promise<ICustomer> {
    await this.transactions.run(async (transaction) => {
      const customer = await Customer.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!customer) {
        throw new NotFoundException(`Customer ${id} was not found`);
      }

      const contact = contactId
        ? await CustomerContact.findByPk(contactId, { transaction })
        : null;
      if (contactId && !contact) {
        throw new NotFoundException(`Contact ${contactId} was not found`);
      }

      await this.customerRepository.update(
        id,
        {
          primaryContactId: contact?.id ?? null,
        },
        transaction,
      );
    });
    return this.getById(id);
  }

  async delete(id: string): Promise<void> {
    const isDeleted = await this.customerRepository.softDelete(id);

    if (!isDeleted) {
      throw new NotFoundException(`Customer ${id} was not found`);
    }
  }

  private async assertTaxIdAvailable(taxId: string): Promise<void> {
    const existingCustomer = await this.customerRepository.findByTaxId(taxId);

    if (existingCustomer) {
      throw new ConflictException('לקוח עם מספר מזהה זה כבר קיים');
    }
  }
}
