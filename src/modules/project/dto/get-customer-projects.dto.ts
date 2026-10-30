import {
  Max,
  Min,
  IsInt,
  IsUUID,
  IsString,
  MaxLength,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';

import { Type } from 'class-transformer';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { CUSTOMER_PROJECT_PAGINATION } from '../constants/customer-project.constant';

export class GetCustomerProjectsDto {
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.SEARCH_QUERY)
  declare search?: string;

  @IsOptional()
  @IsUUID()
  declare stageId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CUSTOMER_PROJECT_PAGINATION.MAX_CURSOR_LENGTH)
  declare batchCursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CUSTOMER_PROJECT_PAGINATION.MAX_SIZE)
  declare batchSize?: number;
}
