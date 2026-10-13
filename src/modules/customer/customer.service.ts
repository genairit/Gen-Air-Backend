import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import {
  ICustomer,
  TCustomerSyncStatusCounts,
} from './interfaces/customer.interface';

import { CustomerRepository } from './customer.repository';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { toCursorBatch } from '@Utilities/cursor-batch.utility';
import { GetCustomersByFilterDto } from './dto/get-by-filter.dto';
import { EMPTY_CUSTOMER_SYNC_STATUS_COUNTS } from './constants/priority-sync-status.constant';

@Injectable()
export class CustomerService {
  constructor(private readonly customerRepository: CustomerRepository) {}

  async getById(id: string): Promise<ICustomer> {
    const customer = await this.customerRepository.findById(id);

    if (!customer) {
      throw new NotFoundException(`Customer ${id} was not found`);
    }

    return customer;
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
      throw new ConflictException(
        `The tax id ${taxId} already belongs to customer ${existingCustomer.name}`,
      );
    }
  }
}
