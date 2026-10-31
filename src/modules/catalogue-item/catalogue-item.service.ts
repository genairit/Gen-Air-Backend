import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import {
  CatalogueQueryDto,
  CatalogueUpdateDto,
} from './dto/catalogue-query.dto';

import { Transaction } from 'sequelize';
import type { CatalogueItem } from './entities/catalogue-item.entity';
import { CatalogueItemRepository } from './catalogue-item.repository';
import { CATALOGUE_STATUS } from '@Modules/quotation/constants/quotation.constant';
import type { GetCatalogueMaintenanceDto } from './dto/get-catalogue-maintenance.dto';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

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
  search(query: CatalogueQueryDto, userId: string): Promise<CatalogueItem[]> {
    return this.repository.search(query, userId);
  }
  listForMaintenance(
    query: GetCatalogueMaintenanceDto,
  ): ReturnType<CatalogueItemRepository['listForMaintenance']> {
    return this.repository.listForMaintenance(query);
  }
  async update(
    id: string,
    changes: CatalogueUpdateDto,
  ): Promise<CatalogueItem> {
    const existing = await this.getById(id);
    await this.transactions.run(async (transaction) => {
      const item = existing;
      await this.transactions.lockKey(`catalogue:${item.sku}`, transaction);
      await this.repository.findForUpdate(id, transaction);
      if (
        changes.status === CATALOGUE_STATUS.ACTIVE &&
        (await this.repository.hasActiveSku(item.sku, id, transaction))
      ) {
        throw new ConflictException(
          'מק״ט זה כבר פעיל; יש להכריע במפורש בין הכפילויות',
        );
      }
      await this.repository.update(id, changes, transaction);
    });
    return this.getById(id);
  }
}
