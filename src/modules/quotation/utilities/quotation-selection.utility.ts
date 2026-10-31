import {
  CONTROL_KIND,
  EQUIPMENT_ROLE,
  QUOTATION_DECIMAL as Decimal,
} from '../constants/quotation.constant';

import { BadRequestException } from '@nestjs/common';
import type { IQuotationSnapshotInput } from '../interfaces/quotation-selection.interface';
import type { IQuotationItem } from '@Modules/quotation-item/interfaces/quotation-item.interface';
import type { ICatalogueItem } from '@Modules/catalogue-item/interfaces/catalogue-item.interface';

const catalogueControlKind = (item: ICatalogueItem): string | null => {
  if (item.equipmentRole !== EQUIPMENT_ROLE.CONTROL) {
    return null;
  }
  return /^שלט/.test(item.description)
    ? CONTROL_KIND.REMOTE
    : CONTROL_KIND.THERMOSTAT;
};
export const quotationItemSnapshot = (
  input: IQuotationSnapshotInput,
): IQuotationItem => {
  const { item, catalogue, previous, sectionId, displayOrder } = input;
  const source = previous ?? catalogue;
  return {
    id: item.id,
    sectionId,
    catalogueItemId: catalogue.id,
    parentItemId: item.parentItemId,
    sku: source.sku,
    description: item.description.trim() || source.description,
    unit: source.unit,
    quotedPrice: item.quotedPrice,
    quantity: item.quantity,
    equipmentRole: source.equipmentRole,
    equipmentType: previous
      ? previous.equipmentType
      : (catalogue.equipmentTypes[0] ?? null),
    capacityBtu: source.capacityBtu,
    requestedCapacityBtu: item.requestedCapacityBtu,
    location: item.location,
    circuit: item.circuit,
    displayOrder,
    controlKind: previous
      ? previous.controlKind
      : catalogueControlKind(catalogue),
    catalogueStatus: catalogue.status,
    cataloguePreference: previous
      ? previous.cataloguePreference
      : catalogue.preference,
    includesRemote: source.includesRemote,
    includesThermostat: source.includesThermostat,
    createdAt: previous?.createdAt ?? new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
};
export const assertUniqueQuotationIds = (ids: string[]): void => {
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException('מזהי השורות חייבים להיות שונים');
  }
};
export const validateQuotationAccessories = (items: IQuotationItem[]): void => {
  for (const item of items) {
    if (!item.parentItemId) {
      continue;
    }
    const parent = items.find(
      (candidate) =>
        candidate.id === item.parentItemId &&
        candidate.sectionId === item.sectionId,
    );
    if (
      !parent ||
      parent.parentItemId ||
      parent.equipmentRole !== EQUIPMENT_ROLE.INDOOR ||
      item.equipmentRole !== EQUIPMENT_ROLE.CONTROL
    ) {
      throw new BadRequestException(
        'אביזר חייב להיות מקושר ליחידה פנימית באותה מערכת',
      );
    }
    if (
      (parent.includesRemote && item.controlKind === CONTROL_KIND.REMOTE) ||
      (parent.includesThermostat &&
        item.controlKind === CONTROL_KIND.THERMOSTAT)
    ) {
      throw new BadRequestException(
        'הבקר כבר כלול במחיר היחידה; אין לחייב פעמיים',
      );
    }
    if (!new Decimal(parent.quantity).eq(item.quantity)) {
      throw new BadRequestException('כמות הבקרים צריכה להתאים לכמות היחידות');
    }
  }
};
