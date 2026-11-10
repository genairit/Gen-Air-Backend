import {
  Min,
  Max,
  IsInt,
  IsString,
  MaxLength,
  IsOptional,
} from 'class-validator';

import { Type } from 'class-transformer';

export class GetProjectQuotationsDto {
  @IsOptional() @IsString() @MaxLength(2000) declare batchCursor?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  declare batchSize?: number;
}
