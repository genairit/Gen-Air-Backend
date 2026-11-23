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
import { CustomerOwnContactService } from './customer-own-contact.service';
import { isCustomerTaxIdConflict } from './utilities/customer-tax-id.utility';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { EMPTY_CUSTOMER_SYNC_STATUS_COUNTS } from './constants/priority-sync-status.constant';

@Injectable()
export class CustomerService {
  private readonly logger = new TypedLogger(CustomerService.name);
  constructor(
    private readonly customerRepository: CustomerRepository,
    private readonly ownContact: CustomerOwnContactService,
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
  ): Promise<Customer> {
    const { name, taxId, phone, email, address, customerType } = customer;
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
    if (customer.primaryContactId) {
      await this.ownContact.copyDetails(
        created,
        customer.primaryContactId,
        transaction,
      );
      return created;
    }

    await this.ownContact.setDetails(
      created,
      { phone: phone ?? null, email: email ?? null },
      transaction,
    );
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
    if ('contactName' in changes) {
      throw new BadRequestException(
        'Customer contact details use the customer name',
      );
    }

    await this.transactions.run(async (transaction) => {
      const customer = await this.lockCustomer(id, transaction);
      const requestedTaxId = changes.taxId ?? null;
      const isTaxIdChanging =
        requestedTaxId !== null && requestedTaxId !== customer.taxId;
      if (isTaxIdChanging) {
        await this.assertTaxIdAvailable(requestedTaxId);
      }

      const attributes = { ...changes };
      delete attributes.phone;
      delete attributes.email;
      delete attributes.contactName;
      await customer.update(attributes, { transaction });
      const hasOwnDetails = 'phone' in changes || 'email' in changes;
      if (hasOwnDetails) {
        await this.ownContact.setDetails(customer, changes, transaction);
        await customer.update(
          { phone: null, email: null, contactName: null },
          { transaction },
        );
      }
    });

    return this.getById(id);
  }

  async setPrimaryContact(
    id: string,
    contactId: string | null,
  ): Promise<ICustomer> {
    await this.transactions.run(async (transaction) => {
      const customer = await this.lockCustomer(id, transaction);
      if (!contactId) {
        await customer.update({ primaryContactId: null }, { transaction });
        return;
      }

      await this.ownContact.copyDetails(customer, contactId, transaction);
    });
    return this.getById(id);
  }

  async delete(id: string): Promise<void> {
    const isDeleted = await this.customerRepository.softDelete(id);

    if (!isDeleted) {
      throw new NotFoundException(`Customer ${id} was not found`);
    }
  }

  private async lockCustomer(
    id: string,
    transaction: Transaction,
  ): Promise<Customer> {
    const customer = await Customer.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${id} was not found`);
    }

    return customer;
  }

  private async assertTaxIdAvailable(taxId: string): Promise<void> {
    const existingCustomer = await this.customerRepository.findByTaxId(taxId);

    if (existingCustomer) {
      throw new ConflictException('לקוח עם מספר מזהה זה כבר קיים');
    }
  }
}
