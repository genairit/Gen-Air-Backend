import {
  Min,
  IsInt,
  IsUUID,
  IsArray,
  Matches,
  IsString,
  MaxLength,
  IsOptional,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';
import { PURCHASE_QUANTITY_PATTERN } from '../constants/purchase-record.constant';

export class PurchaseRecordLineDto {
  @IsUUID()
  declare boqLineId: string;

  @Matches(PURCHASE_QUANTITY_PATTERN)
  declare quantity: string;

  @IsOptional()
  @Matches(/^\d{1,12}(?:\.\d{1,4})?$/)
  declare unitCost?: string;

  @IsOptional()
  @IsUUID()
  declare agreementId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  declare agreementVersion?: number;
}

export class CreatePurchaseRecordDto {
  @IsUUID()
  declare idempotencyKey: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRecordLineDto)
  declare lines: PurchaseRecordLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  declare supplierName?: string;

  @IsOptional()
  @IsUUID()
  declare supplierId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  declare orderDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  declare onBehalfOf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  declare exceptionReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  declare notes?: string;
}
