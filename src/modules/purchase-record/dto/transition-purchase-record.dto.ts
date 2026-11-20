import {
  Min,
  IsIn,
  IsInt,
  IsUUID,
  Matches,
  IsArray,
  IsString,
  MaxLength,
  IsOptional,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';
import { PURCHASE_RECORD_STATUS } from '../constants/purchase-record.constant';

export class OrderAgreementLineDto {
  @IsUUID()
  declare recordLineId: string;
  @IsUUID()
  declare agreementId: string;
  @IsInt()
  @Min(1)
  declare agreementVersion: number;
  @Matches(/^\d{1,12}(?:\.\d{1,4})?$/)
  declare unitCost: string;
}

export class TransitionPurchaseRecordDto {
  @IsUUID()
  declare idempotencyKey: string;

  @IsIn(Object.values(PURCHASE_RECORD_STATUS))
  declare status: string;

  @IsString()
  @MaxLength(1000)
  declare reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  declare supplierName?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  declare orderDate?: string;

  @IsOptional()
  @IsUUID()
  declare supplierId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderAgreementLineDto)
  declare lines?: OrderAgreementLineDto[];
}
