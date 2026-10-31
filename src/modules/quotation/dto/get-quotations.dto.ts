import {
  Min,
  Max,
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  IsOptional,
} from 'class-validator';

import {
  QUOTATION_STATUSES,
  type TQuotationStatus,
} from '../constants/quotation.constant';

import { Type } from 'class-transformer';

export class GetQuotationsDto {
  @IsOptional() @IsString() @MaxLength(200) declare search?: string;
  @IsOptional() @IsIn(QUOTATION_STATUSES) declare status?: TQuotationStatus;
  @IsOptional() @IsString() @MaxLength(2000) declare batchCursor?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  declare batchSize?: number;
}
