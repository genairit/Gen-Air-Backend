import {
  Max,
  Min,
  IsIn,
  IsInt,
  IsUUID,
  IsArray,
  Matches,
  IsString,
  MaxLength,
  ValidateIf,
  IsDateString,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';

import {
  SYSTEM_TYPES,
  MAX_SECTIONS,
  type TSystemType,
  MAX_ITEMS_PER_SECTION,
} from '../constants/quotation.constant';

import {
  PAYMENT_TERMS_VALUES,
  type PaymentTermsType,
} from '@Constants/payment-terms.constant';

import { Type } from 'class-transformer';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';

export class PaymentStageDto {
  @Matches(/^(?:100|[0-9]{1,2})(?:\.[0-9]{1,4})?$/)
  declare percent: string;
  @IsString()
  @MaxLength(300)
  declare text: string;
}
export class QuotationItemDto {
  @IsUUID()
  declare id: string;
  @IsUUID()
  declare catalogueItemId: string;
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  declare parentItemId: string | null;
  @IsString()
  @MaxLength(1000)
  declare description: string;
  @Matches(/^\d{1,12}(?:\.\d{1,4})?$/)
  declare quotedPrice: string;
  @Matches(/^\d{1,8}(?:\.\d{1,4})?$/)
  declare quantity: string;
  @IsString()
  @MaxLength(200)
  declare location: string;
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^[A-J]$/)
  declare circuit: string | null;
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(100000000)
  declare requestedCapacityBtu: number | null;
}
export class QuotationSectionDto {
  @IsUUID()
  declare id: string;
  @IsString()
  @MaxLength(200)
  declare title: string;
  @IsIn(SYSTEM_TYPES)
  declare systemType: TSystemType;
  @IsArray()
  @ArrayMaxSize(MAX_ITEMS_PER_SECTION)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  declare items: QuotationItemDto[];
}
export class CreateQuotationDto {
  @IsUUID()
  declare customerId: string;
  @ValidateIf((_o, v) => v != null)
  @IsUUID()
  declare projectId?: string | null;
}
export class SaveQuotationDto {
  @IsInt()
  @Min(1)
  declare version: number;
  @IsUUID()
  declare customerId: string;
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  declare projectId: string | null;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  declare date: string;
  @IsString()
  @MaxLength(100)
  declare brand: string;
  @ValidateIf((_o, v) => v !== null)
  @IsIn(PAYMENT_TERMS_VALUES)
  declare paymentTerms: PaymentTermsType | null;
  @IsString()
  @MaxLength(1000)
  declare paymentTermsNote: string;
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PaymentStageDto)
  declare paymentSchedule: PaymentStageDto[];
  @Matches(/^(?:100|[0-9]{1,2})(?:\.[0-9]{1,4})?$/)
  declare discountPercent: string;
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\d{1,14}(?:\.\d{1,2})?$/)
  declare targetPretaxAmount: string | null;
  @IsString()
  @MaxLength(5000)
  declare internalNotes: string;
  @IsArray()
  @ArrayMaxSize(MAX_SECTIONS)
  @ValidateNested({ each: true })
  @Type(() => QuotationSectionDto)
  declare sections: QuotationSectionDto[];
}
export class QuotationTransitionDto {
  @IsInt()
  @Min(1)
  declare version: number;
  @IsIn([
    QUOTATION_STATUS.DRAFT,
    QUOTATION_STATUS.REVIEW,
    QUOTATION_STATUS.APPROVED,
  ])
  declare status: 'draft' | 'review' | 'approved';
}
export class AcknowledgeWarningsDto {
  @IsInt()
  @Min(1)
  declare version: number;
  @IsArray()
  @ArrayMaxSize(12000)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  declare warningKeys: string[];
}
