import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

import type {
  MaterialLinkDto,
  MaterialPreviewDto,
  ReplaceMaterialLinksDto,
} from './dto/material.dto';

import type {
  IMaterialDetails,
  IMaterialBreakdown,
  IMaterialSnapshotLine,
  IMaterialPreviewResponse,
  IMaterialPreviewContribution,
} from './interfaces/material-breakdown.interface';

import Decimal from 'decimal.js';
import { Transaction } from 'sequelize';
import { Material } from './entities/material.entity';
import { MaterialRepository } from './material.repository';
import { CatalogueMaterialRepository } from './catalogue-material.repository';
import { MATERIAL_BASIS, MATERIAL_STATUS } from './constants/material.constant';
import { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { CatalogueItemMaterialRevision } from './entities/catalogue-item-material-revision.entity';

@Injectable()
export class CatalogueMaterialService {
  constructor(
    private readonly materials: MaterialRepository,
    private readonly catalogue: CatalogueItemService,
    private readonly repository: CatalogueMaterialRepository,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  async getCurrent(catalogueItemId: string): Promise<IMaterialBreakdown> {
    return this.transactions.readSnapshot(async (transaction) => {
      await this.catalogue.getById(catalogueItemId, transaction);
      const [links, latest] = await Promise.all([
        this.repository.list(catalogueItemId, transaction),
        this.repository.latestRevision(catalogueItemId, transaction),
      ]);
      const materials = await this.getMaterials(
        links.map((link) => link.materialId),
        transaction,
      );
      return {
        catalogueItemId,
        revision: latest?.revision ?? 0,
        lines: links.map((link) =>
          this.snapshotLine(link, materials.get(link.materialId)!),
        ),
      };
    });
  }
  async getRevision(
    catalogueItemId: string,
    revision: number,
  ): Promise<CatalogueItemMaterialRevision> {
    await this.catalogue.getById(catalogueItemId);
    const snapshot = await this.repository.revision(catalogueItemId, revision);
    if (!snapshot) {
      throw new NotFoundException('גרסת פירוט חומרים לא נמצאה');
    }
    return snapshot;
  }
  preview(values: MaterialPreviewDto): Promise<IMaterialPreviewResponse> {
    const itemIds = values.items.map((item) => item.catalogueItemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException('פריט קטלוג כפול בתצוגת החומרים');
    }
    if (
      values.items.some((item) => !new Decimal(item.quantity).greaterThan(0))
    ) {
      throw new BadRequestException('כמות פריט קטלוג חייבת להיות חיובית');
    }
    return this.transactions.readSnapshot(async (transaction) => {
      const items = await this.catalogue.getByIds(itemIds, transaction);
      if (items.length !== itemIds.length) {
        throw new BadRequestException('פריט קטלוג לא נמצא');
      }
      const links = await this.repository.listForItems(itemIds, transaction);
      const materials = await this.getMaterials(
        links.map((link) => link.materialId),
        transaction,
      );
      const quantities = new Map(
        values.items.map((item) => [item.catalogueItemId, item.quantity]),
      );
      const required = new Map<
        string,
        {
          material: IMaterialDetails;
          quantity: Decimal;
          contributions: { catalogueItemId: string; quantity: string }[];
        }
      >();
      const unresolved: IMaterialPreviewContribution[] = [];
      const included: IMaterialPreviewContribution[] = [];
      for (const link of links) {
        const material = materials.get(link.materialId)!;
        const catalogueQuantity = quantities.get(link.catalogueItemId)!;
        const proposedQuantity =
          link.quantityPerItem === null
            ? null
            : new Decimal(catalogueQuantity).times(link.quantityPerItem);
        const contribution = {
          catalogueItemId: link.catalogueItemId,
          material: this.materialDetails(material),
          basis: link.basis,
          quantity: proposedQuantity?.toFixed(8) ?? null,
          notes: link.notes,
        };
        if (link.basis === MATERIAL_BASIS.INCLUDED) {
          included.push(contribution);
          continue;
        }
        if (
          link.basis !== MATERIAL_BASIS.FIXED ||
          material.status !== MATERIAL_STATUS.ACTIVE
        ) {
          unresolved.push(contribution);
          continue;
        }
        const total = required.get(material.id) ?? {
          material: this.materialDetails(material),
          quantity: new Decimal(0),
          contributions: [],
        };
        total.quantity = total.quantity.plus(proposedQuantity!);
        total.contributions.push({
          catalogueItemId: link.catalogueItemId,
          quantity: proposedQuantity!.toFixed(8),
        });
        required.set(material.id, total);
      }
      return {
        required: [...required.values()].map((row) => ({
          material: row.material,
          quantity: row.quantity.toFixed(8),
          contributions: row.contributions,
        })),
        unresolved,
        included,
      };
    });
  }
  async replace(
    catalogueItemId: string,
    values: ReplaceMaterialLinksDto,
    actorId: string,
  ): Promise<IMaterialBreakdown> {
    this.validateLines(values.lines);
    await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(
        `catalogue-materials:${catalogueItemId}`,
        transaction,
      );
      await this.catalogue.getById(catalogueItemId, transaction);
      const latest = await this.repository.latestRevision(
        catalogueItemId,
        transaction,
      );
      if ((latest?.revision ?? 0) !== values.expectedRevision) {
        throw new ConflictException(
          'פירוט החומרים השתנה; יש לטעון את הגרסה העדכנית',
        );
      }
      const materials = await this.getMaterials(
        values.lines.map((line) => line.materialId),
        transaction,
      );
      if (materials.size !== values.lines.length) {
        throw new BadRequestException('חומר לא נמצא');
      }
      if (
        values.lines.some(
          (line) =>
            materials.get(line.materialId)?.status === MATERIAL_STATUS.INACTIVE,
        )
      ) {
        throw new BadRequestException('אי אפשר לשייך חומר לא פעיל');
      }
      await this.repository.replace(catalogueItemId, values.lines, transaction);
      await this.repository.recordRevision(
        catalogueItemId,
        values.expectedRevision + 1,
        values.lines.map((line) =>
          this.snapshotLine(line, materials.get(line.materialId)!),
        ),
        actorId,
        transaction,
      );
    });
    return this.getCurrent(catalogueItemId);
  }
  async refreshForMaterial(
    materialId: string,
    actorId: string,
    transaction: Transaction,
  ): Promise<void> {
    const itemIds = await this.repository.linkedCatalogueItemIds(
      materialId,
      transaction,
    );
    for (const itemId of itemIds) {
      await this.transactions.lockKey(
        `catalogue-materials:${itemId}`,
        transaction,
      );
      const latest = await this.repository.latestRevision(itemId, transaction);
      const links = await this.repository.list(itemId, transaction);
      const materials = await this.getMaterials(
        links.map((link) => link.materialId),
        transaction,
      );
      await this.repository.recordRevision(
        itemId,
        (latest?.revision ?? 0) + 1,
        links.map((link) =>
          this.snapshotLine(link, materials.get(link.materialId)!),
        ),
        actorId,
        transaction,
      );
    }
  }
  private async getMaterials(
    ids: string[],
    transaction?: Transaction,
  ): Promise<Map<string, Material>> {
    const rows = await this.materials.findByIds(ids, transaction);
    return new Map(rows.map((material) => [material.id, material]));
  }
  private validateLines(lines: MaterialLinkDto[]): void {
    const materialIds = lines.map((line) => line.materialId);
    const orders = lines.map((line) => line.displayOrder);
    if (
      new Set(materialIds).size !== lines.length ||
      new Set(orders).size !== lines.length
    ) {
      throw new BadRequestException('חומר או סדר תצוגה כפול');
    }
    for (const line of lines) {
      const measured = line.basis === MATERIAL_BASIS.PROJECT_MEASUREMENT;
      const quantity = line.quantityPerItem;
      if (measured && quantity != null) {
        throw new BadRequestException('כמות מדידה נקבעת בפרויקט ולא בקטלוג');
      }
      if (
        !measured &&
        (quantity == null || !new Decimal(quantity).greaterThan(0))
      ) {
        throw new BadRequestException(
          'כמות חומר ליחידת קטלוג חייבת להיות חיובית',
        );
      }
    }
  }
  private snapshotLine(
    line: MaterialLinkDto,
    material: Material,
  ): IMaterialSnapshotLine {
    return {
      materialId: material.id,
      code: material.code,
      name: material.name,
      category: material.category,
      specification: material.specification,
      unit: material.unit,
      status: material.status,
      basis: line.basis,
      quantityPerItem: line.quantityPerItem ?? null,
      displayOrder: line.displayOrder,
      notes: line.notes ?? '',
    };
  }
  private materialDetails(material: Material): IMaterialDetails {
    return {
      id: material.id,
      code: material.code,
      name: material.name,
      category: material.category,
      specification: material.specification,
      unit: material.unit,
      status: material.status,
    };
  }
}
