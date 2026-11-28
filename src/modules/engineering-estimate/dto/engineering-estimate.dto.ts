import {
  Min,
  Max,
  IsIn,
  IsInt,
  IsUUID,
  Matches,
  IsArray,
  IsObject,
  IsNumber,
  IsString,
  IsBoolean,
  MaxLength,
  IsDefined,
  ValidateIf,
  IsOptional,
  ArrayUnique,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';

import {
  ESTIMATE_SCOPE,
  ESTIMATE_LIMITS,
  ESTIMATE_SETUP_STEP,
} from '../constants/engineering-estimate.constant';

import type {
  TEstimateScope,
  TEstimateSetupStep,
} from '../interfaces/engineering-estimate.interface';

import { Type } from 'class-transformer';
import { CursorPaginationDto } from '@Dto/cursor-pagination.dto';

export class ListEngineeringEstimatesDto extends CursorPaginationDto {
  @IsOptional()
  @IsUUID()
  declare projectId?: string;
}

export class CreateEngineeringEstimateDto {
  @IsString()
  @Matches(/\S/u)
  @MaxLength(ESTIMATE_LIMITS.NAME)
  name!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;
}

export class EstimateVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number;
}

class EstimateDistributionDto {
  @IsIn(['none', 'manifold', 'duct'])
  kind!: 'none' | 'manifold' | 'duct';

  @ValidateIf(({ kind }: EstimateDistributionDto): boolean => kind === 'duct')
  @IsString()
  @Matches(/^[\p{L}\p{N}_ -]+$/u)
  @MaxLength(200)
  catalogueCode!: string;

  @ValidateIf(({ kind }: EstimateDistributionDto): boolean => kind === 'duct')
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(ESTIMATE_LIMITS.MAX_QUANTITY)
  metres!: number;

  @ValidateIf(({ kind }: EstimateDistributionDto): boolean => kind === 'duct')
  @IsInt()
  @Min(0)
  @Max(ESTIMATE_LIMITS.MAX_QUANTITY)
  bends!: number;
}

class EstimateMeasurementDto {
  @IsIn([
    'mini-central',
    'vrf-wall',
    'vrf-concealed',
    'vrf-cassette',
    'vrf-outdoor',
    'other',
  ])
  equipment!:
    | 'mini-central'
    | 'vrf-wall'
    | 'vrf-concealed'
    | 'vrf-cassette'
    | 'vrf-outdoor'
    | 'other';

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(ESTIMATE_LIMITS.MAX_QUANTITY)
  pipeMetresIncludingRise!: number;

  @IsBoolean()
  shelterSupply!: boolean;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => EstimateDistributionDto)
  distribution!: EstimateDistributionDto;
}

export class EstimateLineDto {
  @IsUUID()
  id!: string;

  @IsUUID()
  catalogueItemId!: string;

  @IsString()
  @Matches(/^(?=.*[1-9])\d{1,6}(?:\.\d{1,4})?$/u)
  quantity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(ESTIMATE_LIMITS.SOURCE)
  source?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EstimateMeasurementDto)
  measurements?: EstimateMeasurementDto;
}

export class EstimateAreaDto {
  @IsUUID()
  id!: string;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(ESTIMATE_LIMITS.NAME)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(ESTIMATE_LIMITS.MAX_REPEATS)
  repeatCount!: number;

  @IsArray()
  @ArrayMaxSize(ESTIMATE_LIMITS.AREA_LINES)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => EstimateLineDto)
  lines!: EstimateLineDto[];
}

export class EstimateQuestionDto {
  @IsUUID()
  id!: string;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(ESTIMATE_LIMITS.SOURCE)
  prompt!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/\S/u, { each: true })
  @MaxLength(ESTIMATE_LIMITS.NAME, { each: true })
  options!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(ESTIMATE_LIMITS.NAME)
  answer!: string | null;
}

export class UpdateEngineeringEstimateDto extends EstimateVersionDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(ESTIMATE_LIMITS.NAME)
  name?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsIn(Object.values(ESTIMATE_SCOPE))
  scope?: TEstimateScope;

  @IsOptional()
  @IsIn(Object.values(ESTIMATE_SETUP_STEP))
  setupStep?: TEstimateSetupStep;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ESTIMATE_LIMITS.AREAS)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => EstimateAreaDto)
  areas?: EstimateAreaDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ESTIMATE_LIMITS.QUESTIONS)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => EstimateQuestionDto)
  questions?: EstimateQuestionDto[];
}

class EstimateSketchSampleDto {
  @IsUUID()
  areaId!: string;

  @IsUUID()
  planId!: string;
}

export class EstimateSketchDto extends EstimateVersionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ArrayUnique(
    (sample: EstimateSketchSampleDto | null) => sample?.areaId ?? null,
  )
  @ArrayUnique(
    (sample: EstimateSketchSampleDto | null) => sample?.planId ?? null,
  )
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => EstimateSketchSampleDto)
  samples!: EstimateSketchSampleDto[];
}

export class EstimateQuotationDto extends EstimateVersionDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;
}

export class EstimateLinkPlanDto extends EstimateVersionDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,200}$/u)
  fileId!: string;
}

export class EstimateUploadPlanDto extends EstimateVersionDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  marked?: string;
}
