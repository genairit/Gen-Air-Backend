import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import {
  ICustomer,
  TCustomerSyncStatusCounts,
} from './interfaces/customer.interface';

import { Transaction } from 'sequelize';
import { TypedLogger } from '@Logger/logger.service';
import { CustomerRepository } from './customer.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { toCursorBatch } from '@Utilities/cursor-batch.utility';
import { GetCustomersByFilterDto } from './dto/get-by-filter.dto';
import { isCustomerTaxIdConflict } from './utilities/customer-tax-id.utility';
import { CustomerContactService } from '@Modules/customer-contact/customer-contact.service';
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

  createForImport(
    customer: CreateCustomerDto,
    createdById: string,
    transaction: Transaction,
  ): Promise<ICustomer> {
    const { name, taxId, phone, email, address, contactName, customerType } =
      customer;
    return this.customerRepository.create(
      {
        paymentTerms: customer.paymentTerms ?? null,
        name,
        taxId,
        phone,
        email,
        address,
        contactName,
        customerType,
        createdById,
      },
      transaction,
    );
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
    await this.assertTaxIdAvailable(customer.taxId);
    try {
      const createdId = await this.transactions.run(async (transaction) => {
        const created = await this.createForImport(
          customer,
          createdById,
          transaction,
        );
        await this.contacts.resolveForImport(
          {
            createdById,
            customerId: created.id,
            name: customer.contactName,
            phone: customer.phone,
            email: customer.email,
            role: null,
          },
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
