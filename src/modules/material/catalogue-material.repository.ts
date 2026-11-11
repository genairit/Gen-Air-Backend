import { Injectable } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import type { MaterialLinkDto } from './dto/material.dto';
import { CatalogueItemMaterial } from './entities/catalogue-item-material.entity';
import { CatalogueItemMaterialRevision } from './entities/catalogue-item-material-revision.entity';

@Injectable()
export class CatalogueMaterialRepository {
  async linkedCatalogueItemIds(
    materialId: string,
    transaction: Transaction,
  ): Promise<string[]> {
    const links = await CatalogueItemMaterial.findAll({
      attributes: ['catalogueItemId'],
      where: { materialId },
      transaction,
    });
    return [...new Set(links.map((link) => link.catalogueItemId))].sort();
  }
  listForItems(
    catalogueItemIds: string[],
    transaction?: Transaction,
  ): Promise<CatalogueItemMaterial[]> {
    return CatalogueItemMaterial.findAll({
      where: { catalogueItemId: { [Op.in]: catalogueItemIds } },
      order: [
        ['catalogueItemId', 'ASC'],
        ['displayOrder', 'ASC'],
      ],
      transaction,
    });
  }
  list(
    catalogueItemId: string,
    transaction?: Transaction,
  ): Promise<CatalogueItemMaterial[]> {
    return CatalogueItemMaterial.findAll({
      where: { catalogueItemId },
      order: [['displayOrder', 'ASC']],
      transaction,
    });
  }
  latestRevision(
    catalogueItemId: string,
    transaction?: Transaction,
  ): Promise<CatalogueItemMaterialRevision | null> {
    return CatalogueItemMaterialRevision.findOne({
      where: { catalogueItemId },
      order: [['revision', 'DESC']],
      transaction,
    });
  }
  revision(
    catalogueItemId: string,
    revision: number,
  ): Promise<CatalogueItemMaterialRevision | null> {
    return CatalogueItemMaterialRevision.findOne({
      where: { catalogueItemId, revision },
    });
  }
  async replace(
    catalogueItemId: string,
    lines: MaterialLinkDto[],
    transaction: Transaction,
  ): Promise<void> {
    await CatalogueItemMaterial.destroy({
      where: { catalogueItemId },
      transaction,
    });
    await CatalogueItemMaterial.bulkCreate(
      lines.map((line) => ({
        ...line,
        catalogueItemId,
        notes: line.notes ?? '',
        quantityPerItem: line.quantityPerItem ?? null,
      })),
      { transaction },
    );
  }
  async recordRevision(
    catalogueItemId: string,
    revision: number,
    lines: unknown[],
    createdById: string,
    transaction: Transaction,
  ): Promise<void> {
    await CatalogueItemMaterialRevision.create(
      { catalogueItemId, revision, lines, createdById },
      { transaction },
    );
  }
}
