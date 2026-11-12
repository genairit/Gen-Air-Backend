import {
  PROJECT_BOQ_REVIEW,
  PROJECT_BOQ_COST_PATTERN,
  PROJECT_BOQ_QUANTITY_PATTERN,
} from '../constants';

import {
  Min,
  IsIn,
  IsInt,
  IsUUID,
  Matches,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class GenerateProjectBoqDto {
  @IsUUID()
  declare quotationId: string;
  @IsInt()
  @Min(1)
  declare quotationVersion: number;
  @IsInt()
  @Min(0)
  declare expectedRevision: number;
  @Matches(/^[a-f0-9]{64}$/)
  declare previewFingerprint: string;
}

export class PreviewProjectBoqDto {
  @IsUUID()
  declare quotationId: string;
}

export class UpdateProjectBoqLineDto {
  @IsInt()
  @Min(1)
  declare expectedRevision: number;
  @ValidateIf((_object, value) => value !== null)
  @Matches(PROJECT_BOQ_QUANTITY_PATTERN)
  declare requiredQuantity: string | null;
  @ValidateIf((_object, value) => value !== null)
  @Matches(PROJECT_BOQ_COST_PATTERN)
  declare estimatedUnitCost: string | null;
  @IsIn(Object.values(PROJECT_BOQ_REVIEW))
  declare reviewState: string;
  @IsString()
  @MaxLength(1000)
  declare notes: string;
}

export class AddProjectBoqLineDto extends UpdateProjectBoqLineDto {
  @IsUUID()
  declare materialId: string;
  @IsString()
  @MaxLength(200)
  declare systemTitle: string;
  @IsString()
  @MaxLength(300)
  declare componentTitle: string;
}
