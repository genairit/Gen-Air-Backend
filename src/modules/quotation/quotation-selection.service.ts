import {
  CATALOGUE_STATUS,
  QUOTATION_DECIMAL as Decimal,
} from './constants/quotation.constant';

import {
  quotationItemSnapshot,
  assertUniqueQuotationIds,
  validateQuotationAccessories,
} from './utilities/quotation-selection.utility';

import { Injectable, BadRequestException } from '@nestjs/common';
import { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import { isCompatible } from '@Modules/catalogue-item/utilities/catalogue-ranking.utility';
import type { IQuotationSelectionRequest } from './interfaces/quotation-selection.interface';
import type { IQuotationItem } from '@Modules/quotation-item/interfaces/quotation-item.interface';
import { CatalogueItemUsageService } from '@Modules/catalogue-item-usage/catalogue-item-usage.service';

@Injectable()
export class QuotationSelectionService {
  constructor(
    private readonly catalogue: CatalogueItemService,
    private readonly usage: CatalogueItemUsageService,
  ) {}
  async snapshots(
    request: IQuotationSelectionRequest,
  ): Promise<IQuotationItem[]> {
    const { current, input, userId, transaction } = request;
    const selections = input.sections.flatMap((section) =>
      section.items.map((item, displayOrder) => ({
        section,
        item,
        displayOrder,
      })),
    );
    assertUniqueQuotationIds(input.sections.map((section) => section.id));
    assertUniqueQuotationIds(selections.map((selection) => selection.item.id));
    const previous = new Map(
      current.sections
        .flatMap((section) => section.items)
        .map((item) => [item.id, item]),
    );
    const catalogueItems = await this.catalogue.getByIds(
      selections.map((selection) => selection.item.catalogueItemId),
      transaction,
    );
    const catalogueById = new Map(
      catalogueItems.map((item) => [item.id, item]),
    );
    const snapshots = selections.map(({ section, item, displayOrder }) => {
      if (!new Decimal(item.quantity).gt(0)) {
        throw new BadRequestException('כמות חייבת להיות גדולה מאפס');
      }
      const catalogue = catalogueById.get(item.catalogueItemId);
      if (!catalogue) {
        throw new BadRequestException('פריט קטלוג לא נמצא');
      }
      const old = previous.get(item.id) ?? null;
      const same = old?.catalogueItemId === item.catalogueItemId;
      if (!same && catalogue.status !== CATALOGUE_STATUS.ACTIVE) {
        throw new BadRequestException('פריט זה אינו זמין לבחירה');
      }
      if (!isCompatible(catalogue, section.systemType)) {
        throw new BadRequestException('הפריט אינו מתאים לסוג המערכת');
      }
      if (catalogue.brand && input.brand && catalogue.brand !== input.brand) {
        throw new BadRequestException('יש לבחור פריט תואם לחברת המיזוג');
      }
      return quotationItemSnapshot({
        item,
        catalogue,
        previous: same ? old : null,
        sectionId: section.id,
        displayOrder,
      });
    });
    validateQuotationAccessories(snapshots);
    const orderedSelections = [...snapshots].sort(
      (a, b) =>
        a.catalogueItemId.localeCompare(b.catalogueItemId) ||
        a.id.localeCompare(b.id),
    );
    for (const snapshot of orderedSelections) {
      if (
        previous.get(snapshot.id)?.catalogueItemId !== snapshot.catalogueItemId
      ) {
        await this.usage.record(userId, snapshot.catalogueItemId, transaction);
      }
    }
    return snapshots;
  }
}
