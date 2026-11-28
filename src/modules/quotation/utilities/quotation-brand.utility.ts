import type {
  SaveQuotationDto,
  QuotationSectionDto,
} from '../dto/save-quotation.dto';

import { BadRequestException } from '@nestjs/common';
import { SYSTEM_TYPE } from '../constants/quotation.constant';

export interface IQuotationBrandGroups {
  brands: string[];
  sections: (QuotationSectionDto & { brand: string | null })[];
}

export const quotationSectionBrand = (
  section: QuotationSectionDto,
  legacyBrand: string,
): string | null =>
  'brand' in section ? (section.brand ?? null) : legacyBrand || null;

export const resolveQuotationBrandGroups = (
  input: SaveQuotationDto,
  existing: readonly Pick<
    QuotationSectionDto,
    'id' | 'floorId' | 'floorName'
  >[] = [],
): IQuotationBrandGroups => {
  const brands = input.brands ?? (input.brand ? [input.brand] : []);
  const hasInvalidBrand = brands.some(
    (brand) => !brand.trim() || brand !== brand.trim(),
  );
  const hasDuplicateBrand = new Set(brands).size !== brands.length;

  if (
    hasInvalidBrand ||
    hasDuplicateBrand ||
    (brands[0] ?? '') !== input.brand
  ) {
    throw new BadRequestException('קבוצות חברות המיזוג אינן תקינות');
  }

  const existingById = new Map(
    existing.map((section) => [section.id, section]),
  );
  const floors = new Map<string, { name: string; order: number }>();
  const sections = input.sections.map((section) => {
    const brand = quotationSectionBrand(section, input.brand);

    if (brand === null && section.systemType !== SYSTEM_TYPE.GENERAL) {
      throw new BadRequestException('פריטים כלליים חייבים להיות במערכת כללית');
    }

    if (brand !== null && !brands.includes(brand)) {
      throw new BadRequestException('מערכת שייכת לחברה שאינה בהצעה');
    }

    // Older clients omit both fields. An explicit null pair removes an assignment.
    const assignment =
      section.floorId === undefined && section.floorName === undefined
        ? existingById.get(section.id)
        : section;
    const floorId = assignment?.floorId ?? null;
    const floorName = assignment?.floorName?.trim() ?? null;
    if (
      (floorId === null) !== (floorName === null) ||
      floorName === '' ||
      (floorId && !brand)
    ) {
      throw new BadRequestException('שיוך הקומה של המערכת אינו תקין');
    }
    if (floorId && floorName) {
      const floor = floors.get(floorId);
      if (floor && floor.name !== floorName) {
        throw new BadRequestException(
          'למערכות באותה קומה יש לציין שם קומה זהה',
        );
      }
      if (!floor) floors.set(floorId, { name: floorName, order: floors.size });
    }
    return { ...section, brand, floorId, floorName };
  });

  const groupOrder = (brand: string | null): number =>
    brand === null ? brands.length : brands.indexOf(brand);
  const floorOrder = (section: (typeof sections)[number]): number =>
    section.floorId ? floors.get(section.floorId)!.order : floors.size;
  return {
    brands,
    sections: sections.sort(
      (left, right) =>
        floorOrder(left) - floorOrder(right) ||
        groupOrder(left.brand) - groupOrder(right.brand),
    ),
  };
};
