import { Injectable } from '@nestjs/common';
import { QueryTypes, Transaction } from 'sequelize';
import { CatalogueItemUsage } from './entities/catalogue-item-usage.entity';

@Injectable()
export class CatalogueItemUsageRepository {
  async record(
    userId: string,
    catalogueItemId: string,
    transaction: Transaction,
  ): Promise<void> {
    const database = CatalogueItemUsage.sequelize;
    if (!database) {
      throw new Error('Catalogue usage database unavailable');
    }
    await database.query(
      `INSERT INTO catalogue_item_usage(id,user_id,catalogue_item_id,selection_count,last_selected_at,created_at,updated_at) VALUES(gen_random_uuid(),$userId,$catalogueItemId,1,NOW(),NOW(),NOW()) ON CONFLICT(user_id,catalogue_item_id) DO UPDATE SET selection_count=catalogue_item_usage.selection_count+1,last_selected_at=NOW(),updated_at=NOW()`,
      {
        bind: { userId, catalogueItemId },
        type: QueryTypes.INSERT,
        transaction,
      },
    );
  }
  async counts(userId: string): Promise<Map<string, number>> {
    const rows = await CatalogueItemUsage.findAll({ where: { userId } });
    return new Map(
      rows.map((row) => [row.catalogueItemId, row.selectionCount]),
    );
  }
}
