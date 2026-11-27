import {
  IsIn,
  Matches,
  IsString,
  MaxLength,
  IsOptional,
} from 'class-validator';

import { OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { CatalogueUpdateDto } from './catalogue-query.dto';
import { SYSTEM_TYPES } from '@Modules/quotation/constants/quotation.constant';

export class CatalogueCreateDto extends OmitType(CatalogueUpdateDto, [
  'price',
  'unit',
  'description',
  'status',
] as const) {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  declare sku: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  declare description: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(40)
  declare unit: string;

  @Matches(/^\d{1,12}(?:\.\d{1,4})?$/)
  declare price: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  declare brand?: string;

  @IsOptional()
  @IsIn(SYSTEM_TYPES)
  declare systemType?: string | null;
}
