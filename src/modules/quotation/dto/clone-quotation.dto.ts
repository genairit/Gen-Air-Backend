import {
  Min,
  IsInt,
  IsUUID,
  IsArray,
  IsString,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

class CloneQuotationMappingDto {
  @IsUUID()
  declare sourceLineId: string;

  @IsUUID()
  declare targetCatalogueItemId: string;
}

export class CloneQuotationDto {
  @IsInt()
  @Min(1)
  declare sourceVersion: number;

  @IsString()
  @MaxLength(100)
  declare targetBrand: string;

  @IsArray()
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => CloneQuotationMappingDto)
  declare mappings: CloneQuotationMappingDto[];
}
