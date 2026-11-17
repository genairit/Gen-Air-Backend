import {
  IsIn,
  IsUUID,
  Matches,
  IsString,
  MaxLength,
  IsOptional,
} from 'class-validator';

import { PURCHASE_RECORD_STATUS } from '../constants/purchase-record.constant';

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
}
