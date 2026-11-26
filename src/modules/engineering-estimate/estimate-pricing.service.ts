import {
  ESTIMATE_ACCESSORY,
  deriveEquipmentQuantities,
} from './quantity-rules';

import {
  ESTIMATE_SCOPE,
  ESTIMATE_LIMITS,
  ESTIMATE_LINE_SOURCE,
} from './constants/engineering-estimate.constant';

import type {
  IEstimateArea,
  IEstimateLine,
  TEstimateScope,
} from './interfaces/engineering-estimate.interface';

import {
  EQUIPMENT_ROLE,
  CATALOGUE_STATUS,
} from '@Modules/quotation/constants/quotation.constant';

import Decimal from 'decimal.js';
import { Transaction } from 'sequelize';
import { BadRequestException, Injectable } from '@nestjs/common';
import { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import type { CatalogueItem } from '@Modules/catalogue-item/entities/catalogue-item.entity';

interface IPriceInput {
  sku: string;
  quantity: string;
  area: IEstimateArea;
  provenance: string | null;
  item: CatalogueItem | null;
  source: IEstimateLine['source'];
}

export const estimateSubtotal = (lines: IEstimateLine[]): string =>
  lines
    .reduce(
      (total, line): Decimal => total.plus(line.total ?? '0'),
      new Decimal(0),
    )
    .toFixed(2);

const MAX_QUOTATION_QUANTITY = '99999999.9999';

const priceLine = ({
  area,
  sku,
  quantity,
  item,
  source,
  provenance,
}: IPriceInput): IEstimateLine => {
  const repeatedQuantity = new Decimal(quantity)
    .times(area.repeatCount)
    .toDecimalPlaces(4);
  if (repeatedQuantity.gt(MAX_QUOTATION_QUANTITY)) {
    throw new BadRequestException('כמות השורה לאחר ההכפלה גדולה מדי');
  }

  const unitPrice =
    item?.status === CATALOGUE_STATUS.ACTIVE ? item.price : null;
  return {
    areaId: area.id,
    areaName: area.name,
    sku,
    description: item?.description ?? sku,
    unit: item?.unit ?? '—',
    quantity: repeatedQuantity.toFixed(4),
    unitPrice,
    total:
      unitPrice === null ? null : repeatedQuantity.times(unitPrice).toFixed(2),
    catalogueItemId: item?.id ?? null,
    source,
    provenance,
  };
};

const EQUIPMENT_ROLES: readonly string[] = [
  EQUIPMENT_ROLE.INDOOR,
  EQUIPMENT_ROLE.OUTDOOR,
  EQUIPMENT_ROLE.UNIT,
];

@Injectable()
export class EstimatePricingService {
  constructor(private readonly catalogue: CatalogueItemService) {}

  async calculate(
    areas: IEstimateArea[],
    scope: TEstimateScope,
    transaction: Transaction,
  ): Promise<IEstimateLine[]> {
    const count = areas.reduce(
      (total, area): number => total + area.lines.length,
      0,
    );
    if (count > ESTIMATE_LIMITS.TOTAL_LINES) {
      throw new BadRequestException('נוספו יותר מדי שורות לכתב הכמויות');
    }

    const ids = [
      ...new Set(
        areas.flatMap((area): string[] =>
          area.lines.map((line): string => line.catalogueItemId),
        ),
      ),
    ];
    const catalogue = await this.catalogue.getByIds(ids, transaction);
    const byId = new Map(
      catalogue.map((item): [string, CatalogueItem] => [item.id, item]),
    );
    const derived = areas.flatMap((area) =>
      area.lines.flatMap((line) =>
        line.measurements
          ? deriveEquipmentQuantities({
              ...line.measurements,
              distribution:
                line.measurements.distribution.kind === 'duct'
                  ? { ...line.measurements.distribution, kind: 'duct' }
                  : { kind: line.measurements.distribution.kind },
            })
              .filter(({ catalogueCode }): boolean => {
                const catalogueItem = byId.get(line.catalogueItemId);
                const hasRemote =
                  catalogueCode === ESTIMATE_ACCESSORY.remote &&
                  catalogueItem?.includesRemote === true;
                const hasThermostat =
                  catalogueCode === ESTIMATE_ACCESSORY.thermostat &&
                  catalogueItem?.includesThermostat === true;
                return !hasRemote && !hasThermostat;
              })
              .map((result) => ({
                area,
                result,
                factor: line.quantity,
                provenance: line.id,
              }))
          : [],
      ),
    );
    const codes = [
      ...new Set(derived.map(({ result }): string => result.catalogueCode)),
    ];
    const byCode = new Map(
      (await this.catalogue.getActiveBySkus(codes, transaction)).map(
        (item): [string, CatalogueItem] => [item.sku, item],
      ),
    );
    const manual = areas.flatMap((area): IEstimateLine[] =>
      area.lines.flatMap((line): IEstimateLine[] => {
        const item = byId.get(line.catalogueItemId) ?? null;
        if (
          scope === ESTIMATE_SCOPE.INSTALLATION &&
          item &&
          EQUIPMENT_ROLES.includes(item.equipmentRole)
        ) {
          return [];
        }

        return [
          priceLine({
            area,
            item,
            quantity: line.quantity,
            sku: item?.sku ?? line.catalogueItemId,
            source: ESTIMATE_LINE_SOURCE.MANUAL,
            provenance: line.source ?? null,
          }),
        ];
      }),
    );
    const overrides = new Set(
      manual.map(({ areaId, sku }): string => JSON.stringify([areaId, sku])),
    );
    const ruleLines = derived
      .filter(
        ({ area, result }): boolean =>
          !overrides.has(JSON.stringify([area.id, result.catalogueCode])),
      )
      .map(({ area, result, factor, provenance }): IEstimateLine =>
        priceLine({
          area,
          item: byCode.get(result.catalogueCode) ?? null,
          sku: result.catalogueCode,
          quantity: new Decimal(result.quantity).times(factor).toString(),
          source: ESTIMATE_LINE_SOURCE.RULE,
          provenance,
        }),
      );
    return [...manual, ...ruleLines];
  }
}
