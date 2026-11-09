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

  const sections = input.sections.map((section) => {
    const brand = quotationSectionBrand(section, input.brand);

    if (brand === null && section.systemType !== SYSTEM_TYPE.GENERAL) {
      throw new BadRequestException('פריטים כלליים חייבים להיות במערכת כללית');
    }

    if (brand !== null && !brands.includes(brand)) {
      throw new BadRequestException('מערכת שייכת לחברה שאינה בהצעה');
    }

    return { ...section, brand };
  });

  return { brands, sections };
};
