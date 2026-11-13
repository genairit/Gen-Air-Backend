import {
  Min,
  Max,
  IsIn,
  IsInt,
  IsUUID,
  Matches,
  IsArray,
  IsString,
  MaxLength,
  IsOptional,
  ValidateIf,
  ArrayMaxSize,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';

import {
  MATERIAL_BASES,
  MATERIAL_UNITS,
  MATERIAL_STATUSES,
  type MaterialUnitType,
  type MaterialBasisType,
  type MaterialStatusType,
} from '../constants/material.constant';

import { Type } from 'class-transformer';

export class MaterialQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  declare search?: string;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  declare category?: string;
  @IsOptional()
  @IsIn(MATERIAL_STATUSES)
  declare status?: MaterialStatusType;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  declare limit?: number;
}

export class CreateMaterialDto {
  @Matches(/^[A-Z0-9][A-Z0-9-]{1,99}$/)
  declare code: string;
  @IsString()
  @MaxLength(200)
  declare name: string;
  @IsString()
  @MaxLength(100)
  declare category: string;
  @IsOptional()
  @IsString()
  @MaxLength(300)
  declare specification?: string | null;
  @IsIn(MATERIAL_UNITS)
  declare unit: MaterialUnitType;
  @IsIn(MATERIAL_STATUSES)
  declare status: MaterialStatusType;
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  declare notes?: string;
}

export class UpdateMaterialDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  declare name?: string;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  declare category?: string;
  @IsOptional()
  @IsString()
  @MaxLength(300)
  declare specification?: string | null;
  @ValidateIf((values: UpdateMaterialDto) => Reflect.has(values, 'status'))
  @IsIn(MATERIAL_STATUSES)
  declare status?: MaterialStatusType;
  @ValidateIf((values: UpdateMaterialDto) => Reflect.has(values, 'notes'))
  @IsString()
  @MaxLength(1000)
  declare notes?: string;
}

export class MaterialLinkDto {
  @IsUUID()
  declare materialId: string;
  @IsIn(MATERIAL_BASES)
  declare basis: MaterialBasisType;
  @IsOptional()
  @Matches(/^\d{1,10}(?:\.\d{1,4})?$/)
  declare quantityPerItem: string | null;
  @IsInt()
  @Min(0)
  declare displayOrder: number;
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  declare notes?: string;
}

export class ReplaceMaterialLinksDto {
  @IsInt()
  @Min(0)
  declare expectedRevision: number;
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MaterialLinkDto)
  declare lines: MaterialLinkDto[];
}

export class MaterialPreviewItemDto {
  @IsUUID()
  declare catalogueItemId: string;
  @Matches(/^\d{1,8}(?:\.\d{1,4})?$/)
  declare quantity: string;
}

export class MaterialPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MaterialPreviewItemDto)
  declare items: MaterialPreviewItemDto[];
}
