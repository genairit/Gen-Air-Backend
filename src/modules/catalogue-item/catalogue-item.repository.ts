import {
  CatalogueQueryDto,
  CatalogueUpdateDto,
} from './dto/catalogue-query.dto';

import {
  CURSOR_ORDER,
  toCursorPage,
  buildCursorWhere,
} from '@Utilities/cursor-pagination.utility';

import {
  SYSTEM_TYPE,
  CATALOGUE_STATUS,
  CATALOGUE_PREFERENCE,
} from '@Modules/quotation/constants/quotation.constant';

import { Injectable } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { toContainsPattern } from '@Utilities/query.utility';
import { CatalogueItem } from './entities/catalogue-item.entity';
import type { ICursorPage } from '@Interfaces/cursor-page.interface';
import type { GetCatalogueMaintenanceDto } from './dto/get-catalogue-maintenance.dto';

@Injectable()
export class CatalogueItemRepository {
  findById(
    id: string,
    transaction?: Transaction,
  ): Promise<CatalogueItem | null> {
    return CatalogueItem.findByPk(id, {
      transaction,
      lock: transaction?.LOCK.SHARE,
    });
  }
  findForUpdate(
    id: string,
    transaction: Transaction,
  ): Promise<CatalogueItem | null> {
    return CatalogueItem.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }
  findByIds(ids: string[], transaction: Transaction): Promise<CatalogueItem[]> {
    return CatalogueItem.findAll({
      where: { id: { [Op.in]: [...new Set(ids)] } },
      transaction,
      lock: transaction.LOCK.SHARE,
    });
  }
  async search(
    query: CatalogueQueryDto,
    userId: string,
  ): Promise<CatalogueItem[]> {
    const database = CatalogueItem.sequelize;
    if (!database) {
      throw new Error('Catalogue database unavailable');
    }
    const terms = (query.search ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(toContainsPattern);
    return database.query(
      `SELECT c.* FROM catalogue_items c LEFT JOIN catalogue_item_usage u ON u.catalogue_item_id=c.id AND u.user_id=$userId AND u.deleted_at IS NULL WHERE c.deleted_at IS NULL AND c.status=$active AND ($brand::text IS NULL OR c.brand IN ($brand,'')) AND ($role::text IS NULL OR c.equipment_role=$role) AND ($types::jsonb IS NULL OR c.equipment_types @> $types::jsonb) AND ($system::text IS NULL OR $system=$general OR c.system_type IS NULL OR c.system_type=$system) AND ($capacity::integer IS NULL OR c.capacity_btu>0) AND NOT EXISTS(SELECT 1 FROM unnest($terms::text[]) AS term WHERE concat_ws(' ',c.sku,c.description) NOT ILIKE term) ORDER BY CASE WHEN $capacity::integer IS NULL THEN 0 ELSE abs(c.capacity_btu-$capacity::integer) END,COALESCE(u.selection_count,0) DESC,(c.preference=$used) DESC,c.sku,c.id LIMIT $limit`,
      {
        model: CatalogueItem,
        mapToModel: true,
        bind: {
          userId,
          active: CATALOGUE_STATUS.ACTIVE,
          brand: query.brand ?? null,
          role: query.equipmentRole ?? null,
          types: query.equipmentType
            ? JSON.stringify([query.equipmentType])
            : null,
          system: query.systemType ?? null,
          general: SYSTEM_TYPE.GENERAL,
          capacity: query.capacityBtu ?? null,
          terms,
          used: CATALOGUE_PREFERENCE.USED,
          limit: query.limit ?? 20,
        },
      },
    );
  }
  async listForMaintenance(
    query: GetCatalogueMaintenanceDto,
  ): Promise<ICursorPage<CatalogueItem>> {
    const rows = await CatalogueItem.findAll({
      where: {
        [Op.and]: [
          ...buildCursorWhere(query.batchCursor),
          ...(query.search
            ? [{ sku: { [Op.iLike]: toContainsPattern(query.search) } }]
            : []),
        ],
      },
      order: CURSOR_ORDER,
      limit: (query.batchSize ?? 20) + 1,
    });
    return toCursorPage(rows, query.batchSize ?? 20);
  }
  async update(
    id: string,
    changes: CatalogueUpdateDto,
    transaction: Transaction,
  ): Promise<void> {
    await CatalogueItem.update(changes, { where: { id }, transaction });
  }
  async hasActiveSku(
    sku: string,
    id: string,
    transaction: Transaction,
  ): Promise<boolean> {
    return (
      (await CatalogueItem.count({
        where: { sku, status: CATALOGUE_STATUS.ACTIVE, id: { [Op.ne]: id } },
        transaction,
      })) > 0
    );
  }
}
