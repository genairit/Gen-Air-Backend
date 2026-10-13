import {
  type PrioritySyncStatusType,
  PRIORITY_SYNC_STATUS_VALUES,
} from '../constants/priority-sync-status.constant';

import { CursorPaginationDto } from '@Dto/cursor-pagination.dto';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IsIn, IsString, MaxLength, IsOptional } from 'class-validator';

export class GetCustomersByFilterDto extends CursorPaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.SEARCH_QUERY)
  declare search?: string;

  @IsOptional()
  @IsIn(PRIORITY_SYNC_STATUS_VALUES)
  declare prioritySyncStatus?: PrioritySyncStatusType;
}
