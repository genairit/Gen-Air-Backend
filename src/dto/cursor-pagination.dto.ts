import { Type } from 'class-transformer';
import { IsCursor } from '@Decorators/is-cursor.decorator';
import { PAGINATION } from '@Constants/pagination.constant';
import { IsInt, Max, Min, IsString, IsOptional } from 'class-validator';

export class CursorPaginationDto {
  @IsOptional()
  @IsString()
  @IsCursor()
  declare batchCursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_BATCH_SIZE)
  declare batchSize?: number;
}
