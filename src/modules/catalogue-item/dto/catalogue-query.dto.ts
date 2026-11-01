import {
  Min,
  Max,
  IsIn,
  IsInt,
  Matches,
  IsString,
  MaxLength,
  IsOptional,
  ValidateIf,
} from 'class-validator';

import {
  SYSTEM_TYPES,
  EQUIPMENT_ROLES,
} from '@Modules/quotation/constants/quotation.constant';

import {
  CATALOGUE_STATUS,
  CATALOGUE_PREFERENCE,
} from '@Modules/quotation/constants/quotation.constant';

import { Type } from 'class-transformer';

export class CatalogueQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  declare search?: string;
  @IsOptional()
  @IsIn(SYSTEM_TYPES)
  declare systemType?: string;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  declare brand?: string;
  @IsOptional()
  @IsIn(EQUIPMENT_ROLES)
  declare equipmentRole?: string;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  declare equipmentType?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000000)
  declare capacityBtu?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  declare limit?: number;
}
export class CatalogueUpdateDto {
  @ValidateIf((object: object) => Reflect.has(object, 'price'))
  @Matches(/^\d{1,12}(?:\.\d{1,4})?$/)
  declare price?: string;
  @ValidateIf((object: object) => Reflect.has(object, 'unit'))
  @IsString()
  @MaxLength(40)
  declare unit?: string;
  @ValidateIf((object: object) => Reflect.has(object, 'status'))
  @IsIn([
    CATALOGUE_STATUS.ACTIVE,
    CATALOGUE_STATUS.ARCHIVED,
    CATALOGUE_STATUS.NO_SELL,
  ])
  declare status?: string;
  @ValidateIf((object: object) => Reflect.has(object, 'description'))
  @IsString()
  @MaxLength(1000)
  declare description?: string;
  @ValidateIf((object: object) => Reflect.has(object, 'preference'))
  @IsIn([CATALOGUE_PREFERENCE.USED, CATALOGUE_PREFERENCE.LESS, ''])
  declare preference?: string;
}
