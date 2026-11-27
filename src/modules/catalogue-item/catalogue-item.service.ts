import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import {
  CatalogueQueryDto,
  CatalogueUpdateDto,
} from './dto/catalogue-query.dto';

import {
  EQUIPMENT_ROLE,
  CATALOGUE_STATUS,
  CATALOGUE_PREFERENCE,
} from '@Modules/quotation/constants/quotation.constant';

import { Transaction } from 'sequelize';
import { randomUUID } from 'node:crypto';
import type { CatalogueCreateDto } from './dto/catalogue-create.dto';
import type { CatalogueItem } from './entities/catalogue-item.entity';
import { CatalogueItemRepository } from './catalogue-item.repository';
import type { GetCatalogueMaintenanceDto } from './dto/get-catalogue-maintenance.dto';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const catalogueSkuLockKey = (sku: string): string => `catalogue:${sku}`;

@Injectable()
export class CatalogueItemService {
  constructor(
    private readonly repository: CatalogueItemRepository,
    private readonly transactions: DatabaseTransactionService,
  ) {}
  async getById(id: string, transaction?: Transaction): Promise<CatalogueItem> {
    const item = await this.repository.findById(id, transaction);
    if (!item) {
      throw new NotFoundException('פריט קטלוג לא נמצא');
    }
    return item;
  }
  getByIds(ids: string[], transaction: Transaction): Promise<CatalogueItem[]> {
    return this.repository.findByIds(ids, transaction);
  }
  getActiveBySkus(
    skus: string[],
    transaction: Transaction,
  ): Promise<CatalogueItem[]> {
    return this.repository.findActiveBySkus(skus, transaction);
  }
  search(query: CatalogueQueryDto, userId: string): Promise<CatalogueItem[]> {
    return this.repository.search(query, userId);
  }
  recommended(
    query: CatalogueQueryDto,
    userId: string,
    transaction: Transaction,
  ): Promise<CatalogueItem[]> {
    return this.repository.recommended(query, userId, transaction);
  }
  listForMaintenance(
    query: GetCatalogueMaintenanceDto,
  ): ReturnType<CatalogueItemRepository['listForMaintenance']> {
    return this.repository.listForMaintenance(query);
  }
  listDirectory(
    query: GetCatalogueMaintenanceDto,
  ): ReturnType<CatalogueItemRepository['listForMaintenance']> {
    return this.repository.listForMaintenance(query, true);
  }
  create(input: CatalogueCreateDto): Promise<CatalogueItem> {
    return this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(
        catalogueSkuLockKey(input.sku),
        transaction,
      );
      await this.assertAvailableSku(input.sku, null, transaction);
      return this.repository.create(
        {
          id: randomUUID(),
          sku: input.sku,
          unit: input.unit.trim(),
          price: input.price,
          brand: input.brand?.trim() ?? '',
          systemType: input.systemType ?? null,
          description: input.description.trim(),
          status: CATALOGUE_STATUS.ACTIVE,
          capacityBtu: input.capacityBtu ?? null,
          equipmentRole: input.equipmentRole ?? EQUIPMENT_ROLE.OTHER,
          equipmentTypes: input.equipmentTypes ?? [],
          includesRemote: input.includesRemote ?? false,
          includesThermostat: input.includesThermostat ?? false,
          preference: input.preference ?? CATALOGUE_PREFERENCE.NEUTRAL,
        },
        transaction,
      );
    });
  }
  private async assertAvailableSku(
    sku: string,
    id: string | null,
    transaction: Transaction,
  ): Promise<void> {
    if (await this.repository.hasActiveSku(sku, id, transaction)) {
      throw new ConflictException('מק״ט זה כבר פעיל בקטלוג');
    }
  }
  async update(
    id: string,
    changes: CatalogueUpdateDto,
  ): Promise<CatalogueItem> {
    const existing = await this.getById(id);
    await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(
        catalogueSkuLockKey(existing.sku),
        transaction,
      );
      const item = await this.repository.findForUpdate(id, transaction);
      if (!item) {
        throw new NotFoundException('פריט קטלוג לא נמצא');
      }
      if (changes.status === CATALOGUE_STATUS.ACTIVE) {
        await this.assertAvailableSku(item.sku, id, transaction);
      }
      await this.repository.update(id, changes, transaction);
    });
    return this.getById(id);
  }
}
